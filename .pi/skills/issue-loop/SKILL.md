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

If no issues are found, report that the queue is empty for the selected label and stop.

## 3. Select next issue

Pick the first candidate not already attempted in this run.

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
Changed:
Verified:
Review:
Left out:
Unsure about:
```

Blocked handoff begins with:

```md
BLOCKED:
```

If blocked or failed, stop the loop and report the issue and reason. Do not continue to the next issue in v1.

If successful, append a one-line run summary:

```md
- #<number>: <PR or branch> — <short result>
```

## 6. Continue or stop

Stop when:

- processed `--limit` issues
- candidate queue is empty
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

Return:

```md
Processed: <count>
Stopped because: <reason>
Summary:
- #<number>: <PR or branch> — <result>
Next:
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
