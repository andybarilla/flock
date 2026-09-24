---
description: Work ready-for-agent GitHub issues one at a time using the Flock issue loop
argument-hint: "[--label ready-for-agent] [--focus <label|issue-number>] [--limit N] [--yes]"
---

Use the `issue-loop` skill to work ready GitHub issues from this repository.

Arguments:

$ARGUMENTS

Default behavior:

- label: `ready-for-agent`
- limit: `1`
- `--focus <label|issue-number>`: scope ready-issue selection, composing with `--label` (not replacing it). A non-numeric value is a focus label: selection is scoped to issues carrying the focus label; an empty or nonexistent focus set stops cleanly with stop reason `focus queue empty` and never falls back to the general ready queue. A numeric value names an epic issue: selection is scoped to the epic's blocked-by dependency chain (queried via the GitHub blocked-by API, never parsed from issue bodies), members are worked in dependency order, still-blocked members are skipped with explicit `blocked by #N` lines and never dispatched before their open blockers, and the chain is re-evaluated before each selection so a blocker closed or merged during the run makes its dependents eligible; a dependency API error stops the run rather than guessing order
- attended mode: show the issue and branch strategy, then confirm before starting each issue unless `--yes` is present
- after acceptance, immediately work one issue in the same run through the `github-issue-worker` workflow
- after successful implementation, require the issue worker to run separate review when there is a PR or reviewable diff
- after successful implementation, observed validation, PR/update preparation when applicable, and non-blocking review, require explicit tracker completion rather than PR auto-close wording
- leave the tracker item open when work is blocked, validation fails, review is blocking, or review cannot run
- finish with a stage-by-stage summary that marks each stage as succeeded, skipped, or failed and gives any failed stage's stop reason
- include the issue number, branch name when available, PR link when available, validation result, review verdict, tracker completion result, and next recommended human action
- Do not claim validation, review, or tracker completion occurred unless command output was observed
- stop on ambiguity, failed verification, missing review target after implementation, dirty tree, or any safety concern
