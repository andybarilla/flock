---
description: Run a bounded Flock operator cycle or trusted multi-step loop
argument-hint: "[--dry-run|--plan] [--loop] [--yes] [--max-cycles <n>] [--max-issues <n>] [--max-groom-batches <n>] [--max-triage-issues <n>] [--max-runtime <duration>]"
---

Use the `operator-run` skill to run a bounded Flock operator decision cycle or trusted multi-step loop for this repository.

Arguments:

$ARGUMENTS

Default behavior:

- inspect repository state, GitHub access, worktree state, project config, ready queue, triage queue, likely grooming need, and open PR/review bottlenecks as needed
- read `docs/flock/project.md` when present; always read it before any mutating action and report when it is missing
- in dry-run/plan mode, do not mutate files, branches, labels, comments, pull requests, or issues
- in dry-run/plan mode, recommend exactly one next action: `groom`, `work`, `review PR`, `triage`, `stop`, or `ask human`
- in one-shot mode, require `--yes` or explicit human confirmation before mutation
- in loop mode, require `--loop`, explicit limits such as `--max-cycles <n>`, max issues, max grooming, max triage, and max runtime from user arguments or project config
- refuse mutation when project config is missing or the Operator Approval Policy does not explicitly allow the selected approval category
- execute one delegated action per cycle; one-shot stops after the first cycle, and loop mode repeats safe cycles only until explicit limits or a stop condition is reached
- prefer dispatching one ready issue through the existing `issue-loop` workflow when issue selection is allowed and ready work exists
- otherwise consider one bounded triage action, one bounded grooming action, or one PR review only when policy and limits allow
- preserve validation, review, branch safety, PR, and tracker completion behavior from the delegated workflow
- merge only under an explicit conditional Merge approval policy in project config: squash merge of green PRs opened by the operator in the current run, verified before issue close; all other PRs remain human-merged
- stop and report clearly on dirty worktree, ambiguity, failed validation, blocking review, review cannot run, auth failure, unexpected branch state, blocked issue work, missing policy, queue empty, configured limits, or any safety concern
- finish with a stage-by-stage summary and, in loop mode, a final run log with every cycle, action, issue/PR references, validation result, review verdict, tracker changes, stop reason, and next recommended human action
- Do not claim validation, review, tracker changes, or tracker completion occurred unless command output was observed from the delegated workflow
