---
description: Work ready-for-agent GitHub issues one at a time using the Flock issue loop
argument-hint: "[--label ready-for-agent] [--limit N] [--yes]"
---

Use the `issue-loop` skill to work ready GitHub issues from this repository.

Arguments:

$ARGUMENTS

Default behavior:

- label: `ready-for-agent`
- limit: `1`
- attended mode: show the issue and branch strategy, then confirm before starting each issue unless `--yes` is present
- after acceptance, immediately work one issue in the same run through the `github-issue-worker` workflow
- stop on ambiguity, failed verification, dirty tree, or any safety concern
