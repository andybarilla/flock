---
name: issue-loop
description: Works GitHub issues that are ready for an agent, one at a time. Use when the user asks to work the ready queue, drain ready-for-agent issues, or run /work.
---

# Issue Loop

Work ready GitHub issues one at a time.

This is the conservative, attended version of the queue loop. It coordinates work but does not merge automatically. After the user accepts a selected issue (or when `--yes` is supplied), it immediately dispatches that issue to the `github-issue-worker` workflow in the same run. It should keep context flat by handing individual issues to the `github-issue-worker` workflow, and by using the `ic-dev` subagent when useful.

## Project config

Before applying defaults, check for `docs/flock/project.md`. If present, read it and use its labels, workflow defaults, branch policy, gate, PR, review, merge, and retry policy. If absent, use the conservative defaults below and mention that `/project-config` can create repo-specific policy.

## Defaults

- Label: `ready-for-agent`
- Limit: `1`
- Confirmation: ask before starting each issue unless the user passed `--yes`
- Merge: never auto-merge
- Failure policy: stop on first failed/blocked issue in v1

Parse user arguments for:

- `--label <label>`
- `--focus <label|issue-number>`: scope ready-issue selection. A non-numeric value is a focus label: scope selection to issues that also carry `<label>`. A numeric value names an epic issue: scope selection to the epic's blocked-by dependency chain (epic mode, section 2). The focus filter composes with `--label`, it does not replace it
- `--limit <n>`
- `--yes`
- explicit issue numbers, if provided

If parsing is ambiguous, ask.

## 1. Preflight

Confirm repository and GitHub access:

```bash
git rev-parse --show-toplevel
gh repo view --json nameWithOwner,url
git status --short
git branch --show-current
```

If the worktree has unrelated changes, stop and ask. The loop must not mix queue work with user edits.

## 2. List candidate issues

If the user supplied explicit issue numbers, use those in order.

Otherwise list open issues with the selected label:

```bash
gh issue list --state open --label <label> --json number,title,labels,updatedAt,url --limit 50
```

When `--focus` carries a non-numeric label value, scope candidates to issues carrying both the ready label and the focus label, using exactly:

```bash
gh issue list --state open --label <label> --label <focus> --json number,title,labels,updatedAt,url --limit 50
```

Substitute the active ready label (the `--label` value after CLI/config defaults) for `<label>` and the `--focus` value for `<focus>`; the focus filter composes with `--label`, it does not replace it.

If no issues are found, report that the queue is empty for the selected label and stop. With `--focus`, an empty focus set — no ready issues carry the focus label, or the label does not exist — stops with reason `focus queue empty`; never fall back to the general ready queue.

When the `--focus` value is numeric (`--focus <issue-number>`), it names an epic (a feature head) and selection runs in epic mode:

- Focus set: the epic issue itself, when open and carrying the ready label, plus every open issue carrying the ready label whose blocked-by closure transitively includes the epic issue number.
- GitHub native blocked-by relationships are the only dependency source of truth. Query them with:

  ```bash
  gh api repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by
  ```

  The endpoint returns a JSON array of the issues blocking `<n>`. Issue-body "Blocked by" text is human documentation only and is never parsed.
- Discovery: list open issues carrying the ready label (limit 50), then for each candidate walk its blocked-by links transitively with the query above, to a maximum depth of 10 levels; the candidate joins the focus set when the walk reaches the epic issue number. Add the epic itself when it is open and ready.
- Missing data: an empty relationships array means no dependency info is recorded for that issue — treat the issue as having no known blockers and never infer dependencies from any other source.
- API error: when the dependency query fails, stop and report the failing command and observed error; never guess dependency order.
- Ordering: a focus-set member is dispatchable only when every issue in its blocked-by list is closed. When a member has an open blocker, skip it and record an explicit `blocked by #N` report line naming the open blocker; never dispatch a member before its open blocker.
- Re-evaluation: re-run the dependency queries on every selection pass, so a blocker closed or merged during the run makes its dependents eligible in the next pass.
- An empty epic focus set — the epic is not open and ready and no ready issue's blocked-by closure includes it — stops with reason `focus queue empty`; never fall back to the general ready queue.

## 3. Select next issue

Pick the first candidate not already attempted in this run.

In epic mode (numeric `--focus`), pick the first dispatchable focus-set member in dependency order — every issue in its blocked-by list closed — not already attempted in this run. Skip still-blocked members with an explicit `blocked by #N` report line naming the open blocker, and re-run the dependency queries before each selection so newly unblocked members become eligible.

When `--focus` is combined with explicit issue numbers, the explicit numbers win; warn the user when an explicit number is outside the focus set (does not carry the focus label or, in epic mode, is not a member of the epic's dependency chain).

Before starting it, read the issue and comments enough to show the user what will be worked:

```bash
gh issue view <number> --comments
```

Summarize the selected issue and the mutating work that will start if accepted:

```md
Next issue: #<number> <title>
Why selected: <label / explicit selection>
Likely scope: <one sentence>
Branch strategy: start from <default branch> and create/use `flock/issue-<number>-<short-slug>` unless the project config or user instructions say otherwise.
Next action if accepted: immediately dispatch to the `github-issue-worker` workflow in this same run.
```

If not running with `--yes`, ask for confirmation before continuing. If the user declines, stop without creating a branch, commit, issue update, PR, or other mutating change.

## 4. Dispatch one issue

After confirmation, or immediately when `--yes` is present, work the issue using the `github-issue-worker` skill. Do not ask the user to run a second command before dispatching.

In this v1 loop, do not independently implement inside the loop instructions. The issue worker owns:

- dispatchability check
- branch creation
- implementation
- verification
- commit/PR preparation
- handoff

Pass along any relevant loop context:

```md
Work issue #<number> using the github-issue-worker workflow.
The queue label was `<label>`.
This is item <i> of limit <limit>.
Do not auto-merge.
```

When the `subagent` tool is available and the issue worker chooses to delegate, prefer one `ic-dev` worker for implementation.

## 5. Interpret the result

Successful handoff means the issue worker returned:

```md
Issue:
Branch:
PR:
Validation:
Review verdict:
Tracker completion:
Workflow summary:
Changed:
Verified:
Review:
Next recommended human action:
Left out:
Unsure about:
```

Blocked handoff begins with:

```md
BLOCKED:
```

If blocked or failed, stop the loop and report the issue and reason. Do not continue to the next issue in v1. The final report must copy or condense the issue worker's stage statuses; do not invent validation or review results.

If successful, append a one-line run summary:

```md
- #<number>: <PR or branch> — <short result>
```

## 6. Continue or stop

Stop when:

- processed `--limit` issues
- candidate queue is empty
- focus queue is empty (`--focus` set and no ready issues carry the focus label; in epic mode, the epic is not open and ready and no ready issue's blocked-by closure includes it)
- the epic-mode dependency query fails (API error) — stop and report rather than guessing order
- user declined confirmation
- issue worker blocked/failed
- worktree becomes dirty in an unexpected way
- verification failed
- any command indicates the branch/worktree is not what you expect

Before starting the next issue, check:

```bash
git status --short
git branch --show-current
```

If the prior issue left an open branch with committed work or an open PR, decide whether to return to the default branch before continuing. Ask if unsure.

## 7. Final report

Return a final stage-by-stage summary. Mark every stage as succeeded, skipped, or failed. Failed stages must include a clear stop reason. Include the issue number, branch name when available, PR link when available, validation result, review verdict, tracker completion result, and next recommended human action. Do not claim validation, review, or tracker completion occurred unless command output was observed; copy or condense the issue worker's stage statuses when an issue was dispatched. When project config defers issue closure to post-merge, the worker leaves the issue open and reports closure as deferred; relay that status verbatim and never close the issue from the loop.

```md
Processed: <count>
Focus: <focus label and matched issue numbers; or, in epic mode, the epic issue number, the chain members, and a worked/skipped/blocked breakdown with each skip's `blocked by #N` line; or "none">
Stopped because: <reason>
Issue: #<number or "none selected">
Branch: <branch name when available, or "not created">
PR: <PR link when available, or "not opened">
Validation: <validation result from observed command output, or "not run">
Review verdict: <review verdict from observed review output, or "not run">
Tracker completion: <completion result from observed tracker command output, or "not run">
Workflow summary:
- Issue selection: <succeeded|skipped|failed> — <observed result or stop reason>
- Branch setup: <succeeded|skipped|failed> — <observed result or stop reason>
- Implementation: <succeeded|skipped|failed> — <observed result or stop reason>
- Validation: <succeeded|skipped|failed> — <observed result or stop reason>
- PR creation/update: <succeeded|skipped|failed> — <observed result or stop reason>
- Review: <succeeded|skipped|failed> — <observed result or stop reason>
- Tracker completion: <succeeded|skipped|failed> — <observed result or stop reason>
Summary:
- #<number>: <PR or branch> — <result>
Next recommended human action:
- <recommended next action>
```

## Red flags

| Thought | Reality |
|---|---|
| "The label means all candidates are safe." | Each issue still needs the issue worker dispatchability check. |
| "The loop can fix a blocked item and continue." | V1 stops on blocked work so the user can correct the queue. |
| "I can merge if checks pass." | V1 never auto-merges. |
| "I should implement directly in the loop." | The loop dispatches; the issue worker implements. |
| "Limit was not provided, so drain everything." | Default limit is 1. |
| "The issue body says \"Blocked by #5\", so it is blocked." | Issue-body text is documentation only; the GitHub blocked-by API is the sole dependency source of truth. |
| "The blocked-by query failed, so I'll order by issue number instead." | On dependency API error, stop and report; never guess dependency order. |
