---
description: "Flock read-only workflow: scout gathers context and planner creates implementation plan"
argument-hint: "<task>"
---

Use the `subagent` tool with `agentScope: "both"` and the `chain` parameter to execute this workflow:

1. Use the `scout` agent to find code relevant to: $ARGUMENTS
2. Use the `planner` agent to create an implementation plan for `$ARGUMENTS` using the previous result via `{previous}`.

Execute this as a chain. Do not implement.
