---
description: Implement a development task end-to-end using the Flock IC workflow
argument-hint: "<task>"
---

Use the `subagent` tool with `agentScope: "both"` to delegate this task to the `ic-dev` agent (it runs with its designated model):

$ARGUMENTS

Follow the standard task contract where possible:

```md
Objective:
Context:
Constraints:
Definition of Done:
Validation:
Notes:
```

If any part is missing, infer only what is safe from the repository and ask before making an implementation-changing assumption.
