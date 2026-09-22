# Flock Operating Model

Flock models software work as a set of roles with strict boundaries.

## Roles

### Dispatcher

Coordinates work but does not implement or deeply review code.

Responsibilities:

- select work
- assemble briefs
- prepare branches/worktrees
- delegate implementation and review
- summarize outcomes
- stop when safety checks fail

### IC developer

Implements one scoped task.

Responsibilities:

- understand done criteria
- inspect the repo
- write or update tests where appropriate
- implement the change
- verify with real command output
- report what changed and what remains uncertain

### Reviewer

Reviews a diff or PR.

Responsibilities:

- check correctness, tests, security, maintainability, and spec alignment
- cite concrete files/lines when possible
- return actionable findings only
- give a clear merge verdict

### Manager roles

Higher-level roles are deferred until IC workflows are reliable.

Examples:

- tech lead
- engineering manager
- product manager

They should orchestrate lower-level workflows rather than replace them.

## Prompt contract

Standard task prompts should include:

```md
Objective:
Context:
Constraints:
Definition of Done:
Validation:
Notes:
```

Issue-driven prompts should include:

```md
Issue:
Repo:
Branch strategy:
Acceptance criteria:
Test command:
Review expectations:
```

## Normal entry point

Use `/flock-status` as the default starting command in a repository. It is read-only and status/routing only: it checks Flock readiness, flags blockers, and recommends the next command without implementation or file edits.

Use `/lead` for deeper technical sequencing and `/scout-and-plan` for deeper read-only investigation after status identifies an unclear area.

## Project configuration

When present, `docs/flock/project.md` is the repository-specific contract for Flock workflows. It records labels, branch naming, validation gates, PR policy, review policy, merge policy, retry policy, and workflow defaults.

Use `/project-config` to create or check it. When absent, workflows use conservative defaults and should mention that a project config would make them repo-specific.

## Safety rules

- Do not guess when ambiguity changes the implementation.
- Do not claim verification without reading command output.
- Do not expand scope silently.
- Do not run multiple mutating workers in the same worktree.
- Prefer PR/diff review over reviewing unstaged working tree state.
- If a workflow says dispatcher, worker, and reviewer are separate roles, keep them separate.

## Subagent model

Pi does not have built-in subagents. Flock will implement delegation through a project-local extension that spawns separate pi subprocesses.

Read-only agents may share a checkout. Mutating agents should run one at a time in an owned worktree.
