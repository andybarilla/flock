---
description: Work a specific GitHub issue using the Flock issue-worker workflow
argument-hint: "<issue-number-or-url> [instructions]"
---

Use the `github-issue-worker` skill to work this GitHub issue:

$ARGUMENTS

Default behavior:

- read the issue and comments with `gh`
- confirm it is one implementable unit
- create an issue branch
- implement with the Flock IC workflow
- verify with real command output
- prepare or open a PR using neutral issue references rather than PR auto-close wording
- automatically run separate review when there is a PR or reviewable diff
- explicitly mark the tracker item complete after successful implementation, observed validation, PR/update preparation when applicable, and non-blocking review
- leave the tracker item open when work is blocked, validation fails, review is blocking, or review cannot run
- return a stage-by-stage summary that marks each stage as succeeded, skipped, or failed and gives any failed stage's stop reason
- include the issue number, branch name when available, PR link when available, validation result, review verdict, tracker completion result, and next recommended human action
- Do not claim validation, review, or tracker completion occurred unless command output was observed
