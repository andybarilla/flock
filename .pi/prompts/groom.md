---
description: Groom GitHub issues toward a ready-for-agent queue target
argument-hint: "[--target 6] [--batch 10]"
---

Use the `groom` skill to inspect and classify this repository's GitHub issue backlog.

Arguments:

$ARGUMENTS

Default behavior:

- target ready-for-agent depth: `6`
- max unlabelled issues per pass: `10`
- measure before changing anything
- classify only issues with no state label
- require an agent-ready brief before applying `ready-for-agent`
- do not implement, merge, or close issues except when explicitly justified by the grooming workflow
