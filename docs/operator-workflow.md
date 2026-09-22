# Bounded Flock operator workflow

This document specifies the planned Flock operator: an extension-backed workflow for trusted repositories where issues are already well shaped and the maintainer wants Flock to coordinate routine `status -> groom -> triage -> work -> repeat` cycles with bounded approvals.

The operator is not a fully autonomous software development agent. It is an orchestrator that launches existing Flock workflows, enforces repository policy, records what happened, and stops whenever human judgment is required.

## Goals

- Reduce repeated human prompting in repositories with reliable issue quality and a complete Flock project config.
- Let an external launcher or supervising system, such as Herdr, start and observe bounded Flock runs.
- Reuse existing Flock workflows instead of duplicating issue grooming, issue implementation, validation, review, or tracker completion logic.
- Make every automated approval explicit, auditable, and bounded by repository policy.
- Stop safely on ambiguity, failed checks, blocking review, unexpected repository state, or missing policy.

## Non-goals

- Auto-merging pull requests.
- Replacing product, architecture, or implementation judgment for ambiguous work.
- Working unconfigured repositories in mutating modes.
- Continuing after failed validation, blocking review, missing review target, unexpected branch state, or dirty worktree.
- Silently changing existing `/groom`, `/work`, `/issue`, or review safety defaults.

## Form factor

The operator should be extension-backed rather than prompt-only.

Reasons:

- The workflow needs durable run state, cycle limits, command execution, and structured logs.
- It may be launched by another agent or an external supervisor rather than a human typing every command.
- The extension can keep orchestration concerns separate from existing skills while still calling the skills' workflows.
- Long or repeated loops are easier to bound and audit with explicit state than with a single prompt transcript.

A prompt such as `/operate` can remain the human entry point, but the prompt should delegate orchestration to the operator extension.

## Operating modes

### Dry-run plan

Dry-run mode is read-only and may run without `docs/flock/project.md`.

It inspects repository state and reports the next safe action without mutating files, branches, commits, pull requests, issue labels, comments, or issue state.

Expected output:

- repository and tracker readiness
- project config presence and automation eligibility
- worktree and branch safety
- ready queue status
- grooming need, if observable
- triage need, if observable
- open PR or review bottlenecks
- recommended next action: groom, work, review, stop, or ask human
- whether mutating automation is blocked by missing or insufficient policy

### One-shot run

One-shot mode performs at most one mutating action after a read-only decision pass, then stops.

Requirements:

- `docs/flock/project.md` must exist.
- The project config must explicitly allow the selected approval category.
- The user or external launcher must opt into automation for the run.
- The operator must produce a stage-by-stage summary.

Examples of one-shot actions:

- run bounded grooming when grooming is allowed and no blocking questions exist
- run bounded triage when triage is allowed and a `needs-triage` issue can be moved to a clear next state
- dispatch one ready issue through the existing issue loop with routine issue-selection approval
- route to PR review when review is the safest next action

### Bounded loop

Loop mode repeats one-shot cycles until a limit or stop condition is reached.

Required limits:

- maximum cycles
- maximum issues worked
- maximum grooming changes or grooming batches
- maximum triage issues changed

Recommended limits:

- maximum runtime
- maximum consecutive no-op cycles
- maximum failures or retries, defaulting to zero retries

The loop may continue only when the prior cycle returned the repository to an expected safe state and the next action is still allowed by policy.

## Command policy

The operator should orchestrate existing Flock workflows instead of reimplementing them.

Allowed command families:

- status and routing checks equivalent to `/flock-status`
- bounded grooming through the `groom` workflow
- bounded triage through the `triage` workflow
- queued issue work through the `issue-loop` and `github-issue-worker` workflows
- PR or diff review through existing review workflows
- project config checks when needed

The operator must not:

- call merge commands
- bypass validation or review requirements
- close tracker items unless the underlying issue workflow reports successful implementation, observed validation, applicable PR preparation, and non-blocking review
- continue after an underlying workflow reports blocked or failed work
- mutate unconfigured repositories

## Approval policy categories

Mutating modes require project config approval policy. Missing policy means dry-run only.

The policy should distinguish at least these categories:

| Category | Default | Notes |
| --- | --- | --- |
| Issue selection for queued work | ask/blocked | May be auto-approved for trusted repos. |
| Grooming labels/comments | ask/blocked | May be auto-approved only when the groomer has no blocking questions and remains within limits. |
| Triage labels/comments | ask/blocked | May be auto-approved only when product-manager and tech-lead checks identify a clear next state within limits. |
| Branch creation | ask/blocked | Usually allowed when issue work is allowed. |
| Commits | ask/blocked | Usually allowed for issue work within the branch policy. |
| PR creation/update | ask/blocked | Allowed only when PR policy permits. |
| Tracker completion/issue close | ask/blocked | Allowed only through the issue worker's completion rules. |
| Merge | never | Human-only for v1. |

A trusted/high-automation repository can allow routine issue selection and bounded grooming. An unconfigured repository cannot run one-shot or loop automation.

### Example: conservative repository policy

```md
## Operator Approval Policy

Mutating operator automation requires explicit approval policy here. When this section is absent, operator workflows must use dry-run only and ask before any mutation.

Approval categories:
- Issue selection for queued work: ask
- Grooming labels/comments: ask
- Triage labels/comments: ask
- Branch creation: ask
- Commits: ask
- PR creation/update: ask
- Tracker completion/issue close: ask
- Merge: never

Limits:
- Max cycles per operator run: 1
- Max issues worked per operator run: 1
- Max grooming batches per operator run: 0
- Max triage issues per operator run: 0
- Max runtime: ask
```

### Example: trusted/high-automation repository policy

```md
## Operator Approval Policy

Mutating operator automation is allowed only when this config is present and the selected action is explicitly allowed below.

Approval categories:
- Issue selection for queued work: auto-approve for issues labeled `ready-for-agent` after the issue-loop dispatchability summary succeeds.
- Grooming labels/comments: auto-approve within the grooming batch limit when the groomer has no blocking product or technical questions.
- Triage labels/comments: auto-approve within the triage issue limit when product-manager and tech-lead checks identify a clear next state.
- Branch creation: auto-approve for configured issue branches from the configured base branch.
- Commits: auto-approve scoped commits on the issue branch after validation has been run.
- PR creation/update: auto-approve PR creation or updates using neutral `Refs #<number>` references.
- Tracker completion/issue close: auto-approve only through the issue worker completion policy after implementation, observed validation, PR preparation when applicable, and non-blocking review.
- Merge: never; human merge remains required.

Limits:
- Max cycles per operator run: 5
- Max issues worked per operator run: 3
- Max grooming batches per operator run: 1
- Max triage issues per operator run: 5
- Max runtime: ask when launching the operator
```

## Stop conditions

The operator must stop and report the reason when any of these occur:

- `docs/flock/project.md` is missing for a mutating mode
- approval policy is missing or does not allow the selected mutating action
- worktree has unrelated or unexpected changes
- current branch/base branch does not match expectations
- GitHub or tracker authentication fails
- required labels, commands, or validation gates are unavailable
- no safe next action exists
- grooming or triage finds a blocking product or technical question
- selected issue is ambiguous, too broad, already complete, or not dispatchable
- implementation fails or blocks
- validation fails or cannot be observed
- PR creation/update fails when required
- required review cannot run
- review verdict is blocking
- tracker completion fails when required
- configured cycle, issue, grooming, triage, runtime, or retry limits are reached
- an underlying Flock workflow reports blocked/failed status

## Run log and handoff

Every operator run should produce an auditable summary:

```md
Mode: <dry-run | one-shot | loop>
Repository: <owner/name>
Project config: <found/missing and policy summary>
Limits: <configured limits>
Actions:
- <cycle/action/status with issue/PR references when available>
Validation: <observed result or not run>
Review: <observed verdict or not run>
Tracker changes: <labels/comments/issues closed or none>
Stop reason: <limit reached | no safe action | blocked | failed | completed>
Next recommended human action: <merge/review/fix/configure/no action>
```

The operator must not claim validation, review, tracker changes, or completion unless the underlying command output was observed.

## First implementation slice

Implement the work in this order:

1. Add project config approval policy support.
2. Add a read-only dry-run operator that reports what it would do.
3. Add one-shot mutating mode gated by project config policy.
4. Add bounded loop mode after one-shot behavior is stable.

Dry-run is the only mode that may operate without project config. One-shot and loop modes must block until the repository has explicit operator policy.
