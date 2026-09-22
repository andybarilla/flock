---
name: github-issue-worker
description: Works one GitHub issue from the current repository. Use when the user asks to work issue #123, /issue, or a GitHub issue URL.
---

# GitHub Issue Worker

Work exactly one GitHub issue in the current repository.

You may implement directly in the current pi session, or delegate implementation to the `ic-dev` subagent when the `subagent` tool is available. Keep the workflow conservative: one issue, one branch, one implementation path, one handoff.

## Project config

Before applying branch, validation, PR, review, merge, or retry defaults, check for `docs/flock/project.md`. If present, read it and follow its repository-specific policy. If absent, use the conservative defaults in this skill and mention that `/project-config` can create repo-specific policy.

## Inputs

Accept any of:

- issue number: `123`
- issue reference: `#123`
- GitHub issue URL
- issue plus extra instructions

If no issue is identifiable, ask for it.

## 1. Preflight

Confirm this is a Git repository with a GitHub remote:

```bash
git rev-parse --show-toplevel
gh repo view --json nameWithOwner,url
```

Check current state:

```bash
git status --short
git branch --show-current
```

If the worktree has unrelated changes, stop and ask before continuing. Do not overwrite or mix user work into the issue branch.

## 2. Read the issue

Read the issue and comments:

```bash
gh issue view <number> --comments
```

Also capture structured metadata when useful:

```bash
gh issue view <number> --json number,title,body,state,labels,assignees,author,url
```

Treat the body and comments as one chronological record. Later comments may answer or amend earlier text.

## 3. Dispatchability check

Before editing, decide whether the issue is actually one implementable unit.

Stop and report instead of implementing when:

- the current issue record contains unresolved implementation-changing ambiguity
- the issue asks for several independently shippable outcomes
- the issue is an epic/tracking item rather than implementation work
- the requested work appears already completed
- credentials, production access, or a human decision are required

If it is not dispatchable, return a final stage-by-stage summary. Mark each stage as succeeded, skipped, or failed, include the stop reason for the failed stage, and do not claim validation or review occurred unless command output was observed:

```md
BLOCKED: <reason>
Issue: #<number> <title>
URL: <url>
Branch: <branch name when available, or "not created">
PR: <PR link when available, or "not opened">
Validation: <validation result, or "not run">
Review: <review verdict, or "not run">
Tracker completion: <completion result, or "not run">
Workflow summary:
- Issue selection: <succeeded|skipped|failed> — <observed result or stop reason>
- Branch setup: <succeeded|skipped|failed> — <observed result or stop reason>
- Implementation: <succeeded|skipped|failed> — <observed result or stop reason>
- Validation: <succeeded|skipped|failed> — <observed result or stop reason>
- PR creation/update: <succeeded|skipped|failed> — <observed result or stop reason>
- Review: <succeeded|skipped|failed> — <observed result or stop reason>
- Tracker completion: <succeeded|skipped|failed> — <observed result or stop reason>
Next recommended human action: <question, decomposition, or human action>
Needed: <question, decomposition, or human action>
```

## 4. Restate done

Before branching or editing, write a short implementation brief:

```md
Issue: #<number> <title>
URL: <url>
Done means:
- <observable acceptance criterion>
- <observable acceptance criterion>
Validation:
- <commands/checks expected>
Out of scope:
- <anything explicitly not included, or "nothing stated">
Open questions:
- <or "none">
```

If `Open questions` is not `none`, stop and ask.

## 5. Create an issue branch

Start from the repository's current default branch unless the user said otherwise.

Suggested branch name:

```text
flock/issue-<number>-<short-slug>
```

Commands, adjusted for the repo:

```bash
git fetch origin
git checkout main || git checkout master
git pull --ff-only
git checkout -b flock/issue-<number>-<short-slug>
```

If the repo uses a different default branch, use it.

## 6. Implement

Use the `ic-dev` workflow.

When the `subagent` tool is available and the task is non-trivial, prefer delegating implementation to the project `ic-dev` agent with a complete brief. Otherwise implement directly after loading the `ic-dev` skill.

Implementation brief for delegation:

```md
Work GitHub issue #<number> to completion in this worktree.

<issue title, body, and relevant comments verbatim or faithfully summarized with links>

<the Done means / Validation / Out of scope brief>

Follow the Flock ic-dev workflow. Verify with real command output. Do not guess on implementation-changing ambiguity.
```

Whether delegated or direct:

- inspect before editing
- prefer failing test first where practical
- keep changes scoped to the issue
- update comments/docs that describe changed behavior
- do not commit secrets or generated junk

## 7. Verify

Run the relevant checks. Use repo conventions when available.

Common discovery commands:

```bash
find . -maxdepth 3 -iname 'package.json' -o -iname 'pyproject.toml' -o -iname 'Cargo.toml' -o -iname 'go.mod'
git diff --stat
git diff --check
```

Do not claim a check passed unless you read its output. Record the observed command output/result for the final validation result. Do not claim validation, review, or tracker completion occurred unless command output was observed.

## 8. Commit and PR

Unless the user asked not to commit, create a coherent commit:

```bash
git status --short
git add <files>
git commit -m "<concise issue-focused message>"
```

Before opening a PR, inspect commits for accidental closing keywords. Flock completion is an explicit tracker step, not PR auto-close behavior:

```bash
git log --oneline --decorate origin/main..HEAD || git log --oneline --decorate origin/master..HEAD
```

Open or prepare a PR according to user preference. If opening:

```bash
git push -u origin HEAD
gh pr create --fill
```

Use neutral references such as `Refs #<number>` in PR text. Do not rely on PR closing keywords to complete tracker items; completion is handled after validation and review.

## 9. Automatic review handoff

After successful implementation and verification, invoke a separate review role before the final handoff when there is a review target.

Review target detection:

1. If a PR was opened or updated, review that PR with the `pr-review` workflow.
2. Otherwise, if there is a reviewable local diff against the base branch, review that diff with the `ic-review` workflow.
3. If there is no PR and no reviewable diff, stop and explain clearly that review could not run because no review target exists.

Keep implementation and review roles separate:

- Do not review your own implementation inline as a substitute for `pr-review` or `ic-review`.
- When the `subagent` tool is available, prefer delegating local-diff review to the project `ic-review` agent.
- Do not run an automatic fix pass from this workflow; report review findings and verdict only.
- Do not auto-merge. Human merge remains manual.

The review output must include findings and a merge/readiness verdict, using the review workflow's verdict format.

## 10. Complete tracker item

After implementation, observed validation, PR creation/update when applicable, and required review have all succeeded with no blocking review verdict, explicitly mark the tracker item complete before the final handoff.

For GitHub Issues:

```bash
gh issue comment <number> --body '<completion evidence>'
gh issue close <number> --reason completed
```

The completion comment must include the issue number, branch name, PR link when available, validation result, review verdict, and next recommended human action. Do not close the issue when implementation is incomplete, validation failed, review is blocking, the workflow is blocked, or required review could not run. Leave the issue open with a clear status comment when useful.

**Closure deferral to post-merge:** When `docs/flock/project.md` defers issue closure to post-merge (a conditional Merge policy, or a tracker completion policy that closes only after verified merge), the worker must not close the issue. Post the completion-evidence comment, state in it that closure is deferred until the PR is merged and verified, and report tracker completion in the handoff as `deferred — closure after merge per project config`. The supervising operator (under its explicit Merge approval policy) or a human runs `gh issue close` after merge verification. When closure is deferred, closing is the supervisor's or the human's decision, never the worker's.

This is a tracker completion step, not a GitHub PR-body convention. Keep wording neutral so future non-GitHub trackers can map this stage to their own "mark complete" action.

## 11. Handoff

Return exactly this final stage-by-stage summary. Mark every stage as succeeded, skipped, or failed. Failed stages must include a clear stop reason. Include the issue number, branch name when available, PR link when available, validation result, review verdict, tracker completion result, and next recommended human action. Do not claim validation, review, or tracker completion occurred unless command output was observed; use `skipped — not run` when a stage did not run.

```md
Issue: #<number> <title>
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
Changed: <one or two sentences>
Verified: <commands run and observed result, or "not run">
Review: <review target and verdict, or clear reason review did not run>
Tracker completion: <tracker item closed/marked complete, left open with reason, or not run>
Next recommended human action: <merge/review/fix/unblock/no action, based only on observed results>
Left out: <or "nothing">
Unsure about: <or "nothing">
```

If blocked, use the blocked format from step 3 with the same stage names and evidence rules.

## Red flags

| Thought | Reality |
|---|---|
| "The ready label means it is implementable." | Read the issue and comments; labels can be stale. |
| "I can combine this with nearby cleanup." | One issue means one scoped change. |
| "A comment asked a question, so it is blocked." | Later comments may answer it; read chronologically. |
| "The PR body says Refs, so closing keywords are safe in commits." | GitHub can close from the squash commit body. Check commit messages and use explicit tracker completion instead. |
| "The subagent did the work, so I don't need to inspect anything." | You still own the handoff and verification claims. |
