---
description: "Full Flock implementation workflow: scout gathers context, planner creates plan, ic-dev implements"
argument-hint: "<task>"
---

Use the `subagent` tool with `agentScope: "both"` and the `chain` parameter to execute this workflow:

1. Use the `scout` agent to find code relevant to: $ARGUMENTS
2. Use the `planner` agent to create an implementation plan for `$ARGUMENTS` using the previous result via `{previous}`.
3. Use the `ic-dev` agent to implement the plan using the previous result via `{previous}`.

Execute this as a chain. Pass output between steps via `{previous}`.
