---
name: operator-run
description: Runs one bounded Flock operator decision cycle, either read-only or one mutating action when project policy explicitly allows it.
---

# Operator Run

Run exactly one bounded Flock operator decision cycle.

The operator is an orchestrator. It inspects repository state, chooses at most one safe next action, delegates to the existing Flock workflow for that action, summarizes the result, and stops. It must not merge, bypass validation, bypass review, or relax the safety defaults of `/work`, `/groom`, `/triage`, `/issue`, or review workflows outside this operator run.

## Inputs

Parse user arguments for:

- `--dry-run` or `--plan`: read-only planning only
- `--yes`: opt into mutating one-shot automation when project policy permits the selected action
- `--max-issues <n>`: maximum ready issues the operator may dispatch in this run; for one-shot v1, use at most `1` even when higher
- `--max-groom-batches <n>`: maximum grooming batches allowed in this run; for one-shot v1, use at most `1` even when higher
- `--max-triage-issues <n>`: maximum triage issues allowed in this run; for one-shot v1, use at most `1` even when higher
- `--label <label>`: ready issue label, default `ready-for-agent`

If parsing is ambiguous, ask before any mutation.

## 1. Preflight and project policy

Inspect the repository and tracker:

```bash
git rev-parse --show-toplevel
gh repo view --json nameWithOwner,url
git status --short
git branch --show-current
test -f docs/flock/project.md && echo present || echo absent
```

If the worktree is dirty, stop before mutation and report the dirty worktree. Dry-run may still report the dirty state as a blocker.

Before taking any mutating action, read `docs/flock/project.md` completely. One-shot mutation requires both:

1. project config exists, and
2. the config contains an `Operator Approval Policy` section that explicitly allows the selected approval category.

When project config or approval policy is missing, dry-run planning is allowed but mutating one-shot mode must fail with a clear stop reason. Do not infer approval from labels alone.

## 2. Read-only decision pass

Gather enough state to choose one next action without mutating:

```bash
gh issue list --state open --label ready-for-agent --json number,title,labels,updatedAt,url --limit 50
gh issue list --state open --label needs-triage --json number,title,labels,updatedAt,url --limit 50
gh issue list --state open --json number,title,labels,updatedAt,url --limit 50
gh pr list --state open --json number,title,url,headRefName,baseRefName,reviewDecision,statusCheckRollup --limit 20
```

If the configured labels differ from the defaults, use the labels from `docs/flock/project.md`.

Recommended action priority for one-shot v1:

1. stop on dirty worktree, auth failure, missing required commands, or unexpected branch state
2. dispatch one ready issue when ready issues exist and issue selection for queued work is allowed
3. triage one `needs-triage` issue when triage labels/comments are allowed and the triage limit permits it
4. groom one bounded batch when grooming labels/comments are allowed and the grooming limit permits it
5. route to PR review when review is clearly the safest next action
6. stop with no safe action

This priority is a routing default only. Stop and ask if the safest action is ambiguous.

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

## 4. One-shot mutation gate

For one-shot mutation, require either `--yes` with an auto-approved policy category or an explicit human confirmation for an ask-approved policy category. Without `--yes`, show the selected action, why it was selected, the policy category that must allow it, and ask the user before dispatching when policy permits asking.

Policy category checks:

- ready issue work requires `Issue selection for queued work` and must dispatch through the `issue-loop` workflow with `--yes --limit 1`
- triage requires `Triage labels/comments` and must dispatch through the `triage` workflow with a limit of one issue unless project policy/user limits are lower
- grooming requires `Grooming labels/comments` and must dispatch through the `groom` workflow for one bounded batch unless project policy/user limits are lower
- PR review must dispatch through the `pr-review` workflow for one PR, or `ic-review` only when reviewing a local diff; review must not merge

Interpret the selected approval policy category explicitly:

- `auto-approve`, `allowed`, or equivalent approval language permits dispatch when the user supplied `--yes` and all limits pass
- `ask` or equivalent confirmation language permits dispatch only after the operator displays the selected action and receives explicit human confirmation; then pass `--yes` only to the delegated workflow so routine confirmations do not repeat
- `never`, `blocked`, missing, unclear, or policy language that does not cover the selected action blocks mutation

If the selected policy category exceeds configured limits, stop before mutation.

## 5. Dispatch exactly one workflow

Dispatch exactly one underlying workflow and then stop. Do not implement, groom, triage, or review directly in this skill.

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

The delegated workflow owns its normal safety checks, validation, review, PR handling, and tracker completion rules. If it reports blocked or failed status, the operator must stop and report that result. Never continue to a second action in one-shot mode.

## 6. Final handoff

Return a stage-by-stage summary. Mark each stage as succeeded, skipped, or failed. Failed stages must include a clear stop reason. Do not claim validation, review, tracker changes, or tracker completion unless command output from the underlying workflow was observed.

```md
Mode: <dry-run|one-shot>
Repository: <owner/name>
Project config: <found/missing and approval policy summary>
Chosen action: <work|triage|groom|review|stop|ask human>
Delegated workflow: <issue-loop|triage|groom|pr-review|ic-review|none>
Issue: #<number when available, or "none selected">
Branch: <branch name when available, or "not created">
PR: <PR link when available, or "not opened">
Validation: <observed result from delegated workflow, or "not run">
Review verdict: <observed verdict from delegated workflow, or "not run">
Tracker completion: <observed completion result from delegated workflow, or "not run">
Workflow summary:
- Preflight: <succeeded|skipped|failed> — <observed result or stop reason>
- Project policy gate: <succeeded|skipped|failed> — <observed result or stop reason>
- Decision pass: <succeeded|skipped|failed> — <observed result or stop reason>
- Dispatch: <succeeded|skipped|failed> — <delegated workflow result or stop reason>
- Validation: <succeeded|skipped|failed> — <observed delegated result or not run>
- Review: <succeeded|skipped|failed> — <observed delegated result or not run>
- Tracker completion: <succeeded|skipped|failed> — <observed delegated result or not run>
Stop reason: <completed one-shot action|dry-run plan completed|blocked|failed|no safe action|human confirmation required>
Next recommended human action: <merge/review/fix/configure/run suggested command/no action>
```

## Red flags

| Thought | Reality |
|---|---|
| "One-shot means one issue plus grooming." | One-shot means exactly one delegated workflow/action. |
| "The project has ready issues, so mutation is approved." | Mutation also requires config and approval policy for the selected action. |
| "I can implement the selected issue here." | Dispatch to `issue-loop`; underlying workflows own implementation. |
| "The operator can merge after checks." | Never auto-merge. |
| "Dry-run changed labels/comments because it was harmless." | Dry-run is strictly read-only. |
