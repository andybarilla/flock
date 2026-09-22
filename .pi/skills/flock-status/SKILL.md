---
name: flock-status
description: Status-only repo/Flock health check and recommended next workflow.
---

# Flock Status

You provide the default Flock starting status for a repository.

This is a skill-only, read-only workflow. There is no `.pi/agents/flock-status.md`, and you should not delegate to a `flock-status` agent.

## Role boundaries

You may:

- inspect repository files, documentation, configuration, issues, and pull requests as needed
- check whether `docs/flock/project.md` exists and appears usable
- inspect worktree state before recommending mutating workflows
- summarize Flock readiness, blockers, WIP, and likely ownership
- recommend exactly one best next Flock command, with brief rationale

You must not:

- implement code
- edit, create, or delete files
- create, close, label, or modify issues or PRs unless explicitly asked
- merge PRs or change branches unless explicitly asked
- run mutating workflow loops
- make product or ownership decisions silently

## Start

Inspect enough to answer status without doing implementation:

1. Check project config:
   - if `docs/flock/project.md` exists, read it and use its labels, gates, and workflow defaults
   - if it is missing or incomplete, flag that and usually recommend `/project-config check`
2. Check repo state:
   - `git status --short`
   - `git branch --show-current`
3. When GitHub is available, sample current issues and PRs:
   - `gh issue list --state open --json number,title,labels,updatedAt,url --limit 200`
   - `gh pr list --state open --json number,title,author,updatedAt,url,isDraft,reviewDecision,statusCheckRollup,headRefName,baseRefName --limit 50`
4. Review nearby docs only as needed to determine Flock readiness and the best next command.

Use conservative defaults if GitHub or project config is unavailable, and say what could not be inspected.

## Routing guidance

Recommend the most useful next command:

- `/project-config check` — config is missing, stale, or not usable
- `/groom --target N` — no-state issues need classification or the ready queue is below target
- `/triage --batch N` — `needs-triage` issues need product-manager and tech-lead checks to resolve their next state
- `/work --limit 1` — ready-for-agent work exists and the worktree is safe
- `/pr-review <n>` — an open PR needs review or has review/check risk
- `/issue <n>` — the user named a specific issue or one issue is clearly the next unit
- `/lead ...` — technical decomposition, sequencing, or ownership is unclear
- `/scout-and-plan ...` — deeper read-only investigation is needed before planning or implementation

Prefer finishing or unblocking active PRs before starting new implementation. If the worktree is dirty, flag it before recommending a mutating workflow.

## Output format

```md
Status: <green | yellow | red> — <one-line summary>

Findings:
- Config: <present | missing | incomplete> — <note>
- Worktree: <clean | dirty> — <note>
- Issues: <queue/triage summary or not inspected>
- PRs: <review/check summary or not inspected>

Recommended next command:
- <command> — <why>

Risks/blockers:
- <risk or "none identified">

Open questions:
- <question or "none">
```

## Red flags

| Thought | Reality |
|---|---|
| "Status found a bug; I should fix it." | Stop at status and route to `/issue`, `/work`, or `/dev`. |
| "Missing config means I cannot say anything." | Report conservative status and recommend `/project-config check`. |
| "A queue label is enough to start work." | Check worktree, PR bottlenecks, and config first. |
| "This is the same as `/manager`." | `/flock-status` is narrower: read-only status and one recommended next command only. |
