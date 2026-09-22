# flock

Pi-native skills, prompt templates, agents, and extensions for managing software development sessions.

## Current resources

Prompt templates:

- `/dev` — implement a development task with the Flock IC workflow
- `/review` — review code changes with the Flock review workflow
- `/pr-review` — review a GitHub pull request
- `/issue` — work a specific GitHub issue
- `/work` — work ready-for-agent GitHub issues one at a time
- `/groom` — classify GitHub issues toward a ready-for-agent queue target
- `/project-config` — create or check repo-specific Flock configuration
- `/manager` — assess repo/team status, queue health, blockers, and next action
- `/lead` — plan, sequence, decompose, and route technical work
- `/scout-and-plan` — delegate read-only reconnaissance and planning
- `/implement` — delegate scout → planner → IC implementation
- `/implement-and-review` — delegate implementation → review → fix pass

Skills:

- `ic-dev` — individual contributor implementation workflow
- `ic-review` — code review workflow
- `github-issue-worker` — work one GitHub issue
- `pr-review` — review one GitHub pull request
- `issue-loop` — work ready-for-agent issues one at a time
- `groom` — classify GitHub issues and stock the ready queue
- `project-config` — create or check `docs/flock/project.md`
- `engineering-manager` — assess status, queue health, blockers, and next action
- `tech-lead` — plan, sequence, decompose, and route technical work

Agents for subagent delegation:

- `scout`
- `planner`
- `ic-dev`
- `ic-review`
- `tech-lead`
- `engineering-manager`

Extension:

- `.pi/extensions/flock-subagent` — registers the `subagent` tool, adapted from pi's subagent example

## Testing subagents

For a first subagent test, use the read-only workflow/agents in `/scout-and-plan`:

```text
/scout-and-plan "<small repo question>"
```

This is the safest starting point because it chains only `scout` and `planner`, passes the scout findings into the planner, and explicitly stops before implementation. By contrast, `/implement` and `/implement-and-review` continue into the mutating `ic-dev` workflow, so save those for tasks where edits are expected.

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
