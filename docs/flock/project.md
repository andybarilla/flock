# Flock Project Config

Status: complete. This file records the repository-specific Flock policy for `andybarilla/flock`.

## Tracker

System: GitHub Issues
Repository: `andybarilla/flock`
URL: `https://github.com/andybarilla/flock`
Default branch: `main`

Read issue:

```bash
gh issue view <number> --comments
```

List ready issues:

```bash
gh issue list --state open --label ready-for-agent --json number,title,labels,updatedAt,url --limit 50
```

Read PR:

```bash
gh pr view <number> --json number,title,body,state,author,url,headRefName,baseRefName,mergeable,reviewDecision,statusCheckRollup
```

Read PR diff:

```bash
gh pr diff <number>
```

## Labels

Current repository labels inspected with `gh label list --limit 200`.

Existing useful labels:
- `bug`
- `documentation`
- `enhancement`
- `question`
- `wontfix`

Flock state labels:

- ready-for-agent: `ready-for-agent`
- needs-triage: `needs-triage`
- needs-info: `needs-info`
- ready-for-human: `ready-for-human`
- wontfix: `wontfix`

Size labels:
- epic: `epic`

Other labels of interest:
- bug: `bug`
- enhancement: `enhancement`
- documentation: `documentation`

## Branch

Default base branch: `main`
Issue branch pattern: `flock/issue-<number>-<short-slug>`
PR branch pattern: same as issue branch pattern unless a user chooses otherwise.

Before starting issue work:

```bash
git fetch origin
git checkout main
git pull --ff-only
git checkout -b flock/issue-<number>-<short-slug>
```

## Gate

Repository validation command:

```bash
npm run check
```

This runs:

```bash
npm run typecheck && git diff --check
```

For documentation-only changes, `git diff --check` is usually sufficient, but `npm run check` is the default gate for Flock changes.

Notes:
- `npm run typecheck` validates TypeScript extension files under `.pi/extensions/**/*.ts`.
- `git diff --check` catches whitespace and conflict-marker issues.
- Lightweight behavior tests for prompt, skill, and package-resource loading are part of the default gate via `npm test`.

## PR

Open PRs with:

```bash
git push -u origin HEAD
gh pr create --fill
```

Tracker completion policy:
- Use neutral PR references such as `Refs #<number>`; do not rely on PR auto-close wording to complete issues.
- After successful issue work, explicitly comment with completion evidence and close the GitHub issue with `gh issue close <number> --reason completed`.
- Close only after implementation, observed validation, PR/update preparation when applicable, and required review have succeeded with no blocking verdict.
- Leave the issue open when work is blocked, validation fails, review is blocking, or required review cannot run.
- Check commit messages for accidental closing keywords before opening the PR.

## Review

Default review tier: standard
Advanced review available: yes

Escalate to advanced review when:
- `.pi/extensions/**` changes, because extension code can execute commands and mutate files
- package installation/loading behavior changes
- workflow logic for `/work`, `/issue`, `/groom`, `/project-config`, or `/flock-status` changes
- GitHub label, branch, merge, or retry policy changes
- generated package metadata changes
- tests/gates are absent or weak for a non-documentation change

Blocking bar:
- incorrect workflow routing or unsafe default behavior
- a skill that can mutate tracker state without explicit user confirmation
- a queue/issue workflow that ignores project config when present
- package manifest changes that prevent prompts, skills, or extensions from loading
- extension changes that break bundled agent discovery or subagent execution

## Merge

Policy: human merges

Notes:
- Flock v1 workflows never auto-merge.
- Do not add dispatcher merge behavior until there is an explicit user decision and a verified check-wait command.

## Retry

Policy: no retry

Notes:
- Flock v1 issue-loop stops on blocked/failed work.
- Retry policy can be revisited after claim/label behavior and gates are stable.

## Workflow Defaults

Ready queue label: `ready-for-agent`
Groom target depth: 6
Groom batch size: 10
Issue loop default limit: 1
Confirm before starting queued issue: yes
Auto-merge: no

## Project Notes

- Flock is distributed as a pi package via `package.json`.
- Pi package resources are declared under the `pi` key: `.pi/extensions`, `.pi/skills`, and `.pi/prompts`.
- Bundled subagent definitions live under `.pi/agents` and are loaded by the `flock-subagent` extension because pi packages do not have a native agents resource type.
- `/flock-status` is the default starting point for a repository health check.
- `/scout-and-plan` is the safe read-only investigation workflow.
- `/implement` and `/implement-and-review` can mutate files through the `ic-dev` subagent.

## Open Questions

None.
