---
description: Run one bounded Flock operator decision cycle
argument-hint: "[--dry-run|--plan] [--yes] [--max-issues 1] [--max-groom-batches 1] [--max-triage-issues 1]"
---

Use the `operator-run` skill to run one bounded Flock operator decision cycle for this repository.

Arguments:

$ARGUMENTS

Default behavior:

- inspect repository state, GitHub access, worktree state, project config, ready queue, triage queue, likely grooming need, and open PR/review bottlenecks as needed
- read `docs/flock/project.md` when present; always read it before any mutating action and report when it is missing
- in dry-run/plan mode, do not mutate files, branches, labels, comments, pull requests, or issues
- in dry-run/plan mode, recommend exactly one next action: `groom`, `work`, `review PR`, `triage`, `stop`, or `ask human`
- in one-shot mode, require `--yes` or explicit human confirmation before mutation
- refuse mutation when project config is missing or the Operator Approval Policy does not explicitly allow the selected approval category
- execute at most one delegated action, then stop
- prefer dispatching one ready issue through the existing `issue-loop` workflow when issue selection is allowed and ready work exists
- otherwise consider one bounded triage action, one bounded grooming action, or one PR review only when policy and limits allow
- preserve validation, review, branch safety, PR, and tracker completion behavior from the delegated workflow
- never auto-merge
- stop and report clearly on dirty worktree, ambiguity, failed validation, blocking review, auth failure, unexpected branch state, blocked issue work, missing policy, or any safety concern
- finish with a stage-by-stage summary of preflight, project policy gate, decision pass, dispatch, validation, review, tracker completion, stop reason, and next recommended human action
- Do not claim validation, review, tracker changes, or tracker completion occurred unless command output was observed from the delegated workflow
