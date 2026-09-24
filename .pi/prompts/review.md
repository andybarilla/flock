---
description: Review code changes using the Flock IC review workflow
argument-hint: "[diff|PR|instructions]"
---

Use the `subagent` tool with `agentScope: "both"` to delegate this review to the `ic-review` agent (it runs with its designated model).

Scope:

${ARGUMENTS:-Review the current working tree and staged changes. Prefer explicit diffs or PRs when available.}

Instruct the agent to return actionable findings only, with a clear verdict.
