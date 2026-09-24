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
- `--focus <label|issue-number>`: scope ready-issue selection. A non-numeric value is a focus label: scope selection to issues that also carry `<label>`. A numeric value names an epic issue: scope selection to the epic's blocked-by dependency chain (epic mode, section 2). The focus filter composes with `--label`, it does not replace it. Focus has no effect on triage, groom, review, or merge cycles — those stay global. Herdr worker dispatch (section 5a) is unchanged: selection happens upstream, so worker briefs need no focus changes

If parsing is ambiguous, ask before any mutation.

## Event journal

The supervisor records workflow status events with the `flock_event` tool, which appends one JSON event per line to `.flock/events.jsonl` (schema v1; `.flock/` is gitignored and never committed, the same convention as handoff files). Generate one `run_id` per operator run (for example `operator-run-<utc-start-timestamp>`) and reuse it for every event in the run; `repo` is the repository's owner/name.

Emission is supervisor-only: nested Herdr workers never write journal events — their worktrees are removed after merge. Read-only modes never emit: `--dry-run` / `--plan` runs write no journal events at all, because those modes must not mutate and the journal is a filesystem write. Emission is observational only: a journal failure (a warning result from the tool) never changes workflow behavior, safety stops, approval policy, merge policy, or retry policy — note the warning in the run log and continue.

Emission points:

- run start (first decision pass, section 2): one `run_started` per mutating run with `data: {mode: "<one-shot|loop>"}`; a run that opens with a resume cycle emits it the same way
- issue dispatched (section 5a): `issue_dispatched` with `issue`, `branch`, and the pane/workspace/worktree IDs in `data`
- PR verified/opened (section 5a PR verification leg): `pr_opened` with `issue`, `pr`, `branch`
- gate re-run (section 2 resume gate re-run, section 5a/5b validation legs): `gate_result` with `data: {passed: true|false}`
- review verdict (section 2 resume review, section 5a/5b review legs): `review_verdict` with `data: {verdict: "clean"|"blocking"}`
- rework dispatched (section 5b): `rework_dispatched` with `issue` and `pr`
- merge step (section 6): `merge_verified`, `issue_closed`, and `worktree_cleaned` with `issue`, `pr`, and — for `worktree_cleaned` — the workspace/worktree IDs in `data`
- run stop (sections 7/8): exactly one terminal `run_stopped` with `data: {reason: "<stop reason>"}` using the exact stop reason string the run log's `Stop reason:` field uses (for example "PR not green" or "review blocking")

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

When `--focus` carries a non-numeric label value, the ready-issue listing must filter to issues carrying both the ready label and the focus label, using exactly:

```bash
gh issue list --state open --label <label> --label <focus> --json number,title,labels,updatedAt,url --limit 50
```

Substitute the active ready label (the `--label` value after CLI/config defaults) for `<label>` and the `--focus` value for `<focus>`; the focus filter composes with `--label`, it does not replace it. If the focus set is empty — no ready issues carry the focus label, or the label does not exist — stop with reason `focus queue empty`; nothing is dispatched and the operator never falls back to the general ready queue. Focus does not affect the triage, backlog, or PR listings, and triage, groom, review, and merge cycles stay global.

When the `--focus` value is numeric (`--focus <issue-number>`), it names an epic (a feature head) and selection runs in epic mode:

- Focus set: the epic issue itself, when open and carrying the ready label, plus every open issue carrying the ready label whose blocked-by closure transitively includes the epic issue number.
- GitHub native blocked-by relationships are the only dependency source of truth. Query them with:

  ```bash
  gh api repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by
  ```

  The endpoint returns a JSON array of the issues blocking `<n>`. Issue-body "Blocked by" text is human documentation only and is never parsed.
- Discovery: list open issues carrying the ready label (limit 50), then for each candidate walk its blocked-by links transitively with the query above, to a maximum depth of 10 levels; the candidate joins the focus set when the walk reaches the epic issue number. Add the epic itself when it is open and ready.
- Missing data: an empty relationships array means no dependency info is recorded for that issue — treat the issue as having no known blockers and never infer dependencies from any other source.
- API error: when the dependency query fails, stop with reason `focus dependency query failed` and report the failing command and observed error; never guess dependency order.
- Ordering: priority 5 dispatches the first dispatchable focus-set member in dependency order — every issue in its blocked-by list closed. When a member has an open blocker, skip it and record an explicit `blocked by #N` line in the cycle log naming the open blocker; never dispatch a member before its open blocker.
- Re-evaluation: re-run the dependency queries in every decision pass, so a blocker closed or merged during the run makes its dependents eligible in the next pass.
- An empty epic focus set — the epic is not open and ready and no ready issue's blocked-by closure includes it — stops with reason `focus queue empty`; nothing is dispatched and the operator never falls back to the general ready queue.

Recommended action priority:

1. stop on dirty worktree, auth failure, missing required commands, or unexpected branch state
2. stop or route to review when review is blocking, review cannot run, or review is clearly the safest bottleneck
3. resume a prior run's merge step when an open PR meets the resume criteria below; run the merge step from section 6 instead of redispatching its issue
4. resume a parked PR from earlier in this run whose worker handoff now shows `Rework: complete` with an advanced head sha (section 7 parked PR register); the same resume criteria below apply
5. dispatch one ready issue when ready issues exist and issue selection for queued work is allowed
6. triage one `needs-triage` issue when triage labels/comments are allowed and the triage limit permits it
7. groom one bounded batch when grooming labels/comments are allowed and the grooming limit permits it
8. stop when the queue is empty or no safe action exists

Parked-register guard: while the parked PR register (section 7) is non-empty, priorities 3 and 5 do not apply — no generic resume and no new issue work. Only an eligible parked-PR resume (priority 4), grooming, triage, or stop are allowed until the register is empty.

Resume criteria — an open PR is a resume target only when all of these are observed: its head branch matches the configured issue branch pattern, its author is the authenticated account (`gh api user --jq .login`), its linked issue is open, it carries the `flock-operator-run` provenance marker comment authored by the authenticated account (observed via `gh pr view <number> --json comments`, filtered to the authenticated login — a marker comment from any other author is meaningless and does not qualify the PR), and project config allows conditional merge. Branch shape and authorship alone never qualify a PR: the authenticated account is usually the maintainer's own, so without the self-authored provenance marker the PR stays human-merged. On resume, first re-establish validation and review evidence in the resuming run: re-run the configured gate command against the PR head (in the Herdr worktree if it still exists — first confirming `git -C <worktree> rev-parse HEAD` matches the PR head sha from `gh pr view <number> --json headRefOid`, stopping as unexpected branch state on mismatch — otherwise in a fresh checkout of the PR branch) and stop on failure — the marker certifies only the verification legs observed when it was posted, which may predate validation — then dispatch the `pr-review` workflow for the PR; a fresh non-blocking verdict re-establishes review evidence, and a blocking verdict stops the run. Then run the section 6 merge step; do not redispatch the issue. A PR failing any criterion is not a resume target: never merge it, and ask a human when ownership is ambiguous. Within a loop run, the parked PR register (section 7) detects rework via the handoff file's `Rework: complete` marker plus an advanced head sha; across runs, the criteria above are sufficient on their own — the gate re-run and fresh review re-establish evidence regardless of how the fixes arrived. A resume cycle never gets a section 5b rework pass: a blocking verdict on resume stops the run. Journal events on resume: the run's single `run_started` (Event journal) covers the resume cycle start; record the gate re-run as `gate_result` and the fresh review verdict as `review_verdict`.

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
Focus: <focus label and matched issue numbers; or, in epic mode, the epic issue number, the chain members, and the dispatchable/blocked/done breakdown with each skip's `blocked by #N` line and each closed chain member itemized as `done #N`; or "none">
PRs/review: <short observed state>
Recommended action: <groom|work|review PR|triage|stop|ask human>
Why this action: <one or two sentences>
Alternatives not selected: <brief bullets or "none">
Safety notes: <dirty tree, missing config, policy blockers, or "none">
Next command: <suggested Flock command, or "none">
Would mutate: no
Stop reason: <dry-run plan completed|focus queue empty|focus dependency query failed> — use `focus queue empty` when `--focus` is set and the focused ready set is empty, and `focus dependency query failed` when the epic-mode dependency query errors
```

Do not claim validation, review, tracker changes, or completion in dry-run mode.

## 4. Mutation gate

For mutating one-shot or loop mode, require either `--yes` with an auto-approved policy category or an explicit human confirmation for an ask-approved policy category. Without `--yes`, show the selected action, why it was selected, the policy category that must allow it, the remaining limits, and ask the user before dispatching when policy permits asking.

Policy category checks:

- ready issue work requires `Issue selection for queued work` and must dispatch through the `issue-loop` workflow with `--yes --limit 1`, or through the section 5a Herdr worker dispatch when it is active
- triage requires `Triage labels/comments` and must dispatch through the `triage` workflow with a limit of one issue unless project policy/user limits are lower
- grooming requires `Grooming labels/comments` and must dispatch through the `groom` workflow for one bounded batch unless project policy/user limits are lower
- PR review must dispatch through the `pr-review` workflow for one PR, or `ic-review` only when reviewing a local diff; review must not merge
- review rework dispatch requires the `Review rework dispatch` approval category and goes through the section 5b rework pass only — one prompt to the existing Herdr worker, never a new agent, branch, or PR
- merge requires the `Merge` policy category and is allowed only as a squash merge of a green PR opened by the operator in the current run, or of a green PR meeting the section 2 resume criteria (provenance marker observed, the configured gate command re-run against the PR head passed in the resuming run, and a fresh non-blocking `pr-review` verdict in the resuming run). Green means, all observed from `gh` output: every `statusCheckRollup` entry successful (none pending or failing), `mergeable: MERGEABLE`, Flock review verdict non-blocking, and `reviewDecision: APPROVED` when required by branch protection (not required otherwise). The operator polls up to the configured max PR wait and stops with reason "PR not green" on timeout; it never waits indefinitely. Merge execution additionally requires the verified check-wait command recorded in project config; without it, the operator reports the PR state and stops for a human merge. Failing checks, merge conflicts, blocking review, missing/insufficient Merge policy, or any PR that is neither run-opened nor a qualified resume target each stop the run before any merge command. The issue is closed completed only after the merge is verified on the default branch.

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

When `--focus <focus>` is present, pass it through so the delegated loop selects from the same focused set the decision pass used. Pass the value through unchanged whether it is a label or an epic issue number:

```md
Use the `issue-loop` skill to work ready GitHub issues from this repository.
Arguments: --label <label> --focus <focus> --limit 1 --yes
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

   Each stop leaves the pane, worktree, branch, and agent in place for human inspection — never remove a failed, blocked, timed-out, or stalled worker's pane or worktree — and ends the run with the matching reason. Record the stopped worker (agent name, workspace ID, worktree path, stop reason) for itemized reporting as a follow-up item in the final run log (section 8). `herdr agent read` may be used to capture diagnostic output for the stop report, but diagnostics never substitute for the handoff file or independent verification.

### Handoff file convention

The nested worker writes its final handoff to `<worktree-root>/.flock/handoff-issue-<n>.md`; the operator passes the absolute path in the worker brief. After a section 5b rework prompt, the worker rewrites the same file with a `Rework: complete` marker. The file must contain the full `github-issue-worker` final handoff block (issue, branch, PR, validation, review verdict, tracker completion, stage summary) or, when blocked, the BLOCKED format with the same stage names. The worker never commits the handoff file. The supervisor reads the file directly from the filesystem.

### Independent verification

The supervisor never records worker claims from the handoff alone. Before recording branch, PR, validation, or review verdict in the run log, re-verify each from the operator's own session:

- Branch: `git ls-remote --heads origin <branch>` (or `gh api repos/<owner>/<repo>/branches/<branch> --jq .name`) shows the issue branch exists on the remote.
- PR: `gh pr list --state open --head <branch> --json number,url,headRefName,baseRefName,author` shows an open PR from the issue branch to the default branch authored by the authenticated account; then `gh pr view <number> --json state,mergeable,reviewDecision`. Once the PR is verified, immediately record the section 6 provenance marker on it — before the validation and review legs — so a stopped run never strands an unmarked operator PR.
- Validation: first confirm the worktree HEAD matches the pushed PR head — compare `git -C <worktree> rev-parse HEAD` with the remote head sha (the sha field from `git ls-remote --heads origin <branch>`, or `gh pr view <number> --json headRefOid`); a mismatch stops with `worker claim mismatch`. Then re-run the configured gate command (for example `npm run check`) in the worktree path and observe the output; also confirm `git -C <worktree> status --short` shows no unexpected uncommitted files (the handoff file excepted) and `git -C <worktree> log --oneline origin/<default>..HEAD` shows the work committed on the issue branch.
- Review verdict: never record the worker's claimed verdict from the handoff. Flock `pr-review`/`ic-review` verdicts are returned to the session and never submitted as GitHub reviews, so `reviewDecision` is normally empty and cannot verify a claim. Instead, the supervisor dispatches a fresh `pr-review` for the PR from its own session (as on resume in section 2) and observes the verdict directly; a blocking verdict goes to the section 5b rework evaluation, and stops the run with `review blocking` when no rework pass is dispatched or the post-rework review is also blocking. A `CHANGES_REQUESTED` from `gh pr view <number> --json reviewDecision` also stops the run with `review blocking`, and if the supervisor's review cannot run, stop with `review cannot run`. The handoff's claimed verdict is cross-check evidence only: it must match the supervisor-observed verdict, and a mismatch stops with `worker claim mismatch`. This cross-check does not apply to a post-rework handoff, whose review fields are always `not run — supervisor review pending`.

A claim that fails re-verification stops the run with `worker claim mismatch`, reporting the observed divergence. Only after all checks pass does the cycle count as a completed issue workflow: run the merge step when applicable, and evaluate the loop continuation gate.

Journal events for the dispatch cycle: emit `issue_dispatched` when the worker brief is submitted (dispatch sequence step 3), with `issue`, `branch`, and the pane, workspace, and worktree IDs in `data`. In the independent verification legs, emit `pr_opened` when the open PR is verified, `gate_result` after the worktree gate re-run, and `review_verdict` after the supervisor's fresh `pr-review`.

## 5b. Review rework pass (optional, Herdr dispatch only)

When the supervisor's fresh `pr-review` from the section 5a review leg returns `BLOCKING`, evaluate exactly one bounded rework pass instead of stopping immediately — but only when all of these hold:

1. project config contains a `Rework` policy explicitly allowing one rework pass, and the `Review rework dispatch` approval category permits it
2. every blocking finding is severity Important or Minor — any Critical finding ends automated work on the issue with `review blocking` (no rework; the PR is parked per section 7 and awaits a human)
3. no rework pass has already run for this issue in this run
4. the worker session and worktree from section 5a are still live (the cycle ran under Herdr dispatch this run); the in-session flow has no rework path and stops with `review blocking` as before
5. remaining max issues, per-issue worker timeout, and max runtime limits permit the pass; a rework pass counts as an additional worked issue against max issues

When all hold, send the rework prompt to the existing worker:

```bash
herdr agent prompt issue-<n> "<rework brief>" --wait --timeout <remaining-budget-ms>
```

Emit a `rework_dispatched` journal event with `issue` and `pr` when the rework prompt is sent.

The rework brief must include the review findings verbatim and instruct the worker to address each finding on the existing issue branch in the existing worktree, push to update the existing PR (never a new branch or PR), re-run the full gate, and rewrite the handoff file with a `Rework: complete` marker and a findings-addressed list. Never start a second agent and never answer nested approval dialogs; interpret the outcome with the section 5a step 4 rules (a BLOCKED rework handoff stops with `worker blocked`).

After a settled rework, re-establish all evidence from scratch — nothing carries over from the pre-rework cycle:

- require the rewritten handoff to contain `Rework: complete`; a missing marker or missing handoff stops with `worker handoff missing`
- confirm the PR head sha advanced since the blocking verdict (`gh pr view <number> --json headRefOid`) and matches the worktree HEAD; no new head means the rework never landed — stop with `worker claim mismatch`
- re-run the configured gate command in the worktree and observe it pass
- dispatch a fresh `pr-review` for the PR and observe the verdict

A fresh non-blocking verdict completes the cycle: run the merge step (section 6) and evaluate the loop continuation gate. A second blocking verdict — at any severity — stops the run with `review blocking`, records the PR in the parked PR register (section 7), and leaves the worker pane and worktree in place for human inspection.

## 6. Merge step after a completed issue cycle

Run this step when a delegated issue workflow completed with a PR opened in the current run, or when a cycle resumes a prior run's PR per the section 2 resume criteria. Skip it for triage, grooming, and review cycles.

Preconditions — all must hold before any merge command:

1. the PR number was observed from the delegated workflow's output in this run, from the supervisor's independent Herdr-dispatch verification (section 5a), or the PR was selected via the section 2 resume criteria; never merge a PR that is neither run-opened nor a qualified resume target
2. project config contains a conditional `Merge` approval policy that allows merge
3. project config records a verified check-wait command; without it, report the PR state and stop for a human merge
4. review evidence is non-blocking: the delegated workflow reported non-blocking review this run, the supervisor observed a non-blocking `pr-review` verdict under section 5a Herdr dispatch this run (including a post-rework verdict from section 5b), or — on resume — a fresh `pr-review` dispatch for the PR returned a non-blocking verdict in this run; a blocking verdict stops the run
5. validation evidence: the configured gate command passed against the PR head in this run — observed from the delegated workflow's output, from the supervisor's section 5a worktree gate re-run (including the post-rework gate re-run from section 5b), or from the section 2 resume gate re-run; missing or failed validation stops the run before any merge command

When the delegated workflow reports an opened PR, immediately record provenance so a later stopped run can recognize it (under Herdr dispatch, the section 5a PR verification leg records it before the validation and review legs); post it once — if a `flock-operator-run` marker comment authored by the authenticated account is already present on this PR, do not post a duplicate:

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
3. when the cycle ran under Herdr dispatch, remove the run-created worktree and its workspace, using the workspace ID recorded from the `herdr worktree create` JSON response at creation time in this run (section 5a step 1). The removal must be handoff-aware: the worker's handoff file (`<worktree-root>/.flock/handoff-issue-<n>.md`) is never committed, so the worktree is dirty and a plain removal is refused. The supervisor already read the handoff file during section 5a verification and its claims were independently re-verified, so delete it, then confirm the worktree is otherwise clean before removing:

   ```bash
   rm <worktree-root>/.flock/handoff-issue-<n>.md
   git -C <worktree-root> status --short
   herdr worktree remove --workspace <workspace-id>
   ```

   Removal is scoped strictly to resources created in the current run: only remove a worktree whose workspace ID, root pane ID, and path were recorded from a `herdr worktree create` response earlier in this same run. Never remove a pre-existing or previous-run worktree, workspace, or pane — those are report-only follow-up items. If `git -C <worktree-root> status --short` shows anything after the handoff file is deleted, do not remove and do not use `--force`; record the unexpected worktree state as a follow-up item instead. A removal failure is non-fatal: the merge and issue close already happened, so record the failed removal (agent name, workspace ID, worktree path, observed error) as a follow-up item in the final run log and continue.

If the sync fails or the merge commit is absent, stop with `merge verification failed` and report the merged PR with the divergence. Claim tracker completion in the run log only from the observed close command output.

Journal events for the merge step: emit `merge_verified` after the PR is observed `MERGED`, `issue_closed` after the close command output is observed, and `worktree_cleaned` with the workspace and worktree IDs in `data` after a successful run-created worktree removal.

## 7. Loop continuation gate

When `--loop` is set, repeat the one-cycle process only while all conditions remain safe:

1. the prior delegated workflow succeeded without a blocking review, missing review, failed validation, unclear scope, failed tracker operation, or failed/blocked issue work, and the section 6 merge step either was not applicable or ended in a verified merge — any merge stop reason (`PR not green`, `checks failing`, `merge conflict`, `unexpected PR state`, `merge failed`, `merge verification failed`) ends the run instead of continuing. The single exception is a cycle that ended `review blocking` with the PR recorded in the parked PR register: the loop may continue, but only grooming or triage cycles are allowed while any PR is parked — no further issue work, resume, or merge cycles (a PR that has left the register as a resume candidate is exempt for its own resume and merge cycle)
2. observed output includes the validation result, review verdict, tracker changes, issue/PR references, and delegated stop reason when applicable
3. counters remain under max cycles, max issues, max grooming batches, max triage issues, and max runtime
4. the repository returns to the expected safe state for the next action: clean worktree on the default branch, `git pull --ff-only` succeeds with HEAD matching `origin/<default>`, and no operator-created PR from this run remains open unless it is recorded in the parked PR register (the prior cycle's PR was merged and verified, parked after a `review blocking` stop, or the cycle created no PR). Under Herdr dispatch the operator's own checkout never leaves the default branch; a completed cycle's run-created worktree was already removed — or its failed/skipped removal recorded as a follow-up item — in the section 6 post-merge step, and a stopped worker's worktree and pane remain in place for human inspection without dirtying the operator checkout
5. project policy still allows the next selected action

Parked PR register: when a cycle ends `review blocking`, record the PR (number, URL, linked issue, branch, agent/workspace/worktree when under Herdr, and a one-line verdict summary) in the parked PR register. Each later cycle's decision pass re-checks every parked PR: observed `MERGED` or `CLOSED` state removes it (a human handled it — note that in the cycle log); a handoff file containing `Rework: complete` with a PR head sha that advanced since the blocking verdict makes it the next cycle's resume candidate under the section 2 criteria — it leaves the parked register when its resume cycle begins, so the parked restriction does not block its own resume and merge; anything else stays parked. Every parked PR is itemized in the final run log with its resume instructions, and its worker pane and worktree stay in place for human inspection.

Parked PR in a focus chain: when `--focus` is numeric and a cycle ends `review blocking` on a PR whose linked issue is a focus-set member, the parked-register rules above apply unchanged — no further issue work, focused or general, while the register is non-empty; only groom or triage cycles may continue. The run log's `Focus:` field must record the blockage as `Focus chain blocked at PR #<n> (issue #<m>, review blocking)`. In each later decision pass, dependents of the parked issue remain skipped with explicit `blocked by #<m>` lines. Resume follows the parked-register rules with no focus-specific exceptions: a `Rework: complete` handoff with an advanced head sha makes the parked PR the next cycle's resume candidate, and after its verified merge the chain is re-evaluated so newly unblocked dependents become eligible. Epic focus neither relaxes nor tightens parked-PR restrictions; the `Focus:` reporting line is the only focus-specific addition.

Before continuing to the next cycle, run:

```bash
git status --short
git branch --show-current
git fetch origin
git pull --ff-only
git rev-parse HEAD origin/<default-branch>
gh pr list --state open --json number,title,url,headRefName,baseRefName,reviewDecision,statusCheckRollup --limit 20
```

Confirm from the output: the worktree is clean, the current branch is the default branch from project config, local HEAD matches `origin/<default-branch>`, and no open PR head branch matches an issue branch from this run unless the PR is recorded in the parked PR register. If the run has more open PRs than the list limit, raise the limit so a run PR cannot be windowed out.

Stop instead of continuing when any of these occur: queue is empty, work is blocked, validation fails, review is blocking and neither a section 5b rework pass nor groom/triage continuation applies, review cannot run, a merge stop reason occurred, a Herdr worker stop reason occurred (`worker blocked`, `worker timeout`, `worker not ready`, `worker stalled`, `worker handoff missing`, `worker claim mismatch`, `worktree create failed`), issue scope is unclear, worktree is dirty, auth fails, branch state is unexpected, required commands fail, project config or approval policy is insufficient, or configured limits are reached.

Do not continue after a failed or blocked issue in v1 unless project policy explicitly supports retries and the retry conditions are met. The default Flock retry policy is no retry.

## 8. Final run log

Return a stage-by-stage summary for one-shot mode, and a Final run log for loop mode. Mark each stage as succeeded, skipped, or failed. Failed stages must include a clear stop reason. Do not claim validation, review, tracker changes, or tracker completion unless command output from the underlying workflow was observed. A resume cycle (`action=resume`) counts toward max cycles and max issues like a work cycle.

Itemize leftover Herdr state as follow-up items: every run-created worker worktree or pane still in place at run end, whatever stopped its cycle — failed, blocked, timed-out, or stalled workers left in place for human inspection, merge-stopped cycles whose worktrees and panes were intentionally preserved (`PR not green`, `checks failing`, `merge conflict`, `unexpected PR state`, `review blocking`, `merge failed`, `merge verification failed`), and post-merge worktree removals that failed or were skipped for unexpected worktree state — each with agent name, workspace ID, worktree path, and stop reason or observed error. Stale worktrees or workspaces from previous runs are report-only follow-up items — the operator never removes them. When Herdr dispatch was active in this run, enumerate previous-run leftovers before composing this log with `herdr worktree list` and record any workspace not created in this run as a report-only follow-up item.

Emit exactly one terminal `run_stopped` journal event (mutating runs only — read-only modes emit nothing, see Event journal) with `data: {reason: "<stop reason>"}` using the exact stop reason string the `Stop reason:` field below uses (for example "PR not green" or "review blocking").

```md
Mode: <dry-run|one-shot|loop>
Repository: <owner/name>
Project config: <found/missing and approval policy summary>
Herdr dispatch: <enabled|disabled: missing HERDR_ENV=1 or missing config Herdr worktree pattern>
Limits: <max cycles/issues/grooming/triage/runtime and observed counters>
Focus: <focus label and matched issue numbers; or, in epic mode, the epic issue number, the chain members, and a worked/skipped/blocked/done breakdown with each skip's `blocked by #N` line and each closed chain member itemized as `done #N` (dispatch candidates remain open ready issues only; closed members are retained for done reporting) — plus `Focus chain blocked at PR #<n> (issue #<m>, review blocking)` when a focus-chain PR is parked; or "none">
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
Parked PRs: <number, url, linked issue, stop reason, resume instructions for each, or "none">
Cycle log:
- Cycle <n>: action=<work|resume|triage|groom|review|stop>; issue=<#number|none>; agent=<issue-<n>|none>; pane=<pane-id|none>; workspace=<workspace-id|none>; worktree=<path|none>; handoff=<path|none>; PR=<url|none>; validation=<observed|not run>; review=<verdict|not run>; verification=<branch/PR/validation/review re-verified by supervisor|not run>; rework=<dispatched: outcome|none>; merge=<merged|not green|failed|not run>; tracker=<changes|none>; continue=<yes|no: reason>; result=<succeeded|blocked|failed|stopped>
Follow-up items:
- <leftover worker or failed cleanup: agent name, workspace ID, worktree path, stop reason or observed error; previous-run stale worktrees reported here only; or "none">
Workflow summary:
- Preflight: <succeeded|skipped|failed> — <observed result or stop reason>
- Project policy gate: <succeeded|skipped|failed> — <observed result or stop reason>
- Decision pass: <succeeded|skipped|failed> — <observed result or stop reason>
- Dispatch: <succeeded|skipped|failed> — <delegated workflow result, Herdr worker result, or stop reason>
- Loop continuation gate: <succeeded|skipped|failed> — <observed safe state or stop reason>
- Validation: <succeeded|skipped|failed> — <observed delegated result or not run>
- Review: <succeeded|skipped|failed> — <observed delegated result or not run>
- Rework: <succeeded|skipped|failed> — <dispatched outcome, or why not applicable>
- Merge step: <succeeded|skipped|failed> — <observed merge/verification result, stop reason, or not run>
- Tracker completion: <succeeded|skipped|failed> — <observed delegated result or not run>
Stop reason: <completed one-shot action|dry-run plan completed|queue empty|focus queue empty|focus dependency query failed|blocked|failed|review blocking|review cannot run|PR not green|checks failing|merge conflict|unexpected PR state|merge failed|merge verification failed|worker blocked|worker timeout|worker not ready|worker stalled|worker handoff missing|worker claim mismatch|worktree create failed|dirty worktree|unexpected branch|limit reached|human confirmation required|no safe action>
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
| "A blocking review can be bounced straight back to the worker." | Rework requires the explicit config Rework policy and `Review rework dispatch` approval: one pass per issue per run, non-Critical findings only, the existing worker session, and a fresh gate run plus fresh review afterward. |
| "A review-blocking PR ends the whole loop." | It parks the PR; only grooming and triage cycles may continue while it awaits human review, and it is re-checked each cycle and itemized in the run log. |
| "Dry-run changed labels/comments because it was harmless." | Dry-run is strictly read-only. |
| "The nested worker's handoff says validation passed." | The supervisor never records worker claims from the handoff alone; re-verify branch, PR, validation, and review verdict via `gh`/`git` and a gate re-run first. |
| "The worker is stuck on an approval dialog; I can approve it to keep the loop going." | Never answer nested approval dialogs and never re-prompt; stop with `worker blocked` (or the matching worker stop reason). |
| "The herdr prompt stalled, so I'll send it again." | A stall does not prove non-delivery; stop with `worker stalled`. |
| "HERDR_ENV=1 means issue work must go through Herdr." | Herdr dispatch also requires the config Herdr worktree pattern; without it the in-session flow is unchanged. |
| "A focus-chain PR blocking review can be bypassed to keep epic work moving." | Parked-register rules apply unchanged to focus-chain PRs: only groom and triage cycles continue while it is parked, and the run log records `Focus chain blocked at PR #<n>`. |
| "The issue body says \"Blocked by #5\", so it is blocked." | Issue-body text is documentation only; the GitHub blocked-by API is the sole dependency source of truth, and on API error the run stops rather than guessing order. |
