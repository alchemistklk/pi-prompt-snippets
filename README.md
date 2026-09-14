# Pi Prompt Snippets

Mix, preview, and apply reusable prompt instructions before sending a task in Pi. The package includes eleven workflow-oriented snippets grouped by purpose.

## Install

```sh
pi install npm:pi-prompt-snippets
```

Restart Pi or run `/reload` after installation.

## Menu

| Group | Snippet | Hands off to |
| --- | --- | --- |
| Basic Development | Diagnosis | `diagnosing-bugs` |
| | Delegate | pi-subagents `subagent` with `async: true` |
| Advanced Development | Clarify | inline grilling fast path |
| | Task Breakdown | `to-spec` → `to-tickets` → `plane-cli` |
| | Workflow | pi-subagents `workflowScript` with `async: true` and task-specific dependencies |
| General | Handoff | inline handoff fast path |
| Project Management | Task Sync | `plane-cli` |
| | Lark Sync | `lark-skill` |
| | PR Sync | installed GitHub tools |
| | QA Sync | `qa-acceptance` |
| Tools | Browser | `ego-browser` |

Use no snippet for ordinary direct work.

## Use

Open `/snippets` or press `Alt+S`. Arrows navigate, Space selects, Tab previews, Enter applies. Then send your task normally. Selecting several snippets combines their instructions, in menu order, ahead of your text.

Selections reset after each message and at session start. This is prompt guidance, not a runtime permission gate.

The menu is the only entry point. Snippet bodies live in exactly one place, so there are no `/delegate-work` or `/workflow` shortcuts to drift from them.

## Maintenance

Names, descriptions, and prompts are English. Response language follows the user.

Snippet definitions are Markdown files under `snippets/`. Filenames, `category`, and `order` control menu order. Edits load when the menu reopens; extension code changes require `/reload`.

Keep outcome, completion criteria, and user-specific constraints in snippets; leave task-specific methods to the agent and consult skills for the guidance the task needs. Delegate and Workflow explicitly select async execution. Clarify ends when the decisions needed for the next step are resolved. Handoff targets the next session's focus and links existing artifacts. The snippet bodies are authoritative for execution details. Model, context and concurrency defaults belong in settings.

The published package contains only the extension, its bundled snippets, documentation, and license. It performs no network requests or subprocess execution.

## Validation

The local test harness uses Pi's real extension loader and a simulated UI to check menu order, navigation, preview, insertion/reset, English text, and each snippet's skill or tool reference:

```sh
with-env node test.mjs /absolute/path/to/node_modules/@earendil-works/pi-coding-agent
```

It makes no model calls and starts no subagents. It verifies loading and prompt insertion, not model behavior.
