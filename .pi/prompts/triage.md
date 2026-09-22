---
description: Resolve needs-triage issues into ready, blocked, human, info, or explicit decision states
argument-hint: "[#issue|--batch 5] [--dry-run|--yes]"
---

Use the `triage` skill to resolve this repository's `needs-triage` issues:

$ARGUMENTS

Default behavior:

- read project config before applying defaults
- inspect issue body and comments before changing anything
- act first as product manager, then as tech lead
- move issues out of `needs-triage` when no specific product or technical decision remains
- distinguish dependency blocking from triage and use `blocked` when documented
- require an agent-ready brief before applying `ready-for-agent`
- do not implement, merge, or close issues
