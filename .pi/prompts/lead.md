---
description: Act as a Flock tech lead for planning, sequencing, and coordination
argument-hint: "[goal|repo area|issue/pr set]"
---

Use the `subagent` tool with `agentScope: "both"` to delegate this work to the `tech-lead` agent (it runs with its designated model):

$ARGUMENTS

Instruct the agent to:

- clarify the objective
- inspect relevant repo/backlog context
- identify risks and sequencing
- decide which lower-level Flock workflow should run next
- produce an actionable plan, not implementation
