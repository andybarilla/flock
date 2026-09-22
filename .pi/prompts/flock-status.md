---
description: Default Flock status/start command for repo health and next workflow routing
argument-hint: "[focus]"
---

Use the `flock-status` skill to report repository/Flock status and recommend the next command.

Focus:

${ARGUMENTS:-status}

Default behavior:

- inspect config, worktree, issues, and PRs as needed
- summarize readiness, blockers, and likely next workflow
- do not implement code or edit files
- do not use a `flock-status` agent; this command is skill-only
