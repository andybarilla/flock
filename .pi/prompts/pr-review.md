---
description: Review a GitHub PR using the Flock PR review workflow
argument-hint: "<pr-number-or-url> [instructions]"
---

Use the `pr-review` skill to review this GitHub PR:

$ARGUMENTS

Default behavior:

- read PR metadata with `gh pr view`
- read the PR diff with `gh pr diff`
- review for correctness, tests, security, maintainability, and spec alignment
- run checks only when useful and safe
- return `Verdict: CLEAN` or `Verdict: BLOCKING` with actionable findings
