// No model calls or live-session interaction. Uses the installed Pi loader.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root, 'temp'), { recursive: true });
const fixture = mkdtempSync(join(root, 'temp', 'config-test-'));
process.env.PI_CODING_AGENT_DIR = join(fixture, 'agent');
mkdirSync(process.env.PI_CODING_AGENT_DIR);
const host = process.argv[2];
assert.ok(host, 'Pass the installed pi-coding-agent package directory.');
const { loadExtensions } = await import(pathToFileURL(join(host, 'dist/core/extensions/loader.js')).href);
const loaded = await loadExtensions([join(root, 'index.ts')], root);
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 1);
const ext = loaded.extensions[0];
assert.ok(ext.commands.has('snippets'));
assert.ok(ext.shortcuts.has('alt+s'));
assert.equal(ext.tools.size, 0);

const files = readdirSync(join(root, 'snippets')).filter(f => f.endsWith('.md')).sort();
assert.deepEqual(files, ['01-diagnosis.md', '02-delegate.md', '03-clarify.md', '04-task-breakdown.md',
  '05-workflow.md', '06-handoff.md', '07-task-sync.md', '08-lark-sync.md', '09-pr-sync.md', '10-qa-sync.md', '11-browser.md']);
// The menu is the single entry point: no prompt shortcut duplicates a snippet body.
assert.ok(!existsSync(join(root, 'prompts')));
assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).pi.prompts, undefined);
const bodies = new Map(files.map(f => [f, readFileSync(join(root, 'snippets', f), 'utf8').split(/\r?\n---\r?\n/)[1].trim()]));
// Filenames now follow menu order, so one list drives files, names, and navigation.
const expectedNames = ['Diagnosis', 'Delegate', 'Clarify', 'Task Breakdown', 'Workflow', 'Handoff', 'Task Sync', 'Lark Sync', 'PR Sync', 'QA Sync', 'Browser'];
const expectedCategories = ['development', 'development', 'advanced-development', 'advanced-development',
  'advanced-development', 'general', 'project-management', 'project-management', 'project-management',
  'project-management', 'tools'];
const expectedOrders = [10, 20, 10, 20, 30, 10, 10, 20, 30, 40, 10];
const menuOrder = expectedNames;
const selectKeys = (name, preview = false) => {
  const index = menuOrder.indexOf(name);
  assert.ok(index >= 0);
  return [...Array(index).fill('\x1b[B'), ' ', ...(preview ? ['\t', '\x1b'] : []), '\r'];
};
for (const [index, file] of files.entries()) {
  const raw = readFileSync(join(root, 'snippets', file), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(raw.includes(`name: ${expectedNames[index]}\n`));
  assert.ok(raw.includes(`order: ${expectedOrders[index]}\n`));
  assert.ok(raw.includes('placement: prepend\n'));
  assert.ok(raw.includes(`category: ${expectedCategories[index]}\n`));
  assert.ok(!/[\u4e00-\u9fff]/.test(raw));
}
// Each snippet names the skill or agent it hands off to, and nothing else claims that job.
assert.match(bodies.get('01-diagnosis.md'), /diagnosing-bugs/);
assert.match(bodies.get('02-delegate.md'), /pi-subagents `subagent`/);
assert.match(bodies.get('02-delegate.md'), /`async: true`/);
assert.match(bodies.get('03-clarify.md'), /grilling/);
for (const skill of ['to-spec', 'to-tickets', 'plane-cli']) assert.ok(bodies.get('04-task-breakdown.md').includes(skill));
assert.match(bodies.get('05-workflow.md'), /`subagent` tool with `workflowScript`/);
assert.match(bodies.get('05-workflow.md'), /`async: true`/);
assert.match(bodies.get('06-handoff.md'), /handoff/);
assert.match(bodies.get('07-task-sync.md'), /plane-cli/);
assert.match(bodies.get('08-lark-sync.md'), /lark-skill/);
assert.match(bodies.get('10-qa-sync.md'), /qa-acceptance/);
assert.match(bodies.get('11-browser.md'), /ego-browser/);
assert.doesNotMatch(bodies.get('02-delegate.md'), /node_modules/);
// Bodies stay one instruction long, and carry no invented schedule or ceremony.
for (const [file, body] of bodies) {
  assert.ok(body.split(/\n\s*\n/).length === 1, `${file} should be a single paragraph`);
  assert.ok(!/five minutes|explicitly selected/.test(body), `${file} carries retired wording`);
}
const renders = [];
const widgets = new Map();
const notifications = [];
let keys = [];
const theme = { fg: (_color, text) => text, bold: text => text };
const ctx = {
  mode: 'tui', hasUI: true,
  ui: {
    theme,
    setWidget: (id, value) => widgets.set(id, value),
    notify: (text, level) => notifications.push({ text, level }),
    custom: async factory => {
      let result;
      const component = factory({ terminal: { rows: 40 }, requestRender() {} }, theme, {}, value => { result = value; });
      renders.push(component.render(100).join('\n'));
      for (const key of keys) {
        component.handleInput(key);
        renders.push(component.render(100).join('\n'));
      }
      assert.notEqual(result, undefined, 'Test menu must close explicitly.');
      return result;
    },
  },
};
const emit = async (event, payload = {}) => {
  let result;
  for (const handler of ext.handlers.get(event) ?? []) result = await handler(payload, ctx);
  return result;
};
const menu = () => ext.commands.get('snippets').handler('', ctx);
const input = text => emit('input', { text, source: 'interactive' });

await emit('session_start');
assert.equal(await input('Unmodified task'), undefined);
// Preview the first everyday item, then select modes across a category boundary.
keys = ['\t', '\x1b', ...Array(5).fill('\x1b[B'), ' ', '\x1b[B', ' ', '\r'];
await menu();
assert.ok(renders.some(text => text.includes('Preview: Diagnosis')));
for (const name of expectedNames) assert.ok(renders[0].includes(name));
// Titles name the group only: adding a snippet must not require editing index.ts.
const sectionTitles = ['BASIC DEVELOPMENT', 'ADVANCED DEVELOPMENT', 'GENERAL', 'PROJECT MANAGEMENT'];
for (const title of sectionTitles) assert.ok(renders[0].includes(title));
for (let i = 1; i < sectionTitles.length; i++) {
  assert.ok(renders[0].indexOf(sectionTitles[i - 1]) < renders[0].indexOf(sectionTitles[i]));
}
const renderedNames = renders[0].split('\n').filter(line => line.includes('[ ]')).map(line => line.split('[ ] ')[1].split(' — ')[0]);
assert.deepEqual(renderedNames, menuOrder);
for (const retired of ['One Concept at a Time', 'Execute the Agreed Plan', 'Source Before Claims',
  'Smallest Useful Version', 'Evidence-Based Delivery', 'Parallel', 'Large Workflow', 'PR Monitor', 'Discuss']) {
  assert.ok(!renders[0].includes(retired), `Retired item still appears: ${retired}`);
}
assert.ok(widgets.get('prompt-snippets').join('\n').includes('Handoff'));
// Cancelling an edit to selections preserves the previous confirmed selection.
keys = [' ', '\x1b'];
await menu();
assert.deepEqual(await input('TEST TASK'), {
  action: 'transform', text: [bodies.get('06-handoff.md'), bodies.get('07-task-sync.md'), 'TEST TASK'].join('\n\n'),
});
assert.equal(widgets.get('prompt-snippets'), undefined);
assert.equal(await input('NEXT TASK'), undefined);
// Clarify injects the clarification skill request.
keys = selectKeys('Clarify', true);
await menu();
assert.ok(renders.some(text => text.includes('Preview: Clarify')));
assert.deepEqual(await input('Clarify this feature'), {
  action: 'transform', text: [bodies.get('03-clarify.md'), 'Clarify this feature'].join('\n\n'),
});
assert.equal(await input('Next request after claim'), undefined);
// A new session clears selection state.
keys = [' ', '\r'];
await ext.shortcuts.get('alt+s').handler(ctx);
await emit('session_start');
assert.equal(await input('NEW SESSION TASK'), undefined);
// The added planning mode appears in the menu and injects only its own body.
keys = selectKeys('Task Breakdown', true);
await menu();
assert.ok(renders.some(text => text.includes('Preview: Task Breakdown')));
assert.ok(widgets.get('prompt-snippets').join('\n').includes('Task Breakdown'));
assert.deepEqual(await input('Plan the agreed feature'), {
  action: 'transform', text: [bodies.get('04-task-breakdown.md'), 'Plan the agreed feature'].join('\n\n'),
});
assert.equal(await input('Next request'), undefined);
// Sync prompts invoke the installed skill entry points.
keys = selectKeys('Task Sync', true);
await menu();
assert.ok(renders.some(text => text.includes('Preview: Task Sync')));
assert.ok(widgets.get('prompt-snippets').join('\n').includes('Task Sync'));
assert.deepEqual(await input('List my assigned tasks'), {
  action: 'transform', text: [bodies.get('07-task-sync.md'), 'List my assigned tasks'].join('\n\n'),
});
assert.equal(await input('Unrelated next request'), undefined);
// Verify the PR Sync UI path without calling GitHub.
keys = selectKeys('PR Sync', true);
await menu();
assert.ok(renders.some(text => text.includes('Preview: PR Sync')));
assert.ok(widgets.get('prompt-snippets').join('\n').includes('PR Sync'));
assert.deepEqual(await input('Reply to the named PR review'), {
  action: 'transform', text: [bodies.get('09-pr-sync.md'), 'Reply to the named PR review'].join('\n\n'),
});
assert.equal(await input('Next unrelated task'), undefined);
// Navigation must follow rendered groups even when categories reuse order numbers.
for (const name of menuOrder) {
  keys = selectKeys(name, true);
  const before = renders.length;
  await menu();
  assert.ok(renders.slice(before).some(text => text.includes(`Preview: ${name}`)));
  const file = files[expectedNames.indexOf(name)];
  assert.deepEqual(await input('Current task'), {
    action: 'transform', text: [bodies.get(file), 'Current task'].join('\n\n'),
  });
  assert.equal(await input('Next task without selection'), undefined);
}
// Non-interactive hosts receive a useful warning, not a modal or model call.
ctx.mode = 'rpc';
await menu();
assert.equal(notifications.at(-1).text, 'Snippet menu requires interactive mode');

// Config is optional, never created, and re-read when opening the menu.
ctx.mode = 'tui';
const configPath = join(process.env.PI_CODING_AGENT_DIR, 'pi-prompt-snippets.json');
assert.equal(existsSync(configPath), false);
const dirs = [join(fixture, 'one'), join(fixture, 'two')];
for (const [i, dir] of dirs.entries()) {
  mkdirSync(dir);
  writeFileSync(join(dir, 'same.md'), `---\nname: Custom ${i}\n---\nCustom body ${i}`);
}
writeFileSync(configPath, JSON.stringify({ snippetDirectories: [...dirs, dirs[0]] }));
keys = [' ', '\x1b[B', ' ', '\r'];
await menu();
assert.ok(renders.at(-1).includes('Custom 0'));
assert.ok(renders.at(-1).includes('Custom 1'));
const expanded = await input('Task');
assert.ok(expanded.text.includes('Custom body 0'));
assert.ok(expanded.text.includes('Custom body 1'));
const child = join(dirs[0], 'child');
const grandchild = join(child, 'grandchild');
mkdirSync(grandchild, { recursive: true });
writeFileSync(join(child, 'same.md'), '---\nname: Child snippet\n---\nChild body');
writeFileSync(join(grandchild, 'deep.md'), '---\nname: Too deep\n---\nDeep body');
writeFileSync(configPath, JSON.stringify({ snippetDirectories: [dirs[0], child] }));
keys = ['\x1b'];
const firstRender = renders.length;
await menu();
const recursiveMenu = renders[firstRender];
assert.ok(recursiveMenu.includes('Custom 0'));
assert.ok(recursiveMenu.includes('Child snippet'));
assert.ok(recursiveMenu.includes('Too deep')); // Explicit child root includes its own children.
assert.equal(recursiveMenu.match(/Child snippet/g)?.length, 1);
writeFileSync(configPath, JSON.stringify({ snippetDirectories: [dirs[0]] }));
const shallowRender = renders.length;
await menu();
assert.ok(renders[shallowRender].includes('Child snippet'));
assert.ok(!renders[shallowRender].includes('Too deep'));
writeFileSync(configPath, JSON.stringify({ snippetDirectories: [] }));
await menu();
assert.equal(notifications.at(-1).text, 'No prompt snippets are installed');
for (const config of [{}, { snippetDirectories: ['relative'] }, { snippetDirectories: [42] }]) {
  writeFileSync(configPath, JSON.stringify(config));
  await assert.rejects(menu, /absolute directory paths/);
}
writeFileSync(configPath, '{');
await assert.rejects(menu, SyntaxError);
rmSync(fixture, { recursive: true });

console.log(JSON.stringify({
  result: 'PASS', snippets: files.length, menuModes: expectedNames,
  checks: ['real Pi loader', 'command and shortcut registration', 'preview rendering',
    'selection and cancellation', 'mode/task insertion order', 'post-send reset',
    'session reset', 'RPC menu warning', 'menu-only entry point (no duplicate prompt shortcut)',
    'pi-subagents subagent and workflowScript routing contracts (prompt text only)',
    'Task Breakdown menu preview and input expansion', 'eleven-mode grouped menu and retired-item exclusion',
    'Task Sync preview and input expansion (no Plane API calls)',
    'Lark Sync skill routing and input expansion (no Lark API calls)',
    'PR Sync preview and instruction expansion (no GitHub API calls)',
    'Clarify skill selection (prompt text only)',
    'Delegate subagent invocation (prompt text only)',
    'short fixed prompts with installed skill references',
    'group-consistent keyboard navigation and input order', 'English metadata and stable ordering'],
  modelCalls: 0, liveTerminalVisualQA: 'not performed',
}, null, 2));
