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

## Starting with Flock

Start with the read-only status command:

```text
/flock-status
```

It checks repo/Flock readiness and recommends the next command. Use `/scout-and-plan "<small repo question>"` later when status identifies an unclear area that needs deeper read-only reconnaissance and planning. `/implement` and `/implement-and-review` continue into the mutating `ic-dev` workflow, so save those for tasks where edits are expected.

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
- [Porting notes](docs/porting-notes.md)
