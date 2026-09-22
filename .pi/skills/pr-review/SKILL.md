---
name: pr-review
description: Reviews one GitHub pull request from the current repository. Use when the user asks to review PR #123, /pr-review, or a GitHub PR URL.
---

# PR Review

Review exactly one GitHub pull request.

Use the `ic-review` standard for finding quality and verdicts. Prefer reviewing the PR diff from GitHub rather than unstaged local working tree state.

## Project config

Before applying review defaults, check for `docs/flock/project.md`. If present, read it and use its review escalation triggers, blocking bar, tracker commands, and gate guidance. If absent, use this skill's conservative defaults and mention that `/project-config` can create repo-specific policy.

## Inputs

Accept any of:

- PR number: `123`
- PR reference: `#123`
- GitHub PR URL
- PR plus extra review instructions

If no PR is identifiable, ask for it.

## 1. Preflight

Confirm this is a Git repository with a GitHub remote:

```bash
git rev-parse --show-toplevel
gh repo view --json nameWithOwner,url
```

Read current branch/status for context, but do not require a clean tree for a GitHub diff review:

```bash
git status --short
git branch --show-current
```

If the user asks you to run checks locally, warn before doing anything that could overwrite local work.

## 2. Read PR metadata

Read PR metadata:

```bash
gh pr view <pr> --json number,title,body,state,author,url,headRefName,baseRefName,mergeable,reviewDecision,statusCheckRollup
```

If the PR links an issue, read that issue too when needed to understand acceptance criteria:

```bash
gh issue view <number> --comments
```

## 3. Read the diff

Read the PR diff from GitHub:

```bash
gh pr diff <pr>
```

Review the diff itself. Use the local worktree only for search, surrounding context, or running checks.

Useful local context commands:

```bash
git fetch origin
git diff --stat origin/<baseRefName>...origin/<headRefName>
```

Adjust remote refs as needed if the PR is from a fork.

## 4. Review focus

Check:

- correctness and edge cases
- acceptance criteria/spec alignment
- error handling
- security and data safety
- migration/backward compatibility risk
- concurrency/state assumptions
- tests and whether they exercise real behavior
- comments/docs that drifted from behavior
- maintainability and fit with existing patterns

Do not report style nits unless they hide a real problem or violate an explicit repo rule.

## 5. Optional verification

Run checks only when useful, safe, and reasonably scoped.

If running checks:

- state which command you are about to run when it is expensive or mutating
- read the actual output
- do not claim checks pass unless observed

Suggested lightweight checks:

```bash
git diff --check origin/<baseRefName>...origin/<headRefName>
```

## 6. Verdict

Use this format:

```md
Verdict: CLEAN | BLOCKING

Findings:
- Severity: Critical | Important | Minor
  File: <path:line or diff hunk>
  Problem: <what is wrong>
  Why it matters: <impact>
  Suggested fix: <specific fix or "not obvious">

Checked:
- <metadata/diff/check commands reviewed>

Notes: <optional, brief>
```

`Verdict: BLOCKING` means at least one finding should be fixed before merge.

`Verdict: CLEAN` means no blocking findings. Minor non-blocking notes are allowed, but keep them brief.

## 7. If delegated through subagent

When the `subagent` tool is available, a dispatcher may delegate the review to the project `ic-review` agent. The delegated task must include:

- PR number or URL
- PR title/body summary
- linked issue or acceptance criteria when available
- instruction to review `gh pr diff <pr>`
- this output format

The parent session still owns the final answer to the user.

## Red flags

| Thought | Reality |
|---|---|
| "The PR description is enough." | Read the diff. |
| "The local working tree shows the PR." | Review GitHub's PR diff unless explicitly told otherwise. |
| "I found a nit, so BLOCKING." | Blocking is for merge-relevant issues. |
| "No test run means no review." | You can review statically; just say what you did and did not run. |
| "The linked issue is probably implemented." | Check acceptance criteria when the PR body is vague. |
