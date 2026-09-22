---
name: groom
description: Grooms GitHub issues into a ready-for-agent queue. Use when the user asks to groom the backlog, stock the ready queue, classify issues, or run /groom.
---

# Groom

Groom this repository's GitHub issue backlog toward a ready-for-agent queue target.

This skill classifies issues; it does not implement them. It should make the ready queue more useful without churning already-classified work.

## Project config

Before applying defaults, check for `docs/flock/project.md`. If present, read it and use its state labels, epic convention, ready queue label, groom target, and batch size. If absent, use the conservative defaults below and mention that `/project-config` can create repo-specific policy.

## Defaults

- Target ready-for-agent depth: `6`
- Batch size: `10`
- State labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`
- Epic label: `epic`

Parse user arguments for:

- `--target <n>`
- `--batch <n>`
- custom label names, if supplied explicitly

If the repository uses different state labels, discover and adapt only after confirming with the user or repo docs.

## 1. Preflight

Confirm repository and GitHub access:

```bash
git rev-parse --show-toplevel
gh repo view --json nameWithOwner,url
gh label list --limit 200
```

If required labels are missing, stop and report which labels are missing. Do not invent labels unless the user asks you to create them.

## 2. Measure first

Read open issues:

```bash
gh issue list --state open --json number,title,labels,createdAt,updatedAt,url --limit 200 > /tmp/flock-groom-issues.json
```

Count:

- total open issues
- `ready-for-agent`
- `needs-triage`
- `needs-info`
- `ready-for-human`
- `wontfix`
- no state label
- no-state epics

Use the repository's actual state label names if they differ.

If the raw `ready-for-agent` count is at or above target, do not assume success yet. Audit enough ready-labelled issues to determine whether they are dispatchable.

## 3. Audit ready-labelled issues

Read ready-labelled issues, including comments, until either:

- `dispatchable_ready` reaches the target, or
- the ready-labelled set is exhausted

Command shape:

```bash
gh issue list --state open --label ready-for-agent --json number,title,url --limit 50
gh issue view <number> --comments
```

Treat body and comments as one chronological record. Later comments may answer or replace earlier uncertainty.

An issue is dispatchable when a fresh agent could implement it without hidden context and know when it is done.

Mark a ready-labelled issue as stale-ready, without relabelling it, when:

- it still has an implementation-changing open question
- it asks for several independently shippable outcomes
- it is an epic/tracking item rather than one implementation unit
- part or all of it appears already shipped
- required context is missing

If `dispatchable_ready >= target`, stop. Report the raw ready count, dispatchable count, stale-ready count, and say the queue is stocked.

## 4. If no classification can help

If dispatchable ready is below target and there are no no-state issues, report what is blocking the queue:

- `needs-triage` issues need a decision or decomposition
- `needs-info` issues need a person to answer
- stale-ready issues need correction, decomposition, or closure
- if none of those exist, the backlog lacks agent-ready work

Do not churn already-classified labels during grooming.

## 5. Select one no-state batch

Select at most `--batch` no-state issues, newest-created first.

```bash
gh issue list --state open --json number,title,labels,createdAt,url --limit 200
```

Only choose issues with none of the state labels.

Reason: long grooming runs drift. Classify one bounded batch, then report.

## 6. Classify each selected issue

Read each issue and comments:

```bash
gh issue view <number> --comments
```

Choose exactly one state.

### `ready-for-agent`

Use when the issue is fully specified and one cohesive implementation unit.

Before applying the label, post a brief comment:

```md
> *Written by an agent during grooming.*

## Brief

**Current behavior:** <what happens now>
**Desired behavior:** <what should happen, including edge cases>
**Key interfaces:** <symbols, commands, config names, API shapes, etc.>
**Acceptance criteria:**
- <concrete, independently verifiable criterion>
- <criterion>
**Out of scope:** <what not to touch>
```

Brief rules:

- Name symbols and behavior, not fragile line numbers.
- Keep it behavioral, not a step-by-step implementation recipe.
- If you cannot write acceptance criteria, the issue is not ready.

Then apply the label:

```bash
gh issue edit <number> --add-label ready-for-agent
```

### `needs-triage`

Use when a decision, decomposition, or maintainer judgment is required.

Post a comment naming the decision needed, then label it:

```bash
gh issue comment <number> --body '<comment>'
gh issue edit <number> --add-label needs-triage
```

### `needs-info`

Use when a specific person must answer a question.

Ask the question in a comment, then label it.

### `ready-for-human`

Use when the work is specified but requires a human action, credential, product judgment, or production access.

Say what human action is needed.

### `wontfix`

Use only when the issue is clearly ruled out by explicit project policy or user instruction. Otherwise prefer `needs-triage`.

## 7. Decompose epics conservatively

If an issue has the epic label or clearly contains multiple independently shippable outcomes, do not label the epic `ready-for-agent`.

Either:

- label it `needs-triage` with a comment explaining it needs decomposition, or
- if the user explicitly asked for decomposition, create child issues as vertical slices.

A vertical slice should cross layers as needed to deliver one observable behavior. Do not split into "schema", "API", and "UI" issues unless each is independently shippable.

## 8. Report

Return:

```md
Target: <n>
Before:
- ready-for-agent: <raw count>
- dispatchable ready: <audited count>
- stale ready: <count>
- no state: <count>

Changed:
- #<number>: <label> — <reason>

After:
- ready-for-agent: <raw count>
- estimated dispatchable ready: <count>

Next:
- <what would stock the queue next>
```

Always distinguish raw labels from dispatchable ready work.

## Not in scope

- implementing issues
- merging PRs
- silently relabelling already-classified issues
- closing issues unless clearly instructed
- grooming the whole backlog in one pass
- making product decisions without user/project guidance

## Red flags

| Thought | Reality |
|---|---|
| "The ready label count met the target." | Audit dispatchability; labels can be stale. |
| "This no-state issue is probably ready, but I cannot write criteria." | Then it is not ready. |
| "I can classify 80 issues while I am here." | Bounded batches avoid drift. |
| "This epic has an obvious first step, so label it ready." | File or request a slice; do not make the epic ready. |
| "This needs a decision, but I can choose." | Label `needs-triage` and name the decision. |
