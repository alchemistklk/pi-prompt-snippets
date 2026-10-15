import { readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

type Placement = "prepend" | "append";

interface Snippet {
	id: string;
	name: string;
	description: string;
	category: string;
	order: number;
	placement: Placement;
	body: string;
}

const ROOT = dirname(fileURLToPath(import.meta.url));
const SNIPPETS_DIR = join(ROOT, "snippets");
const WIDGET_ID = "prompt-snippets";
const CATEGORY_TITLES: Record<string, string> = {
	development: "BASIC DEVELOPMENT",
	"advanced-development": "ADVANCED DEVELOPMENT",
	general: "GENERAL",
	"project-management": "PROJECT MANAGEMENT",
	tools: "TOOLS",
};

function parseFrontmatter(id: string, source: string): Snippet | undefined {
	const parts = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/);
	if (!parts) return;
	const fields = new Map<string, string>();
	for (const line of parts[1].split(/\r?\n/)) {
		const pair = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
		if (pair) fields.set(pair[1].toLowerCase(), pair[2].replace(/^["']|["']$/g, ""));
	}
	const body = parts[2].trim();
	if (!body) return;
	const parsedOrder = Number.parseInt(fields.get("order") ?? "", 10);
	return {
		id,
		name: fields.get("name") || id.split(/[\\/]/).pop()!.replace(/\.md$/i, ""),
		description: fields.get("description") ?? "",
		category: fields.get("category") ?? "general",
		order: Number.isFinite(parsedOrder) ? parsedOrder : 9999,
		placement: fields.get("placement") === "append" ? "append" : "prepend",
		body,
	};
}

function snippetDirectories(): string[] {
	const configPath = join(getAgentDir(), "pi-prompt-snippets.json");
	let source: string;
	try {
		source = readFileSync(configPath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [SNIPPETS_DIR];
		throw error;
	}
	const config = JSON.parse(source);
	if (!config || !Array.isArray(config.snippetDirectories) ||
		!config.snippetDirectories.every((path: unknown) => typeof path === "string" && isAbsolute(path))) {
		throw new Error(`${configPath}: snippetDirectories must be an array of absolute directory paths`);
	}
	return [...new Set<string>(config.snippetDirectories)];
}

function snippetFiles(directory: string, depth = 0): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) return [path];
		if (entry.isDirectory() && depth === 0) return snippetFiles(path, depth + 1);
		return [];
	});
}

function readSnippets(): Snippet[] {
	const entries = [...new Set(snippetDirectories().flatMap((directory) => snippetFiles(directory)))]
		.map((path) => parseFrontmatter(path, readFileSync(path, "utf8")))
		.filter((entry): entry is Snippet => Boolean(entry));
	const categories = [...new Set(entries.map((entry) => entry.category))];
	const categoryRank = (category: string) => categories.indexOf(category);
	return entries.sort((a, b) => {
		if (a.placement !== b.placement) return a.placement === "prepend" ? -1 : 1;
		return categoryRank(a.category) - categoryRank(b.category) || a.order - b.order || a.name.localeCompare(b.name);
	});
}

export default function promptSnippets(pi: ExtensionAPI) {
	let selected = new Set<string>();
	let catalog: Snippet[] = [];

	const refresh = () => {
		catalog = readSnippets();
		const known = new Set(catalog.map((snippet) => snippet.id));
		selected = new Set([...selected].filter((id) => known.has(id)));
	};

	const updateWidget = (ctx: ExtensionContext) => {
		if (!ctx.hasUI || ctx.mode !== "tui") return;
		const active = catalog.filter((snippet) => selected.has(snippet.id));
		if (active.length === 0) {
			ctx.ui.setWidget(WIDGET_ID, undefined);
			return;
		}
		const prepends = active.filter((snippet) => snippet.placement === "prepend");
		const appends = active.filter((snippet) => snippet.placement === "append");
		ctx.ui.setWidget(WIDGET_ID, [
			...(prepends.length ? [ctx.ui.theme.fg("accent", `↑ prepend: ${prepends.map((item) => item.name).join(" · ")}`)] : []),
			...(appends.length ? [ctx.ui.theme.fg("warning", `↓ append: ${appends.map((item) => item.name).join(" · ")}`)] : []),
		]);
	};

	const openPicker = async (ctx: ExtensionContext) => {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("Snippet menu requires interactive mode", "warning");
			return;
		}
		refresh();
		if (catalog.length === 0) {
			ctx.ui.notify("No prompt snippets are installed", "warning");
			return;
		}
		const next = new Set(selected);
		const accepted = await ctx.ui.custom<boolean>((tui, theme, _keys, done) => {
			let cursor = 0;
			let preview = false;
			let previewOffset = 0;
			return {
				render(width: number) {
					const body: string[] = [];
					if (preview) {
						const item = catalog[cursor];
						body.push(theme.bold(item.name), theme.fg("dim", `${item.placement} · ${item.id}`), "");
						for (const line of item.body.split("\n")) body.push(...wrapTextWithAnsi(line, width));
						const available = Math.max(4, tui.terminal.rows - 9);
						previewOffset = Math.max(0, Math.min(previewOffset, Math.max(0, body.length - available)));
						body.splice(0, body.length, ...body.slice(previewOffset, previewOffset + available));
					} else {
						let category = "";
						catalog.forEach((item, index) => {
							if (item.category !== category) {
								category = item.category;
								if (body.length) body.push("");
								body.push(theme.fg("dim", CATEGORY_TITLES[category] ?? category.replace(/-/g, " ").toUpperCase()));
							}
							const pointer = index === cursor ? theme.fg("accent", "> ") : "  ";
							const box = next.has(item.id) ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
							const description = item.description ? theme.fg("dim", ` — ${item.description}`) : "";
							body.push(truncateToWidth(`${pointer}${box} ${theme.bold(item.name)}${description}`, width));
						});
					}
					const title = preview ? `Preview: ${catalog[cursor].name}` : "Prompt snippets";
					const help = preview ? "↑↓ scroll • Tab/Esc back" : "↑↓ navigate • Space toggle • Tab preview • Enter apply • Esc cancel";
					return [theme.fg("accent", "─".repeat(width)), ` ${theme.bold(title)}`, "", ...body, "", theme.fg("dim", ` ${help}`), theme.fg("accent", "─".repeat(width))];
				},
				invalidate() {},
				handleInput(data: string) {
					if (preview) {
						if (matchesKey(data, Key.up)) previewOffset--;
						else if (matchesKey(data, Key.down)) previewOffset++;
						else if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) preview = false;
						tui.requestRender();
						return;
					}
					if (matchesKey(data, Key.up)) cursor = (cursor - 1 + catalog.length) % catalog.length;
					else if (matchesKey(data, Key.down)) cursor = (cursor + 1) % catalog.length;
					else if (matchesKey(data, Key.space)) next.has(catalog[cursor].id) ? next.delete(catalog[cursor].id) : next.add(catalog[cursor].id);
					else if (matchesKey(data, Key.tab)) { preview = true; previewOffset = 0; }
					else if (matchesKey(data, Key.enter)) { done(true); return; }
					else if (matchesKey(data, Key.escape)) { done(false); return; }
					tui.requestRender();
				},
			};
		});
		if (accepted) selected = next;
		updateWidget(ctx);
	};

	pi.on("session_start", (_event, ctx) => {
		selected.clear();
		refresh();
		updateWidget(ctx);
	});

	pi.on("input", (event, ctx) => {
		if (selected.size === 0) return;
		refresh();
		const active = catalog.filter((snippet) => selected.has(snippet.id));
		selected.clear();
		updateWidget(ctx);
		if (active.length === 0) return;
		return {
			action: "transform" as const,
			text: [
				...active.filter((snippet) => snippet.placement === "prepend").map((snippet) => snippet.body),
				event.text,
				...active.filter((snippet) => snippet.placement === "append").map((snippet) => snippet.body),
			].join("\n\n"),
		};
	});

	pi.registerShortcut("alt+s", { description: "Toggle prompt snippets", handler: openPicker });
	pi.registerCommand("snippets", { description: "Open the prompt snippets menu", handler: async (_args, ctx) => openPicker(ctx) });
}
