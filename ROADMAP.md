# Flock Roadmap

Flock is a pi-only collection of skills, prompt templates, agents, and extensions for managing software development sessions.

## Design principles

- Start with individual-contributor workflows before management workflows.
- Prefer pi-native resources: `.pi/prompts`, `.pi/skills`, `.pi/agents`, and `.pi/extensions`.
- Keep skills useful without extensions where possible.
- Use extensions when the workflow needs state, UI, loops, subprocesses, or external integration.
- Treat GitHub CLI (`gh`) as the first issue-tracker backend.
- Preserve context boundaries: dispatchers coordinate; workers implement; reviewers review.

## Phase 1: IC foundations

Create the core development and review workflows.

- `.pi/prompts/dev.md`
- `.pi/prompts/review.md`
- `.pi/skills/ic-dev/SKILL.md`
- `.pi/skills/ic-review/SKILL.md`

Goals:

- Work from a standard task prompt.
- Restate done criteria before editing.
- Prefer test-first implementation.
- Verify with real command output.
- Produce concise, structured handoffs.
- Review code with actionable findings and a clear verdict.

## Phase 1.5: Subagent delegation

Pi does not ship built-in subagents, so Flock provides an extension based on pi's subagent example.

Planned resources:

- `.pi/extensions/flock-subagent/`
- `.pi/agents/scout.md`
- `.pi/agents/planner.md`
- `.pi/agents/ic-dev.md`
- `.pi/agents/ic-review.md`

Goals:

- Spawn isolated pi subprocesses for delegated work.
- Support single, parallel, and chained tasks.
- Restrict read-only agents to read/search tools.
- Run mutating workers in one owned worktree at a time.

## Package/install story

Flock is a pi package with a `package.json` manifest loading:

- `.pi/extensions`
- `.pi/skills`
- `.pi/prompts`

Install docs live in `docs/installation.md`. The subagent extension loads bundled `.pi/agents` directly because pi packages do not have a native agents resource type.

## Phase 2: GitHub issue worker

Add issue-driven implementation.

Planned resources:

- `.pi/prompts/issue.md`
- `.pi/skills/github-issue-worker/SKILL.md`

Goals:

- Read one GitHub issue with `gh`.
- Confirm it is one implementable unit.
- Create/check out a branch.
- Implement, verify, and prepare/open a PR.
- Hand back a structured report.

## Phase 3: PR review workflow

Add explicit PR/diff review flow.

Resources:

- `.pi/prompts/pr-review.md`
- `.pi/skills/pr-review/SKILL.md`

Goals:

- Review PR diffs rather than unstaged local state.
- Use severity-calibrated findings.
- Return `CLEAN` or `BLOCKING` verdicts.

Status: initial version added.

## Phase 4: Ready issue loop

Add queue draining.

Resources:

- `.pi/prompts/work.md`
- `.pi/skills/issue-loop/SKILL.md`

Future resource:

- extension command `/flock-work`

Goals:

- Find ready-for-agent GitHub issues.
- Dispatch one issue at a time.
- Keep dispatcher context flat.
- Stop on ambiguity, failed verification, tree contention, or repeated failures.

Status: conservative v1 skill/template added. It defaults to one attended issue and never auto-merges.

## Project configuration

Flock uses optional per-repository config at `docs/flock/project.md`.

Resources:

- `.pi/prompts/project-config.md`
- `.pi/skills/project-config/SKILL.md`
- `.pi/skills/project-config/TEMPLATE.md`

The config records tracker commands, labels, branch naming, gates, PR policy, review policy, merge policy, retry policy, and workflow defaults. Core GitHub workflows check it before falling back to conservative defaults.

Status: initial project-config skill/template added.

## Phase 5: Grooming/task management

Port and simplify grooming workflows.

Resources:

- `.pi/prompts/groom.md`
- `.pi/skills/groom/SKILL.md`

Goals:

- Measure queue depth before changing labels.
- Classify only unlabelled/no-state work.
- Require an agent-ready brief before `ready-for-agent`.
- Route epics to decomposition.
- Report counts and next bottleneck.

Status: initial grooming skill/template added.

## Phase 6: Management roles

Add higher-level coordination roles after the IC and queue workflows are stable.

Resources:

- `.pi/prompts/lead.md`
- `.pi/skills/tech-lead/SKILL.md`
- `.pi/agents/tech-lead.md`

Additional resources:

- `.pi/prompts/manager.md`
- `.pi/skills/engineering-manager/SKILL.md`
- `.pi/agents/engineering-manager.md`

Planned resources:

- `.pi/skills/product-manager/SKILL.md`

Goals:

- Manage backlog health.
- Sequence work.
- Identify blockers.
- Coordinate reviews and releases.
- Turn product intent into agent-ready issues.

Status: initial tech-lead and engineering-manager skill/template/agent sets added.
