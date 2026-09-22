---
description: Act as a Flock engineering manager for repo/team status, queue health, blockers, and next action
argument-hint: "[status|plan|repo/team focus]"
---

Use the `engineering-manager` skill to assess and coordinate this engineering work:

${ARGUMENTS:-status and recommended next action}

Default behavior:

- check project config status
- inspect backlog/ready queue health when GitHub is available
- inspect open PR/review bottlenecks when GitHub is available
- identify blockers and WIP risks
- recommend the next Flock workflow
- do not implement code
