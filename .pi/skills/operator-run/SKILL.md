---
name: operator-run
description: Runs a bounded Flock operator cycle or multi-step loop, either read-only or mutating only when project policy explicitly allows it.
---

# Operator Run

Run a bounded Flock operator decision cycle or bounded multi-step loop.

The operator is an orchestrator. It inspects repository state, chooses safe next actions, delegates each action to the existing Flock workflow, records the observed result, and stops when limits or safety conditions require human judgment. It must not bypass validation, bypass review, or relax the safety defaults of `/work`, `/groom`, `/triage`, `/issue`, or review workflows. It must not merge except under an explicit conditional Merge approval policy in project config (see the merge rules below).

## Inputs

Parse user arguments for:

- `--dry-run` or `--plan`: read-only planning only
- `--loop`: repeat safe one-cycle dispatches until a limit or stop condition is reached
- `--yes`: opt into mutating automation when project policy permits each selected action
- `--max-cycles <n>`: maximum operator cycles in this run; default to project config, or `1` outside loop mode
- `--max-issues <n>`: max issues worked in this run
- `--max-groom-batches <n>`: max grooming batches in this run
- `--max-triage-issues <n>`: max triage issues in this run
- `--max-runtime <duration>`: max wall-clock runtime, such as `10m`; require an explicit value for loop mode unless project config supplies one
- `--label <label>`: ready issue label, default `ready-for-agent`

If parsing is ambiguous, ask before any mutation.

## 1. Preflight and project policy

Inspect the repository and tracker before every cycle:

```bash
git rev-parse --show-toplevel
gh repo view --json nameWithOwner,url
git status --short
git branch --show-current
test -f docs/flock/project.md && echo present || echo absent
```

If the worktree is dirty before dispatch, stop before mutation and report the dirty worktree. Dry-run may still report the dirty state as a blocker.

Before taking any mutating action, read `docs/flock/project.md` completely. One-shot and loop mutation require both:

1. project config exists, and
2. the config contains an `Operator Approval Policy` section that explicitly allows the selected approval category and limits.

When project config or approval policy is missing, dry-run planning is allowed but mutating one-shot or loop mode must fail with a clear stop reason. Do not infer approval from labels alone.

## 2. Read-only decision pass

Gather enough state to choose the next action without mutating:

```bash
gh issue list --state open --label ready-for-agent --json number,title,labels,updatedAt,url --limit 50
gh issue list --state open --label needs-triage --json number,title,labels,updatedAt,url --limit 50
gh issue list --state open --json number,title,labels,updatedAt,url --limit 50
gh pr list --state open --json number,title,url,headRefName,baseRefName,reviewDecision,statusCheckRollup --limit 20
```

If configured labels differ from defaults, use the labels from `docs/flock/project.md`.

Recommended action priority:

1. stop on dirty worktree, auth failure, missing required commands, or unexpected branch state
2. stop or route to review when review is blocking, review cannot run, or review is clearly the safest bottleneck
3. resume a prior run's merge step when an open PR meets the resume criteria below; run the merge step from section 6 instead of redispatching its issue
4. dispatch one ready issue when ready issues exist and issue selection for queued work is allowed
5. triage one `needs-triage` issue when triage labels/comments are allowed and the triage limit permits it
6. groom one bounded batch when grooming labels/comments are allowed and the grooming limit permits it
7. stop when the queue is empty or no safe action exists

Resume criteria — an open PR is a resume target only when all of these are observed: its head branch matches the configured issue branch pattern, its author is the authenticated account (`gh api user --jq .login`), its linked issue is open, it carries the `flock-operator-run` provenance marker comment (observed via `gh pr view <number> --comments`), and project config allows conditional merge. Branch shape and authorship alone never qualify a PR: the authenticated account is usually the maintainer's own, so without the provenance marker the PR stays human-merged. On resume, first dispatch the `pr-review` workflow for the PR — a fresh non-blocking verdict re-establishes review evidence, and a blocking verdict stops the run. Then run the section 6 merge step; do not redispatch the issue. A PR failing any criterion is not a resume target: never merge it, and ask a human when ownership is ambiguous.

This priority is a routing default only. Stop and ask if the safest action is ambiguous or issue scope is unclear.

## 3. Dry-run output

For `--dry-run` or `--plan`, do not mutate. Follow the read-only `operator-plan` contract: inspect repository identity, GitHub access, worktree safety, project config, ready queue, triage queue, likely grooming need, open PR/review bottlenecks, and blockers. Recommend exactly one next action: `groom`, `work`, `review PR`, `triage`, `stop`, or `ask human`. Explain why relevant alternatives were not selected.

Return a concise stage-by-stage plan with:

```md
Mode: dry-run
Repository: <owner/name>
Project config: <found/missing and approval policy summary>
Worktree: <clean|dirty; current branch>
GitHub access: <ok|failed>
Queues:
- Ready: <count and first issue when available>
- Triage: <count and first issue when available>
- Backlog/grooming: <short observed state>
PRs/review: <short observed state>
Recommended action: <groom|work|review PR|triage|stop|ask human>
Why this action: <one or two sentences>
Alternatives not selected: <brief bullets or "none">
Safety notes: <dirty tree, missing config, policy blockers, or "none">
Next command: <suggested Flock command, or "none">
Would mutate: no
Stop reason: dry-run plan completed
```

Do not claim validation, review, tracker changes, or completion in dry-run mode.

## 4. Mutation gate

For mutating one-shot or loop mode, require either `--yes` with an auto-approved policy category or an explicit human confirmation for an ask-approved policy category. Without `--yes`, show the selected action, why it was selected, the policy category that must allow it, the remaining limits, and ask the user before dispatching when policy permits asking.

Policy category checks:

- ready issue work requires `Issue selection for queued work` and must dispatch through the `issue-loop` workflow with `--yes --limit 1`
- triage requires `Triage labels/comments` and must dispatch through the `triage` workflow with a limit of one issue unless project policy/user limits are lower
- grooming requires `Grooming labels/comments` and must dispatch through the `groom` workflow for one bounded batch unless project policy/user limits are lower
- PR review must dispatch through the `pr-review` workflow for one PR, or `ic-review` only when reviewing a local diff; review must not merge
- merge requires the `Merge` policy category and is allowed only as a squash merge of a green PR opened by the operator in the current run, or of a green PR meeting the section 2 resume criteria (provenance marker observed, fresh non-blocking `pr-review` verdict in the resuming run). Green means, all observed from `gh` output: every `statusCheckRollup` entry successful (none pending or failing), `mergeable: MERGEABLE`, Flock review verdict non-blocking, and `reviewDecision: APPROVED` when required by branch protection (not required otherwise). The operator polls up to the configured max PR wait and stops with reason "PR not green" on timeout; it never waits indefinitely. Merge execution additionally requires the verified check-wait command recorded in project config; without it, the operator reports the PR state and stops for a human merge. Failing checks, merge conflicts, blocking review, missing/insufficient Merge policy, or any PR that is neither run-opened nor a qualified resume target each stop the run before any merge command. The issue is closed completed only after the merge is verified on the default branch.

Interpret the selected approval policy category explicitly:

- `auto-approve`, `allowed`, or equivalent approval language permits dispatch when the user supplied `--yes` and all limits pass
- `ask` or equivalent confirmation language permits dispatch only after the operator displays the selected action and receives explicit human confirmation; then pass `--yes` only to the delegated workflow so routine confirmations do not repeat
- `never`, `blocked`, missing, unclear, or policy language that does not cover the selected action blocks mutation

If the selected policy category exceeds configured limits, stop before mutation. Loop mode must also have an explicit max cycles limit and max runtime limit from user arguments or project config.

## 5. Dispatch exactly one workflow per cycle

Dispatch exactly one underlying workflow per cycle. Do not implement, groom, triage, or review directly in this skill.

Examples:

```md
Use the `issue-loop` skill to work ready GitHub issues from this repository.
Arguments: --label <label> --limit 1 --yes
```

```md
Use the `triage` skill to resolve needs-triage GitHub issues from this repository.
Arguments: --limit 1 --yes
```

```md
Use the `groom` skill to groom the GitHub issue backlog for this repository.
Arguments: --limit <configured batch size> --yes
```

The delegated workflow owns its normal safety checks, validation, review, PR handling, and tracker evidence reporting. Tracker completion ownership is split: when project config defers issue closure to post-merge, the delegated workflow leaves the issue open with completion evidence, and the operator performs `gh issue close <number> --reason completed` only after the merge is verified on the default branch. If the delegated workflow reports blocked or failed status, the operator must stop and report that result. Merge only under the conditional Merge policy rules above; never merge any other PR.

## 6. Merge step after a completed issue cycle

Run this step when a delegated issue workflow completed with a PR opened in the current run, or when a cycle resumes a prior run's PR per the section 2 resume criteria. Skip it for triage, grooming, and review cycles.

Preconditions — all must hold before any merge command:

1. the PR number was observed from the delegated workflow's output in this run, or the PR was selected via the section 2 resume criteria; never merge a PR that is neither run-opened nor a qualified resume target
2. project config contains a conditional `Merge` approval policy that allows merge
3. project config records a verified check-wait command; without it, report the PR state and stop for a human merge
4. review evidence is non-blocking: the delegated workflow reported non-blocking review this run, or — on resume — a fresh `pr-review` dispatch for the PR returned a non-blocking verdict in this run; a blocking verdict stops the run

When the delegated workflow reports an opened PR, immediately record provenance so a later stopped run can recognize it:

```bash
gh pr comment <number> --body 'flock-operator-run: opened by the Flock operator; eligible for conditional operator merge.'
```

Resume targets must carry this marker (section 2); a PR without it is never merged by the operator.

### Check-wait command

Use the verified check-wait command recorded in project config:

```bash
gh pr view <number> --json state,mergeable,reviewDecision,statusCheckRollup --jq '<green classifier recorded in project config>'
```

Classification results:

- `green`: every check satisfied (`SUCCESS`, `SKIPPED`, or `NEUTRAL`), no check pending, `mergeable: MERGEABLE`, and `reviewDecision` is `APPROVED` or empty (branch protection does not require review)
- `pending`: any check in progress/queued/expected, `mergeable: UNKNOWN`, or `reviewDecision: REVIEW_REQUIRED`
- `failing`: any check not satisfied — a `FAILURE`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED`, or `STARTUP_FAILURE` conclusion, a status context in `ERROR`, or any unrecognized typename, conclusion, or state (the classifier is fail-closed: unrecognized values never classify as `green`)
- `conflict`: `mergeable: CONFLICTING`
- `blocking-review`: `reviewDecision: CHANGES_REQUESTED`
- `unexpected-state:<state>`: the PR is not `OPEN`

If the check-wait command errors or returns no classification, treat the poll as inconclusive: keep polling until the max PR wait, then stop with `PR not green`. An inconclusive result never merges.

### Poll, then merge or stop

Poll the check-wait command every 60 seconds until the result is not `pending`, or the configured max PR wait elapses (default 15m).

- On `green`: squash-merge with `gh pr merge <number> --squash` and observe the output. Then verify: `gh pr view <number> --json state` reports `MERGED`. If the merge command fails, stop with `merge failed`. If the PR is not observed `MERGED` afterward, stop with `merge verification failed`. Never claim a merge that was not observed.
- On `failing`, `conflict`, `blocking-review`, or `unexpected-state`: stop with the matching reason (`checks failing`, `merge conflict`, `review blocking`, or `unexpected PR state`) before any merge command.
- On timeout while still `pending`: stop with `PR not green`. Leave the PR and issue open and the issue branch in place, and give a resumable handoff: the next recommended human action is to re-run the operator or merge manually once checks are green.

### Post-merge close and sync

After a verified merge:

1. sync the default branch: `git checkout main && git pull --ff-only` (or the configured default branch), and confirm the squash merge commit appears in `git log --oneline origin/<default> -5`
2. post the completion-evidence comment (issue number, branch, PR link, validation result, review verdict, merge commit) and close the issue: `gh issue close <number> --reason completed`

If the sync fails or the merge commit is absent, stop with `merge verification failed` and report the merged PR with the divergence. Claim tracker completion in the run log only from the observed close command output.

## 7. Loop continuation gate

When `--loop` is set, repeat the one-cycle process only while all conditions remain safe:

1. the prior delegated workflow succeeded without a blocking review, missing review, failed validation, unclear scope, failed tracker operation, or failed/blocked issue work, and the section 6 merge step either was not applicable or ended in a verified merge — any merge stop reason (`PR not green`, `checks failing`, `merge conflict`, `unexpected PR state`, `merge failed`, `merge verification failed`) ends the run instead of continuing
2. observed output includes the validation result, review verdict, tracker changes, issue/PR references, and delegated stop reason when applicable
3. counters remain under max cycles, max issues, max grooming batches, max triage issues, and max runtime
4. the repository returns to the expected safe state for the next action: clean worktree on the default branch, `git pull --ff-only` succeeds with HEAD matching `origin/<default>`, and no operator-created PR from this run remains open (the prior cycle's PR was merged and verified, or the cycle created no PR)
5. project policy still allows the next selected action

Before continuing to the next cycle, run:

```bash
git status --short
git branch --show-current
git fetch origin
git pull --ff-only
git rev-parse HEAD origin/<default-branch>
gh pr list --state open --json number,title,url,headRefName,baseRefName,reviewDecision,statusCheckRollup --limit 20
```

Confirm from the output: the worktree is clean, the current branch is the default branch from project config, local HEAD matches `origin/<default-branch>`, and no open PR head branch matches an issue branch from this run. If the run has more open PRs than the list limit, raise the limit so a run PR cannot be windowed out.

Stop instead of continuing when any of these occur: queue is empty, work is blocked, validation fails, review is blocking, review cannot run, a merge stop reason occurred, issue scope is unclear, worktree is dirty, auth fails, branch state is unexpected, required commands fail, project config or approval policy is insufficient, or configured limits are reached.

Do not continue after a failed or blocked issue in v1 unless project policy explicitly supports retries and the retry conditions are met. The default Flock retry policy is no retry.

## 8. Final run log

Return a stage-by-stage summary for one-shot mode, and a Final run log for loop mode. Mark each stage as succeeded, skipped, or failed. Failed stages must include a clear stop reason. Do not claim validation, review, tracker changes, or tracker completion unless command output from the underlying workflow was observed. A resume cycle (`action=resume`) counts toward max cycles and max issues like a work cycle.

```md
Mode: <dry-run|one-shot|loop>
Repository: <owner/name>
Project config: <found/missing and approval policy summary>
Limits: <max cycles/issues/grooming/triage/runtime and observed counters>
Chosen action: <work|triage|groom|review|stop|ask human>
Delegated workflow: <issue-loop|triage|groom|pr-review|ic-review|none>
Issue: #<number when available, or "none selected">
Branch: <branch name when available, or "not created">
PR: <PR link when available, or "not opened">
Validation: <observed result from delegated workflow, or "not run">
Review verdict: <observed verdict from delegated workflow, or "not run">
Merge verdict: <merged and verified|PR not green|checks failing|merge conflict|review blocking|unexpected PR state|merge failed|merge verification failed|not run>
Tracker completion: <observed completion result from delegated workflow or post-merge close, or "not run">
Tracker changes: <labels/comments/issues closed or "none observed">
Cycle log:
- Cycle <n>: action=<work|resume|triage|groom|review|stop>; issue=<#number|none>; PR=<url|none>; validation=<observed|not run>; review=<verdict|not run>; merge=<merged|not green|failed|not run>; tracker=<changes|none>; continue=<yes|no: reason>; result=<succeeded|blocked|failed|stopped>
Workflow summary:
- Preflight: <succeeded|skipped|failed> — <observed result or stop reason>
- Project policy gate: <succeeded|skipped|failed> — <observed result or stop reason>
- Decision pass: <succeeded|skipped|failed> — <observed result or stop reason>
- Dispatch: <succeeded|skipped|failed> — <delegated workflow result or stop reason>
- Loop continuation gate: <succeeded|skipped|failed> — <observed safe state or stop reason>
- Validation: <succeeded|skipped|failed> — <observed delegated result or not run>
- Review: <succeeded|skipped|failed> — <observed delegated result or not run>
- Merge step: <succeeded|skipped|failed> — <observed merge/verification result, stop reason, or not run>
- Tracker completion: <succeeded|skipped|failed> — <observed delegated result or not run>
Stop reason: <completed one-shot action|dry-run plan completed|queue empty|blocked|failed|review blocking|review cannot run|PR not green|checks failing|merge conflict|unexpected PR state|merge failed|merge verification failed|dirty worktree|unexpected branch|limit reached|human confirmation required|no safe action>
Next recommended human action: <merge/review/fix/configure/run suggested command/no action>
```

## Red flags

| Thought | Reality |
|---|---|
| "Loop means issue work can skip review until the end." | Each delegated issue workflow must preserve validation and review requirements before the loop can continue. |
| "The project has ready issues, so mutation is approved." | Mutation also requires config and approval policy for the selected action. |
| "I can implement the selected issue here." | Dispatch to `issue-loop`; underlying workflows own implementation. |
| "The operator can merge once checks look fine." | Merge only under an explicit conditional Merge policy: squash, green per the observed definition, run-opened or qualified resume-target PRs only, verified before issue close. Everything else stops for a human. |
| "A failed issue can be skipped so the loop keeps going." | Stop on failed or blocked issue in v1 unless explicit retry policy says otherwise. |
| "Dry-run changed labels/comments because it was harmless." | Dry-run is strictly read-only. |
