# Porting Notes

Reference repo:

`/home/andy/dev/andybarilla/skills-and-agents`

Flock is pi-only. Port concepts, not harness-specific mechanisms.

## Useful source material

- `skills/work/SKILL.md` — queue draining, dispatcher boundaries, issue brief shape
- `skills/groom/SKILL.md` — queue measurement, ready-for-agent bar, stale-ready handling
- `archive/agents-user/ic-generalist.md` — IC discipline and handoff expectations
- `archive/agents/code-reviewer.md` — review checklist and verdict structure
- `archive/commands/groom.md` — older grooming command shape

## Replace or remove

- Claude/OpenCode-specific subagent instructions
- `herdr` commands
- pane/session naming assumptions
- `superpowers:*` invocations as mandatory dependencies
- Claude tool names in frontmatter

## Preserve

- context isolation between dispatcher and worker
- test-first bias
- verification-before-completion discipline
- comment/doc drift checks
- out-of-scope issue filing instead of scope creep
- actionable review findings with severity and verdict
- queue-depth measurement before grooming
