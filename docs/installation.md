# Installation

Flock is a pi package. It can be loaded from this checkout, installed globally from a local path, or installed from git once the repository is published.

## Local development in this repo

From this repository, project-local resources load after the project is trusted:

```bash
pi
```

Use `/reload` after editing prompts, skills, agents, or extensions.

## Use Flock from another repo without installing

From any target repository:

```bash
pi -e /home/andy/dev/andybarilla/flock
```

This loads Flock temporarily for that pi session.

## Install globally from local checkout

```bash
pi install /home/andy/dev/andybarilla/flock
```

Then start pi from any repository. Flock prompts, skills, and the `flock-subagent` extension should be available.

To remove:

```bash
pi remove /home/andy/dev/andybarilla/flock
```

## Install into one project

From the target project:

```bash
pi install -l /home/andy/dev/andybarilla/flock
```

This writes the package to the target project's `.pi/settings.json` so the project can share the dependency.

## Git install

Once published, use a pinned ref:

```bash
pi install git:github.com/andybarilla/flock@<tag-or-commit>
```

For project-local installation:

```bash
pi install -l git:github.com/andybarilla/flock@<tag-or-commit>
```

## What the package loads

Declared in `package.json`:

- `.pi/extensions` — Flock extension(s), including `flock-subagent`
- `.pi/skills` — Flock skills
- `.pi/prompts` — Flock prompt templates

## Agents and subagents

Pi packages do not have a built-in `agents` resource type. Flock's `flock-subagent` extension therefore loads bundled agents directly from this package's `.pi/agents` directory.

Agent precedence:

1. package agents from Flock
2. user agents from `~/.pi/agent/agents`
3. project agents from `.pi/agents` when `agentScope` includes project agents

Later entries override earlier entries with the same name.

## First run and smoke tests

After installing, run from any repository:

```text
/flock-status
```

Follow the recommended next command from the status report. If you want a secondary read-only validation for subagent delegation, run:

```text
/scout-and-plan summarize this repository's build and test setup
```

For mutating delegation, start with a README-only change only when edits are expected:

```text
/implement add a short note to README.md explaining how to run the project's tests
```
