---
description: Create or update this repo's Flock project configuration
argument-hint: "[inspect|write|check]"
---

Use the `project-config` skill to create, update, or check this repository's Flock project configuration.

Request:

${ARGUMENTS:-inspect and propose a project config}

Default behavior:

- inspect the repo before asking questions
- write config to `docs/flock/project.md` only with user approval
- record tracker labels, branch policy, validation commands, PR/review/merge policy, and workflow defaults
- do not invent labels, gates, or merge policy
