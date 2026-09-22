---
name: triage
description: Resolves needs-triage GitHub issues by applying product-manager then tech-lead judgment and moving each issue to the most accurate state label.
---

# Triage

Resolve `needs-triage` issues into a more actionable state. This skill is for decision-making and classification; it does not implement issues.

`needs-triage` should not be a sticky holding label. It means a specific product or technical decision is required before an implementation agent can safely work the issue.

## Project config

Before applying defaults, check for `docs/flock/project.md`. If present, read it and use its state labels, epic convention, ready queue label, and approval policy. If absent, use the conservative defaults below and ask before mutating GitHub state.

## Defaults

- State labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `blocked`, `wontfix`
- Epic label: `epic`
- Batch size: `5`
- Mutate labels/comments only when project config explicitly allows triage labels/comments or the user explicitly requested mutation.

Parse user arguments for:

- an issue number or URL
- `--batch <n>`
- `--dry-run`
- `--yes` / explicit permission to apply comments and labels

If no issue is specified, select up to the batch size of open issues labelled `needs-triage`, newest updated first.

## 1. Preflight

Confirm repository and GitHub access:

```bash
git rev-parse --show-toplevel
gh repo view --json nameWithOwner,url
gh label list --limit 200
```

If required labels are missing, stop and report which labels are missing. Do not invent labels unless the user asks you to create them.

Confirm mutation policy:

- If `docs/flock/project.md` has an Operator Approval Policy that allows triage labels/comments, mutations are allowed within the requested batch.
- If the user passed `--dry-run`, do not mutate even when policy allows it.
- If policy is absent or unclear, inspect and recommend only; ask before mutating.

## 2. Select issues

Read selected issues including comments:

```bash
gh issue view <number> --json number,title,body,labels,comments,url,createdAt,updatedAt
```

Treat body and comments as one chronological record. Later comments may answer or replace earlier uncertainty.

Only triage issues currently labelled `needs-triage` unless the user explicitly named another issue and asked for assessment.

## 3. Product-manager pass

Ask whether product intent is sufficient:

- What user/operator outcome should change?
- Is the scope clear enough to avoid product guessing?
- Are acceptance criteria concrete and independently verifiable?
- Are priority, non-goals, and edge cases clear enough for the likely implementation?

If a product decision is still required, keep `needs-triage` and comment with the exact decision needed.

If a specific person must answer a factual question, move to `needs-info` and ask that question.

If product intent is clear, continue to the tech-lead pass.

## 4. Tech-lead pass

Ask whether the work is technically dispatchable:

- Is it one cohesive implementation unit rather than an epic/tracking item?
- Are dependencies and sequencing clear?
- Are required interfaces, commands, config keys, files, or workflows named well enough?
- Can a fresh implementation agent know when it is done without hidden context?
- Is the issue blocked by credentials, production access, policy approval, or another issue?

If a technical decision or decomposition is still required, keep `needs-triage` and comment with the exact decision needed.

If the issue is specified but requires a human action, credential, external access, or approval, move to `ready-for-human` and comment with the human action needed.

If product and technical scope are clear but a named dependency, external action, or prerequisite must be resolved before implementation, move to `blocked` and comment with the blocker.

If it is an epic/tracking issue, do not mark it `ready-for-agent`; keep or move it to `needs-triage` with a decomposition/tracking comment unless the user explicitly asked you to create child issues.

If the only concern is sequencing on another issue, do not call that triage unless a decision remains. Use `blocked` when the repository documents it as a state label; otherwise keep the issue out of `ready-for-agent` and comment that it is blocked by the named dependency.

## 5. Ready outcome

An issue is dispatchable when product and technical passes have no unresolved decisions and a fresh agent could implement it safely.

Before applying `ready-for-agent`, ensure the issue body or latest comments contain an agent-ready brief. If not, post one:

```md
> *Written by an agent during triage.*

## Brief

**Current behavior:** <what happens now>
**Desired behavior:** <what should happen, including edge cases>
**Key interfaces:** <symbols, commands, config names, API shapes, etc.>
**Acceptance criteria:**
- <concrete, independently verifiable criterion>
- <criterion>
**Out of scope:** <what not to touch>
```

Then remove `needs-triage` and apply `ready-for-agent`:

```bash
gh issue edit <number> --remove-label needs-triage --add-label ready-for-agent
```

Do not apply `ready-for-agent` when acceptance criteria cannot be written.

## 6. Other outcomes

Use exactly one state label after triage whenever repository policy permits relabelling:

- `ready-for-agent`: dispatchable now, with an agent-ready brief.
- `ready-for-human`: specified, but blocked on human action/approval/access.
- `needs-info`: a specific person or reporter must answer a factual question.
- `needs-triage`: a specific product/technical decision or decomposition remains.
- `blocked`: scope is clear, but a named dependency, external action, or prerequisite prevents implementation.
- `wontfix`: only when explicitly ruled out by project policy or user instruction.

When moving away from `needs-triage`, remove it in the same edit that applies the new state label.

## 7. Report

Return:

```md
Mode: <dry-run|mutating>
Reviewed:
- #<number>: <old state> -> <new state> — <product pass result>; <tech-lead pass result>

Changed:
- #<number>: <comments/labels applied, or none>

Still needs triage:
- #<number>: <specific unresolved decision>

Ready now:
- #<number>: <why dispatchable>

Next:
- <recommended next workflow>
```

Always distinguish “blocked by dependency” from “needs triage.”

## Not in scope

- implementing issues
- merging PRs
- closing issues unless explicitly instructed and clearly justified
- creating child issues unless the user explicitly asks for decomposition
- making product decisions without user/project guidance
- relabelling unrelated already-classified issues

## Red flags

| Thought | Reality |
|---|---|
| "It has `needs-triage`, so leave it there." | Triage must identify a specific remaining decision or move the issue onward. |
| "It depends on another issue, so it needs triage." | Dependency blocking is not triage unless a decision remains. |
| "The product question is probably obvious." | If product intent changes implementation, ask or keep `needs-triage`. |
| "This epic has clear acceptance criteria, so it is ready." | Epics are tracking items; dispatch slices, not epics. |
| "I can work the issue while triaging." | Triage classifies; it does not implement. |
