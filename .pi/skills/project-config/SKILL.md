---
name: project-config
description: Creates, updates, or checks a per-repository Flock config at docs/flock/project.md. Use when setting up Flock for a repo or when labels, gates, branch naming, review policy, or queue defaults are unknown.
---

# Project Config

Create or maintain this repository's Flock project config.

Flock's generic skills can run with conservative defaults, but reliable queue work needs repository-specific policy in one file:

```text
docs/flock/project.md
```

This file records tracker commands, labels, branch naming, validation gates, PR policy, review policy, merge policy, retry policy, and workflow defaults.

## Read first

If `docs/flock/project.md` exists, read it before changing anything.

If another repo-specific agent config exists (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/agents/project.md`, etc.), inspect it and decide whether Flock should defer to it or summarize the Flock-relevant parts.

## Required sections

A complete config has these sections:

- `## Tracker`
- `## Labels`
- `## Branch`
- `## Gate`
- `## PR`
- `## Review`
- `## Merge`
- `## Retry`
- `## Workflow Defaults`
- `## Project Notes`

If a required section is missing or empty, report it. Do not silently guess a policy.

## Investigation before questions

Read what the repo can tell you before asking the user.

Useful commands:

```bash
git rev-parse --show-toplevel
git remote -v
gh repo view --json nameWithOwner,url,defaultBranchRef
gh label list --limit 200
find . -maxdepth 3 \( -iname package.json -o -iname pyproject.toml -o -iname Cargo.toml -o -iname go.mod -o -iname Makefile -o -iname justfile -o -iname mise.toml \)
find .github/workflows -maxdepth 2 -type f 2>/dev/null
```

Look for gates in:

- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `Makefile`
- `justfile`
- `package.json` scripts
- `pyproject.toml`
- `Cargo.toml`
- `go.mod`
- `.github/workflows/*`

Verify that commands you write into `## Gate` exist. A stale test command makes every worker fail or, worse, report a false green.

## Ask, do not guess

Ask the user when the repo cannot answer:

1. Merge policy: human merges or future dispatcher merge?
2. Retry policy: no retry or retry once?
3. Review policy: advanced review available? Any repo-specific blocking bar?
4. Missing label mapping: what label corresponds to a canonical state?
5. Any validation command you cannot verify.

Default Flock v1 policy is conservative:

- human merges
- no retry in issue-loop v1
- confirm before queued issue work
- no auto-merge

But still state those choices explicitly in the config.

## Writing the config

Use `TEMPLATE.md` in this skill directory as the starting point.

Resolve the template path relative to this skill directory:

```text
.pi/skills/project-config/TEMPLATE.md
```

Write to:

```text
docs/flock/project.md
```

Create `docs/flock/` if needed.

Do not overwrite an existing config without summarizing the diff and getting user approval.

## How other Flock skills should use it

When present, Flock skills should prefer `docs/flock/project.md` over built-in defaults for:

- state labels
- ready queue label
- groom target and batch size
- branch naming
- base branch
- validation commands
- review escalation triggers
- PR and issue closing policy
- merge/retry policy

When absent, Flock skills may use conservative defaults, but should mention that `/project-config` can make the workflow repo-specific.

## Check mode

When asked to check an existing config:

1. Confirm every required section exists and is non-empty.
2. Confirm labels named in `## Labels` exist in `gh label list`.
3. Confirm gate commands appear valid for the repo.
4. Confirm branch base exists locally or remotely.
5. Report mismatches and recommended edits.

Use this output:

```md
Config: present | missing | incomplete
Valid: yes | no
Findings:
- <issue or "none">
Recommended changes:
- <change or "none">
```

## Output after writing

```md
Config: docs/flock/project.md
Verified:
- <what you checked>
Asked:
- <questions asked, or "none">
Open questions:
- <or "none">
Next:
- <recommended Flock workflow>
```

## Red flags

| Thought | Reality |
|---|---|
| "This repo probably uses ready-for-agent." | Check labels or ask. |
| "npm test is probably the gate." | Verify scripts and CI. |
| "Merge policy can default to auto." | Never. Auto-merge is an explicit future policy. |
| "The config can mention my local path." | Keep config repository policy, not machine state. |
| "Existing agent docs disagree; I will pick one silently." | State precedence and rationale. |
