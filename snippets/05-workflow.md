---
name: Workflow
description: Coordinate dependent work with upfront acceptance criteria
placement: prepend
category: advanced-development
order: 30
---

Use the installed `subagent` tool with `workflowScript` and `async: true`. Define each child's scope, deliverable, and acceptance criteria before launch. Run independent work concurrently within actual resource limits. Implementation dependencies gate coding; integration dependencies gate merging; acceptance dependencies gate completion. Let children choose their methods. Keep state compact, link reports as artifacts, and preserve completed results when a lane fails. Continue authorized work until the agreed outcome is verified or a concrete blocker requires user input. When only async work remains, yield and resume from native notifications. Consult the active pi-subagents skill for the API guidance needed.
