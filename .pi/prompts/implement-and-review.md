---
description: Flock implementation workflow with delegated review and fix pass
argument-hint: "<task>"
---

Use the `subagent` tool with `agentScope: "both"` and the `chain` parameter to execute this workflow:

1. Use the `ic-dev` agent to implement: $ARGUMENTS
2. Use the `ic-review` agent to review the implementation from the previous step via `{previous}`.
3. Use the `ic-dev` agent to address any blocking review findings from the previous step via `{previous}`. If the review verdict is CLEAN, this step should only report that no fix pass was needed.

Execute this as a chain. Pass output between steps via `{previous}`.
