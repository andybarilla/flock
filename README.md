# flock

Pi-native skills, prompt templates, agents, and extensions for managing software development sessions.

## Current resources

Prompt templates:

- `/flock-status` — default Flock starting command for status, readiness, and next workflow routing
- `/dev` — implement a development task with the Flock IC workflow
- `/review` — review code changes with the Flock review workflow
- `/pr-review` — review a GitHub pull request
- `/issue` — work a specific GitHub issue
- `/work` — work ready-for-agent GitHub issues one at a time
- `/groom` — classify GitHub issues toward a ready-for-agent queue target
- `/triage` — resolve `needs-triage` issues into ready, blocked, human, info, or explicit decision states
- `/project-config` — create or check repo-specific Flock configuration
- `/manager` — assess repo/team status, queue health, blockers, and next action
- `/product` — shape product goals into requirements, priorities, and agent-ready issue briefs
- `/lead` — plan, sequence, decompose, and route technical work
- `/scout-and-plan` — delegate deeper read-only reconnaissance and planning after status identifies an unclear area
- `/implement` — delegate scout → planner → IC implementation
- `/implement-and-review` — delegate implementation → review → fix pass

Skills:

- `flock-status` — read-only repo/Flock health check and recommended next command
- `ic-dev` — individual contributor implementation workflow
- `ic-review` — code review workflow
- `github-issue-worker` — work one GitHub issue
- `pr-review` — review one GitHub pull request
- `issue-loop` — work ready-for-agent issues one at a time
- `groom` — classify GitHub issues and stock the ready queue
- `triage` — move `needs-triage` issues to the most accurate state, including `blocked`, when decisions are resolved
- `project-config` — create or check `docs/flock/project.md`
- `engineering-manager` — assess status, queue health, blockers, and next action
- `product-manager` — shape product goals into requirements, priorities, and agent-ready issue briefs
- `tech-lead` — plan, sequence, decompose, and route technical work

Agents for subagent delegation:

- `scout`
- `planner`
- `ic-dev`
- `ic-review`
- `tech-lead`
- `engineering-manager`
- `product-manager`

Extension:

- `.pi/extensions/flock-subagent` — registers the `subagent` tool, adapted from pi's subagent example

## First run: the happy path

Start every new repository session with the read-only status command:

```text
/flock-status
```

`/flock-status` checks repo/Flock readiness, worktree safety, issue queue health, and PR bottlenecks, then recommends the next workflow. From there, route to the smallest command that matches the work:

| Command | Use when | Mutates files or tracker state? |
| --- | --- | --- |
| `/flock-status` | You need status, blockers, and the next recommended command. | No |
| `/product` | A feature idea or user outcome needs product shaping, acceptance criteria, or prioritization. | No by default |
| `/lead` | Work needs technical decomposition, sequencing, risk assessment, or workflow routing. | No by default |
| `/scout-and-plan` | An unclear area needs deeper repository reconnaissance and an implementation plan. | No |
| `/groom` | The ready queue is low and GitHub issues need classification into `ready-for-agent`, `needs-info`, or related states. | Yes, may update issue labels/comments |
| `/triage` | Issues labelled `needs-triage` need product-manager and tech-lead checks to determine their next state. | Yes, may update issue labels/comments |
| `/work` | The `ready-for-agent` queue is stocked and you want Flock to work issues one at a time, with post-implementation review when a PR/diff exists. | Yes, creates branches/commits/PRs |
| `/issue <number>` | You want one specific GitHub issue implemented and then reviewed when a PR/diff exists. | Yes, creates a branch and may commit/open a PR |
| `/pr-review <number>` | An open pull request needs review. | No by default |
| `/implement` or `/implement-and-review` | You have an explicit implementation task rather than a GitHub issue. | Yes, edits files |

Human merge remains the policy: Flock can prepare or review PRs, but a human decides when to merge. If a dogfood checklist exists in this repository, read it after `/flock-status` to confirm the current validation target before starting mutating work.

## Installation

See [Installation](docs/installation.md).

Quick local install:

```bash
pi install /home/andy/dev/andybarilla/flock
```

Temporary use from another repo:

```bash
pi -e /home/andy/dev/andybarilla/flock
```

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## Design docs

- [Operating model](docs/operating-model.md)
- [Bounded Flock operator workflow](docs/operator-workflow.md)
- [Porting notes](docs/porting-notes.md)
- [v0.1 dogfood checklist](docs/dogfood-checklist.md)
