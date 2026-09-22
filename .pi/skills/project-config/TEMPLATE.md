# Flock Project Config

This file tells Flock skills how this repository handles tracked work. Keep repository policy here, not machine-specific commands or personal preferences.

## Tracker

System: GitHub Issues
Repository: <owner/repo>
Read issue: `gh issue view <number> --comments`
List ready issues: `gh issue list --state open --label ready-for-agent --json number,title,labels,updatedAt,url --limit 50`
Read PR: `gh pr view <number> --json number,title,body,state,author,url,headRefName,baseRefName,mergeable,reviewDecision,statusCheckRollup`
Read PR diff: `gh pr diff <number>`

## Labels

State labels:
- ready-for-agent: `<label>`
- needs-triage: `<label>`
- needs-info: `<label>`
- ready-for-human: `<label>`
- wontfix: `<label>`

Size labels:
- epic: `<label or body convention>`

Other labels of interest:
- bug: `<label>`
- enhancement: `<label>`

## Branch

Default base branch: `<main|master|other>`
Issue branch pattern: `flock/issue-<number>-<short-slug>`
PR branch pattern: `<if different>`

Before starting issue work:

```bash
git fetch origin
git checkout <base>
git pull --ff-only
git checkout -b flock/issue-<number>-<short-slug>
```

## Gate

Commands that prove a worker's change locally:

```bash
<command>
```

Notes:
- <what a false green looks like, if known>
- <slow/expensive checks, if any>

## PR

Open PRs with:

```bash
git push -u origin HEAD
gh pr create --fill
```

Tracker completion policy:
- Use neutral PR references such as `Refs #<number>`; do not rely on PR auto-close wording to complete issues.
- After successful issue work, explicitly comment with completion evidence and close the tracker item.
- Close only after implementation, observed validation, PR/update preparation when applicable, and required review have succeeded with no blocking verdict.
- Leave the tracker item open when work is blocked, validation fails, review is blocking, or required review cannot run.
- Check commit messages for accidental closing keywords before opening the PR.

## Review

Default review tier: standard
Advanced review available: yes
Escalate to advanced review when:
- security/auth/permissions are touched
- data migrations or deletion are touched
- concurrency/state machines are touched
- public APIs or compatibility are touched
- tests are weak or acceptance criteria are unclear

Blocking bar:
- correctness bugs
- missing required behavior
- meaningful test gaps
- security/data-safety risk

## Merge

Policy: human merges

Notes:
- Flock v1 workflows never auto-merge.
- If this changes later, record exact check-wait and merge commands here.

## Retry

Policy: no retry

Notes:
- Flock v1 issue-loop stops on blocked/failed work.

## Workflow Defaults

Ready queue label: ready-for-agent
Groom target depth: 6
Groom batch size: 10
Issue loop default limit: 1
Confirm before starting queued issue: yes

## Project Notes

- <repo-specific conventions, docs, or risks>
