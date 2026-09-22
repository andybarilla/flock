# v0.1 Dogfood Checklist

Use this checklist to validate that Flock is dogfood-ready from a clean external repository. The manual steps exercise pi package loading and Flock workflows; the automated step verifies this repository's TypeScript, tests, and whitespace checks.

## Prerequisites

- A clean clone or checkout of this repository, referred to below as `<flock-repo>`.
- A separate clean target repository where it is safe to run read-only Flock commands, referred to below as `<target-repo>`.
- `pi`, `git`, `gh`, and `npm` available on `PATH`.
- GitHub CLI authenticated if you intend to exercise GitHub-backed flows such as `/flock-status`, `/groom`, `/triage`, `/work`, or `/issue`.

## Manual validation

Run these steps from `<target-repo>` unless a step says otherwise.

### 1. Start pi with Flock loaded

Choose one loading method.

Temporary use for one session:

```bash
cd <target-repo>
pi -e <flock-repo>
```

Or install Flock globally from the local checkout, then start pi:

```bash
pi install <flock-repo>
cd <target-repo>
pi
```

Expected result: pi starts successfully in the target repository with Flock resources available.

### 2. Confirm package resources load

In the pi session, confirm the following prompt templates are available by invoking their slash commands or using pi's prompt/help UI:

- `/flock-status`
- `/product`
- `/lead`
- `/groom`
- `/triage`
- `/work`
- `/issue`
- `/pr-review`

Confirm that package skills and agents are reachable by running at least one command that uses each resource type:

```text
/flock-status
```

```text
/scout-and-plan summarize this repository's build and test setup
```

Expected result: `/flock-status` runs as a read-only status workflow, and `/scout-and-plan` can delegate through the bundled `flock-subagent` extension to Flock agents.

### 3. Run the default status flow

```text
/flock-status
```

Expected result: the response reports repository status, worktree safety, GitHub/queue readiness when available, blockers if any, and a recommended next workflow. It must not edit files or tracker state.

### 4. Validate at least one product, lead, or status flow

Run at least one of these read-only planning flows in `<target-repo>`:

Product flow:

```text
/product Shape a small improvement for this repository's README into acceptance criteria. Do not edit files.
```

Lead flow:

```text
/lead Identify the safest next technical task in this repository. Do not edit files.
```

Status flow, if not already counted above:

```text
/flock-status
```

Expected result: the selected flow produces a bounded plan, recommendation, or issue-ready brief without making unrequested mutations.

### 5. Optional mutating smoke test

Only run this in a disposable target repository or on a throwaway branch:

```text
/implement add a short README note explaining how to run this repository's tests
```

Expected result: Flock uses the IC workflow, restates done criteria, edits only the requested documentation, and reports verification. Revert or discard the change after the smoke test if it is not wanted.

## Automated validation

Run this step from `<flock-repo>`:

```bash
cd <flock-repo>
npm run check
```

Expected result: the command completes successfully. It runs TypeScript validation, Node tests, and `git diff --check` for whitespace/conflict-marker issues.

## Pass criteria

Flock v0.1 is dogfood-ready when:

- Flock can be loaded in a clean external repository via `pi -e <flock-repo>` or `pi install <flock-repo>`.
- Prompt templates, skills, the `flock-subagent` extension, and bundled agents are discoverable through the manual checks above.
- `/flock-status` completes without mutating files or tracker state.
- At least one product, lead, or status flow completes and gives an actionable result.
- `npm run check` passes in this repository.

Manual validation should be recorded separately from automated test output because the pi-session workflow checks depend on the operator's target repository and installed pi environment.
