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

Resume criteria — an open PR is a resume target only when all of these are observed: its head branch matches the configured issue branch pattern, its author is the authenticated account (`gh api user --jq .login`), its linked issue is open, it carries the `flock-operator-run` provenance marker comment authored by the authenticated account (observed via `gh pr view <number> --json comments`, filtered to the authenticated login — a marker comment from any other author is meaningless and does not qualify the PR), and project config allows conditional merge. Branch shape and authorship alone never qualify a PR: the authenticated account is usually the maintainer's own, so without the self-authored provenance marker the PR stays human-merged. On resume, first re-establish validation and review evidence in the resuming run: re-run the configured gate command against the PR head (in the Herdr worktree if it still exists, otherwise in a fresh checkout of the PR branch) and stop on failure — the marker certifies only the verification legs observed when it was posted, which may predate validation — then dispatch the `pr-review` workflow for the PR; a fresh non-blocking verdict re-establishes review evidence, and a blocking verdict stops the run. Then run the section 6 merge step; do not redispatch the issue. A PR failing any criterion is not a resume target: never merge it, and ask a human when ownership is ambiguous.

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

- ready issue work requires `Issue selection for queued work` and must dispatch through the `issue-loop` workflow with `--yes --limit 1`, or through the section 5a Herdr worker dispatch when it is active
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

## 5a. Herdr worker dispatch (optional, issue work cycles only)

Herdr dispatch is an additional dispatch path for the `work` action: each worked issue runs in a nested pi session inside a Herdr worktree pane instead of the operator's own checkout. It activates only when both are true:

1. the operator itself runs inside Herdr: `test "${HERDR_ENV:-}" = 1`
2. project config contains a `Herdr` section defining a worktree pattern (branch, path, base)

If either is false, dispatch issue work through the normal in-session `issue-loop` flow exactly as section 5 describes; behavior outside Herdr is unchanged. Herdr dispatch never relaxes any gate: preflight, project policy, the mutation gate (including the `Issue selection for queued work` category check), dispatchability, validation, review, merge policy, and loop continuation gates all still apply. Triage, grooming, review, and merge steps always run in the operator's own session and checkout; only issue implementation moves into the nested worker.

### Dispatch sequence

Issue selection is unchanged from the in-session flow: the operator selects the single highest-priority ready issue from the section 2 decision pass and works exactly one issue per cycle. For each selected issue:

1. Create the worktree and its pane without stealing focus, using the config worktree pattern and binding to the operator's repository:

   ```bash
   herdr worktree create --cwd "$(git rev-parse --show-toplevel)" --branch flock/issue-<n>-<slug> --base <default-branch> --path <pattern-path> --label "issue-<n>" --no-focus
   ```

   Parse the JSON response for the workspace ID, root pane ID, and worktree path, and record all three in the run log. On command failure, stop with `worktree create failed` and report the error; do not retry with `--trust-repository`.

2. Start a named pi agent in the worktree pane:

   ```bash
   herdr agent start issue-<n> --kind pi --pane <pane-id>
   ```

   Any `herdr agent start` failure — `agent_not_ready` (including a block detected during startup), a command error, or an agent name collision left over from a prior stopped run — stops the run with `worker not ready`; never retry the start, and never start a second agent for the same issue. Never answer or dismiss the nested agent's approval or question UI with `send-keys`.

3. Submit the worker brief and wait, bounded by the per-issue worker timeout from project config (further bounded by remaining max runtime):

   ```bash
   herdr agent prompt issue-<n> "<worker brief>" --wait --timeout <per-issue-ms>
   ```

   The worker brief must instruct the nested session to work issue #<n> with the `github-issue-worker` workflow from the worktree cwd, state that the issue branch already exists and is checked out in the worktree (no new branch), confine all edits and commits to the worktree, push and open the PR from the issue branch, and write the structured handoff file (below) without committing it. Include the issue title and body, or instruct the worker to read them with `gh issue view <n> --comments`.

4. Interpret the outcome:

   - settled `idle`/`done`: read the handoff file (below). A missing or unparseable handoff stops with `worker handoff missing`.
   - prompt rejected with `agent_blocked`, or settled `blocked`: stop with `worker blocked`. Never answer the nested approval dialog, never `send-keys` past it, never re-prompt.
   - `timeout`: stop with `worker timeout`. A timeout does not prove the prompt was never delivered; do not re-submit.
   - `agent_prompt_stalled`: stop with `worker stalled`. A stall does not prove non-delivery; never re-prompt.
   - `agent_not_ready` at prompt time: stop with `worker not ready`.

   Each stop leaves the worktree, branch, and agent in place for human inspection (worktree cleanup is out of scope for the operator) and ends the run with the matching reason. `herdr agent read` may be used to capture diagnostic output for the stop report, but diagnostics never substitute for the handoff file or independent verification.

### Handoff file convention

The nested worker writes its final handoff to `<worktree-root>/.flock/handoff-issue-<n>.md`; the operator passes the absolute path in the worker brief. The file must contain the full `github-issue-worker` final handoff block (issue, branch, PR, validation, review verdict, tracker completion, stage summary) or, when blocked, the BLOCKED format with the same stage names. The worker never commits the handoff file. The supervisor reads the file directly from the filesystem.

### Independent verification

The supervisor never records worker claims from the handoff alone. Before recording branch, PR, validation, or review verdict in the run log, re-verify each from the operator's own session:

- Branch: `git ls-remote --heads origin <branch>` (or `gh api repos/<owner>/<repo>/branches/<branch> --jq .name`) shows the issue branch exists on the remote.
- PR: `gh pr list --state open --head <branch> --json number,url,headRefName,baseRefName,author` shows an open PR from the issue branch to the default branch authored by the authenticated account; then `gh pr view <number> --json state,mergeable,reviewDecision`. Once the PR is verified, immediately record the section 6 provenance marker on it — before the validation and review legs — so a stopped run never strands an unmarked operator PR.
- Validation: re-run the configured gate command (for example `npm run check`) in the worktree path and observe the output; also confirm `git -C <worktree> status --short` shows no unexpected uncommitted files (the handoff file excepted) and `git -C <worktree> log --oneline origin/<default>..HEAD` shows the work committed on the issue branch.
- Review verdict: never record the worker's claimed verdict from the handoff. Flock `pr-review`/`ic-review` verdicts are returned to the session and never submitted as GitHub reviews, so `reviewDecision` is normally empty and cannot verify a claim. Instead, the supervisor dispatches a fresh `pr-review` for the PR from its own session (as on resume in section 2) and observes the verdict directly; a blocking verdict stops the run with `review blocking`. A `CHANGES_REQUESTED` from `gh pr view <number> --json reviewDecision` also stops the run with `review blocking`, and if the supervisor's review cannot run, stop with `review cannot run`. The handoff's claimed verdict is cross-check evidence only: it must match the supervisor-observed verdict, and a mismatch stops with `worker claim mismatch`.

A claim that fails re-verification stops the run with `worker claim mismatch`, reporting the observed divergence. Only after all checks pass does the cycle count as a completed issue workflow: run the merge step when applicable, and evaluate the loop continuation gate.

## 6. Merge step after a completed issue cycle

Run this step when a delegated issue workflow completed with a PR opened in the current run, or when a cycle resumes a prior run's PR per the section 2 resume criteria. Skip it for triage, grooming, and review cycles.

Preconditions — all must hold before any merge command:

1. the PR number was observed from the delegated workflow's output in this run, from the supervisor's independent Herdr-dispatch verification (section 5a), or the PR was selected via the section 2 resume criteria; never merge a PR that is neither run-opened nor a qualified resume target
2. project config contains a conditional `Merge` approval policy that allows merge
3. project config records a verified check-wait command; without it, report the PR state and stop for a human merge
4. review evidence is non-blocking: the delegated workflow reported non-blocking review this run, the supervisor observed a non-blocking `pr-review` verdict under section 5a Herdr dispatch this run, or — on resume — a fresh `pr-review` dispatch for the PR returned a non-blocking verdict in this run; a blocking verdict stops the run
5. validation evidence: the configured gate command passed against the PR head in this run — observed from the delegated workflow's output, from the supervisor's section 5a worktree gate re-run, or from the section 2 resume gate re-run; missing or failed validation stops the run before any merge command

When the delegated workflow reports an opened PR, immediately record provenance so a later stopped run can recognize it (under Herdr dispatch, the section 5a PR verification leg records it before the validation and review legs); post it once — if the marker is already present from the section 5a PR verification leg, do not post a duplicate:

```bash
gh pr comment <number> --body 'flock-operator-run: opened by the Flock operator; eligible for conditional operator merge.'
```

The marker binds provenance through authorship: only the operator's authenticated account writes it, and resume checks both the marker and its author (section 2). A PR without a self-authored marker is never merged by the operator. The marker certifies provenance and the verification legs observed when it was posted; because it may be posted before the validation and review legs complete, resume always re-establishes validation and review evidence (section 2) before the merge step.

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
4. the repository returns to the expected safe state for the next action: clean worktree on the default branch, `git pull --ff-only` succeeds with HEAD matching `origin/<default>`, and no operator-created PR from this run remains open (the prior cycle's PR was merged and verified, or the cycle created no PR). Under Herdr dispatch the operator's own checkout never leaves the default branch; the nested worker's worktree and branch remain in place for inspection and do not dirty the operator checkout (worktree cleanup is a separate post-merge concern)
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

Stop instead of continuing when any of these occur: queue is empty, work is blocked, validation fails, review is blocking, review cannot run, a merge stop reason occurred, a Herdr worker stop reason occurred (`worker blocked`, `worker timeout`, `worker not ready`, `worker stalled`, `worker handoff missing`, `worker claim mismatch`, `worktree create failed`), issue scope is unclear, worktree is dirty, auth fails, branch state is unexpected, required commands fail, project config or approval policy is insufficient, or configured limits are reached.

Do not continue after a failed or blocked issue in v1 unless project policy explicitly supports retries and the retry conditions are met. The default Flock retry policy is no retry.

## 8. Final run log

Return a stage-by-stage summary for one-shot mode, and a Final run log for loop mode. Mark each stage as succeeded, skipped, or failed. Failed stages must include a clear stop reason. Do not claim validation, review, tracker changes, or tracker completion unless command output from the underlying workflow was observed. A resume cycle (`action=resume`) counts toward max cycles and max issues like a work cycle.

```md
Mode: <dry-run|one-shot|loop>
Repository: <owner/name>
Project config: <found/missing and approval policy summary>
Herdr dispatch: <enabled|disabled: missing HERDR_ENV=1 or missing config Herdr worktree pattern>
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
- Cycle <n>: action=<work|resume|triage|groom|review|stop>; issue=<#number|none>; agent=<issue-<n>|none>; pane=<pane-id|none>; workspace=<workspace-id|none>; worktree=<path|none>; handoff=<path|none>; PR=<url|none>; validation=<observed|not run>; review=<verdict|not run>; verification=<branch/PR/validation/review re-verified by supervisor|not run>; merge=<merged|not green|failed|not run>; tracker=<changes|none>; continue=<yes|no: reason>; result=<succeeded|blocked|failed|stopped>
Workflow summary:
- Preflight: <succeeded|skipped|failed> — <observed result or stop reason>
- Project policy gate: <succeeded|skipped|failed> — <observed result or stop reason>
- Decision pass: <succeeded|skipped|failed> — <observed result or stop reason>
- Dispatch: <succeeded|skipped|failed> — <delegated workflow result, Herdr worker result, or stop reason>
- Loop continuation gate: <succeeded|skipped|failed> — <observed safe state or stop reason>
- Validation: <succeeded|skipped|failed> — <observed delegated result or not run>
- Review: <succeeded|skipped|failed> — <observed delegated result or not run>
- Merge step: <succeeded|skipped|failed> — <observed merge/verification result, stop reason, or not run>
- Tracker completion: <succeeded|skipped|failed> — <observed delegated result or not run>
Stop reason: <completed one-shot action|dry-run plan completed|queue empty|blocked|failed|review blocking|review cannot run|PR not green|checks failing|merge conflict|unexpected PR state|merge failed|merge verification failed|worker blocked|worker timeout|worker not ready|worker stalled|worker handoff missing|worker claim mismatch|worktree create failed|dirty worktree|unexpected branch|limit reached|human confirmation required|no safe action>
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
| "The nested worker's handoff says validation passed." | The supervisor never records worker claims from the handoff alone; re-verify branch, PR, validation, and review verdict via `gh`/`git` and a gate re-run first. |
| "The worker is stuck on an approval dialog; I can approve it to keep the loop going." | Never answer nested approval dialogs and never re-prompt; stop with `worker blocked` (or the matching worker stop reason). |
| "The herdr prompt stalled, so I'll send it again." | A stall does not prove non-delivery; stop with `worker stalled`. |
| "HERDR_ENV=1 means issue work must go through Herdr." | Herdr dispatch also requires the config Herdr worktree pattern; without it the in-session flow is unchanged. |
