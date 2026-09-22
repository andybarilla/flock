# Flock Project Config

Status: complete. This file records the repository-specific Flock policy for `andybarilla/flock`.

## Tracker

System: GitHub Issues
Repository: `andybarilla/flock`
URL: `https://github.com/andybarilla/flock`
Default branch: `main`

Read issue:

```bash
gh issue view <number> --comments
```

List ready issues:

```bash
gh issue list --state open --label ready-for-agent --json number,title,labels,updatedAt,url --limit 50
```

Read PR:

```bash
gh pr view <number> --json number,title,body,state,author,url,headRefName,baseRefName,mergeable,reviewDecision,statusCheckRollup
```

Read PR diff:

```bash
gh pr diff <number>
```

## Labels

Current repository labels inspected with `gh label list --limit 200`.

Existing useful labels:
- `bug`
- `documentation`
- `enhancement`
- `question`
- `wontfix`
- `blocked`

Flock state labels:

- ready-for-agent: `ready-for-agent`
- needs-triage: `needs-triage`
- needs-info: `needs-info`
- ready-for-human: `ready-for-human`
- blocked: `blocked`
- wontfix: `wontfix`

Size labels:
- epic: `epic`

Other labels of interest:
- bug: `bug`
- enhancement: `enhancement`
- documentation: `documentation`

## Branch

Default base branch: `main`
Issue branch pattern: `flock/issue-<number>-<short-slug>`
PR branch pattern: same as issue branch pattern unless a user chooses otherwise.

Before starting issue work:

```bash
git fetch origin
git checkout main
git pull --ff-only
git checkout -b flock/issue-<number>-<short-slug>
```

## Gate

Repository validation command:

```bash
npm run check
```

This runs:

```bash
npm run typecheck && git diff --check
```

For documentation-only changes, `git diff --check` is usually sufficient, but `npm run check` is the default gate for Flock changes.

Notes:
- `npm run typecheck` validates TypeScript extension files under `.pi/extensions/**/*.ts`.
- `git diff --check` catches whitespace and conflict-marker issues.
- Lightweight behavior tests for prompt, skill, and package-resource loading are part of the default gate via `npm test`.

## PR

Open PRs with:

```bash
git push -u origin HEAD
gh pr create --fill
```

Tracker completion policy:
- Use neutral PR references such as `Refs #<number>`; do not rely on PR auto-close wording to complete issues.
- Issue closure happens after merge: close with `gh issue close <number> --reason completed` and a completion-evidence comment only after the PR is merged (by a human, or by the operator under the Merge policy below) and the merge is verified on `main`.
- Leave the issue open when work is blocked, validation fails, review is blocking, required review cannot run, or the PR is still unmerged.
- Check commit messages for accidental closing keywords before opening the PR.

## Review

Default review tier: standard
Advanced review available: yes

Escalate to advanced review when:
- `.pi/extensions/**` changes, because extension code can execute commands and mutate files
- package installation/loading behavior changes
- workflow logic for `/work`, `/issue`, `/groom`, `/triage`, `/project-config`, or `/flock-status` changes
- GitHub label, branch, merge, or retry policy changes
- generated package metadata changes
- tests/gates are absent or weak for a non-documentation change

Blocking bar:
- incorrect workflow routing or unsafe default behavior
- a skill that can mutate tracker state without explicit user confirmation
- a queue/issue workflow that ignores project config when present
- package manifest changes that prevent prompts, skills, or extensions from loading
- extension changes that break bundled agent discovery or subagent execution

## Merge

Policy: conditional operator merge

Notes:
- The operator may squash-merge a pull request only when all of the following are observed from `gh` output: every `statusCheckRollup` entry successful (none pending or failing), `mergeable: MERGEABLE` (no conflicts), Flock review verdict non-blocking, and `reviewDecision: APPROVED` when required by branch protection (not required otherwise).
- Merge scope: only PRs opened by the operator in the current run. All other PRs remain human-merged.
- Merge method: squash. Flock never deletes branches; the GitHub auto-delete-on-merge setting handles branch cleanup.
- The operator polls for green up to `Max PR wait` and stops cleanly with reason "PR not green" on timeout, leaving a resumable handoff. It never waits indefinitely.
- Merge without this policy section, or of any PR failing a green criterion, is refused.
- Check-wait command (verified 2026-09-22 against real PR output from flock#33 and dollandrobot/bandependent#433, plus fixture classification of every state; the classifier is fail-closed — any unrecognized typename, conclusion, or state classifies as `failing`, never `green`):

```bash
gh pr view <number> --json state,mergeable,reviewDecision,statusCheckRollup --jq '
  def checks:
    [.statusCheckRollup[] |
      if .__typename == "CheckRun" then
        {pending: (.status != "COMPLETED"),
         failing: (.status == "COMPLETED" and ((.conclusion | IN("SUCCESS","SKIPPED","NEUTRAL")) | not))}
      elif .__typename == "StatusContext" then
        {pending: (.state == "PENDING" or .state == "EXPECTED"),
         failing: ((.state | IN("SUCCESS","PENDING","EXPECTED")) | not)}
      else
        {pending: false, failing: true}
      end];
  . as $pr | checks as $c |
  if $pr.state != "OPEN" then "unexpected-state:" + $pr.state
  elif ($c | map(select(.failing)) | length) > 0 then "failing"
  elif $pr.reviewDecision == "CHANGES_REQUESTED" then "blocking-review"
  elif $pr.mergeable == "CONFLICTING" then "conflict"
  elif ($c | map(select(.pending)) | length) > 0
       or $pr.mergeable == "UNKNOWN"
       or $pr.reviewDecision == "REVIEW_REQUIRED" then "pending"
  else "green" end'
```

- `SKIPPED` and `NEUTRAL` check conclusions count as satisfied, matching GitHub branch protection semantics. An empty `statusCheckRollup` (no CI configured) is vacuously green on checks; `mergeable`, review verdict, and `reviewDecision` still apply.
- Issue closure moves to post-merge (see Tracker completion policy above).

## Retry

Policy: no retry

Notes:
- Flock v1 issue-loop stops on blocked/failed work.
- Retry policy can be revisited after claim/label behavior and gates are stable.

## Operator Approval Policy

Mutating operator automation is allowed only when this config is present and the selected action is explicitly allowed below. If this section is missing in another repository, operator workflows must use dry-run only and ask before mutation.

Approval categories:
- Issue selection for queued work: auto-approve for issues labeled `ready-for-agent` after the issue-loop dispatchability summary succeeds.
- Grooming labels/comments: auto-approve within the grooming batch limit when the groomer has no blocking product or technical questions.
- Triage labels/comments: auto-approve within the triage issue limit when product-manager and tech-lead checks identify a clear next state.
- Branch creation: auto-approve for issue branches matching `flock/issue-<number>-<short-slug>` from `main`.
- Commits: auto-approve scoped commits on the issue branch after validation has been run.
- PR creation/update: auto-approve PR creation or updates using neutral `Refs #<number>` references.
- Tracker completion/issue close: auto-approve only through the issue worker completion policy after verified merge of the issue's PR on `main`.
- Merge: auto-approve squash merge of PRs opened by the operator in the current run when green per the Merge policy above; all other PRs remain human-merged.

Limits:
- Max cycles per operator run: 5
- Max issues worked per operator run: 3
- Max grooming batches per operator run: 1
- Max triage issues per operator run: 5
- Max PR wait per issue: 15m
- Max runtime: ask when launching the operator

Stop conditions:
- missing or insufficient project config
- dirty or unexpected worktree state
- auth, branch, validation, PR, review, or tracker failure
- blocking product or technical question
- ambiguous, too broad, already complete, or non-dispatchable issue
- failed validation or blocking review
- configured limits reached

## Workflow Defaults

Ready queue label: `ready-for-agent`
Groom target depth: 6
Groom batch size: 10
Issue loop default limit: 1
Confirm before starting queued issue: yes
Auto-merge: conditional (squash merge of operator-run PRs only, when green per the Merge policy)

## Project Notes

- Flock is distributed as a pi package via `package.json`.
- Pi package resources are declared under the `pi` key: `.pi/extensions`, `.pi/skills`, and `.pi/prompts`.
- Bundled subagent definitions live under `.pi/agents` and are loaded by the `flock-subagent` extension because pi packages do not have a native agents resource type.
- `/flock-status` is the default starting point for a repository health check.
- `/scout-and-plan` is the safe read-only investigation workflow.
- `/implement` and `/implement-and-review` can mutate files through the `ic-dev` subagent.

## Open Questions

None.
