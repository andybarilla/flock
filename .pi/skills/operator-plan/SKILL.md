---
name: operator-plan
description: Produces a read-only dry-run Flock operator plan for the current repository.
---

# Operator Plan

Produce exactly one read-only dry-run Flock operator plan.

This skill inspects repository and tracker state, recommends the next safe Flock workflow, explains relevant alternatives, and stops without mutating files, branches, commits, pull requests, labels, comments, or issue state.

## Inputs

Parse user arguments for:

- `--dry-run` or `--plan` (default behavior for this skill)
- `--label <label>`: ready queue label, default `ready-for-agent`
- focus text, if provided

If parsing is ambiguous, ask. Do not mutate while asking.

## 1. Preflight

Run read-only checks:

```bash
git rev-parse --show-toplevel
gh repo view --json nameWithOwner,url
git status --short
git branch --show-current
test -f docs/flock/project.md && echo present || echo missing
```

If `docs/flock/project.md` is present, read it before recommending an action. Use its labels, default branch, gate, PR/review policy, workflow defaults, and operator approval policy when summarizing state. If it is missing, report that project config is missing and that mutating operator modes are blocked; dry-run planning may continue.

## 2. Inspect queues and review bottlenecks

Use read-only GitHub commands. Adjust labels when project config specifies different labels.

```bash
gh issue list --state open --label ready-for-agent --json number,title,labels,updatedAt,url --limit 50
gh issue list --state open --label needs-triage --json number,title,labels,updatedAt,url --limit 50
gh issue list --state open --json number,title,labels,updatedAt,url --limit 50
gh pr list --state open --json number,title,url,headRefName,baseRefName,reviewDecision,statusCheckRollup,updatedAt --limit 20
```

Inspect enough state to report:

- GitHub access and repository identity
- project config presence or absence
- worktree safety and current branch
- ready queue status
- likely grooming need, such as no ready issues and unclassified/open issues that are not already terminal
- triage queue status and whether `/triage` is a safe possible route
- open PR or review bottlenecks
- blockers that make mutation unsafe, such as dirty worktree, missing auth, missing config for mutating automation, ambiguous state, or unexpected branch

Do not run mutating commands. Do not create branches, commits, PRs, labels, comments, or issue state changes.

## 3. Choose exactly one recommendation

Recommend exactly one next action:

- `work`: ready issues exist and no higher-priority review/safety blocker should stop the operator
- `review PR`: an open PR appears to need human/agent review or is the safest bottleneck to clear first
- `triage`: `needs-triage` issues exist and no ready issue/review bottleneck should take priority
- `groom`: no ready issue exists and backlog issues appear to need shaping/classification
- `stop`: no safe useful action is available or the repo is already idle
- `ask human`: ambiguity, missing permissions, dirty worktree, unclear project policy, or a decision is required

If more than one action is plausible, pick the safest one and explain why alternatives were not selected. Prefer stopping or asking over guessing.

Default priority:

1. `ask human` for dirty worktree, auth failure, missing required command output, ambiguous state, or unexpected branch
2. `review PR` for open PRs with missing/blocking review or unclear checks
3. `work` for ready issues
4. `triage` for `needs-triage` issues
5. `groom` for unready backlog
6. `stop` when nothing useful is available

## 4. Output format

Return a concise plan. Do not claim validation, review, tracker changes, or completion occurred.

```md
Mode: dry-run
Repository: <owner/name>
Project config: <found/missing; relevant policy summary>
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

## Red flags

| Thought | Reality |
|---|---|
| "Dry-run can add a helpful label/comment." | Dry-run must not mutate tracker state. |
| "A recommendation can include two next actions." | Recommend exactly one next action. |
| "Missing project config blocks all output." | Dry-run may continue, but must report that mutating operator modes are blocked. |
| "The prompt can run `/work` after planning." | This skill only plans; it never dispatches the selected action. |
