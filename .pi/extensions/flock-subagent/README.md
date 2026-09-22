# flock-subagent

Planned pi extension for Flock delegation.

Pi does not include built-in subagents. This extension will adapt pi's example subagent extension, which spawns separate `pi --mode json -p --no-session` subprocesses with isolated prompts, tools, cwd, model, and context.

Reference implementation:

`/home/andy/.local/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/subagent/`

## Intended capabilities

- Delegate to one named agent.
- Run read-only scouts in parallel.
- Run chained workflows such as scout → planner → worker.
- Run mutating workers in an owned git worktree.
- Stream progress and return a bounded final result to the dispatcher.

## Intended agents

- `scout` — read-only codebase reconnaissance
- `planner` — read-only implementation planning
- `ic-dev` — mutating implementation worker
- `ic-review` — read-only code reviewer
- `tech-lead` — read-only planning and workflow routing

## Agent discovery

The extension loads bundled Flock agents from the package's `.pi/agents` directory, then user agents from `~/.pi/agent/agents`, then project agents from `.pi/agents` when `agentScope` includes project agents. Later sources override earlier sources by agent name.

## Safety policy

- Project-local agents are trusted only when the project is trusted.
- Read-only agents get read/search tools.
- Mutating agents get edit/write/bash only in an explicitly assigned worktree.
- Queue loops should use this extension to keep dispatcher context flat.
