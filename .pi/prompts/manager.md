---
description: Act as a Flock engineering manager for repo/team status, queue health, blockers, and next action
argument-hint: "[status|plan|repo/team focus]"
---

Use the `subagent` tool with `agentScope: "both"` to delegate this work to the `engineering-manager` agent (it runs with its designated model):

${ARGUMENTS:-status and recommended next action}

Instruct the agent to:

- check project config status
- inspect backlog/ready queue health when GitHub is available
- inspect open PR/review bottlenecks when GitHub is available
- identify blockers and WIP risks
- recommend the next Flock workflow
- do not implement code
