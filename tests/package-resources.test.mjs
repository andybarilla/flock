import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
	DefaultResourceLoader,
	SettingsManager,
	loadSkillsFromDir,
	parseFrontmatter,
} from "@earendil-works/pi-coding-agent";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const piIndexUrl = import.meta.resolve("@earendil-works/pi-coding-agent");
const { expandPromptTemplate, loadPromptTemplates } = await import(new URL("./core/prompt-templates.js", piIndexUrl));

const expectedPromptNames = [
	"dev",
	"flock-status",
	"groom",
	"implement",
	"implement-and-review",
	"issue",
	"lead",
	"manager",
	"operate",
	"product",
	"project-config",
	"pr-review",
	"review",
	"scout-and-plan",
	"triage",
	"work",
];

const expectedPromptSkillRoutes = new Map([
	["dev", "ic-dev"],
	["review", "ic-review"],
	["issue", "github-issue-worker"],
	["pr-review", "pr-review"],
	["work", "issue-loop"],
	["groom", "groom"],
	["flock-status", "flock-status"],
	["manager", "engineering-manager"],
	["operate", "operator-run"],
	["lead", "tech-lead"],
	["product", "product-manager"],
	["project-config", "project-config"],
	["triage", "triage"],
]);

const expectedSkillNames = [
	"engineering-manager",
	"flock-status",
	"github-issue-worker",
	"groom",
	"ic-dev",
	"ic-review",
	"issue-loop",
	"operator-plan",
	"operator-run",
	"pr-review",
	"product-manager",
	"project-config",
	"tech-lead",
	"triage",
];

const expectedAgentNames = [
	"engineering-manager",
	"ic-dev",
	"ic-review",
	"planner",
	"product-manager",
	"scout",
	"tech-lead",
];

function byName(items) {
	return new Map(items.map((item) => [item.name, item]));
}

function assertSameMembers(actual, expected, message) {
	assert.deepEqual([...actual].sort(), [...expected].sort(), message);
}

test("package manifest declares Flock resource directories", async () => {
	const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));

	assert.deepEqual(packageJson.pi, {
		extensions: [".pi/extensions"],
		skills: [".pi/skills"],
		prompts: [".pi/prompts"],
	});
});

test("Flock package resources load through Pi resource loader", async () => {
	const loader = new DefaultResourceLoader({
		cwd: repoRoot,
		agentDir: join(repoRoot, ".tmp-test-agent"),
		settingsManager: SettingsManager.inMemory({ packages: [repoRoot] }, { projectTrusted: true }),
	});

	await loader.reload();

	const prompts = loader.getPrompts();
	assert.deepEqual(prompts.diagnostics, []);
	assertSameMembers(
		prompts.prompts.map((prompt) => prompt.name),
		expectedPromptNames,
		"Pi resource loader should discover every expected Flock prompt",
	);

	const skills = loader.getSkills();
	assert.deepEqual(skills.diagnostics, []);
	assertSameMembers(
		skills.skills.map((skill) => skill.name),
		expectedSkillNames,
		"Pi resource loader should discover every expected Flock skill",
	);

	const extensions = loader.getExtensions();
	assert.deepEqual(extensions.errors, []);
	assert.ok(
		extensions.extensions.some((extension) => extension.path.includes("flock-subagent")),
		"expected flock-subagent extension to be discoverable",
	);
});

test("prompt templates preserve Flock routing contracts", () => {
	const { templates, diagnostics } = loadPromptTemplates({
		cwd: repoRoot,
		agentDir: join(repoRoot, ".tmp-test-agent"),
		promptPaths: [join(repoRoot, ".pi", "prompts")],
		includeDefaults: false,
	});

	assert.deepEqual(diagnostics, []);
	assertSameMembers(
		templates.map((template) => template.name),
		expectedPromptNames,
		"prompt template directory should contain every expected Flock prompt",
	);

	const prompts = byName(templates);
	for (const [name, skillName] of expectedPromptSkillRoutes) {
		assert.ok(
			prompts.get(name).content.includes(`Use the \`${skillName}\` skill`),
			`${name} should route to ${skillName}`,
		);
	}

	for (const name of ["implement", "implement-and-review", "scout-and-plan"]) {
		const content = prompts.get(name).content;
		assert.match(content, /Use the `subagent` tool/);
		assert.match(content, /agentScope: "both"/);
	}

	const expanded = expandPromptTemplate("/review please check this change", templates);
	assert.match(expanded, /Use the `ic-review` skill/);
	assert.match(expanded, /please check this change/);
});

test("work queue instructions require accepted issues to dispatch immediately", async () => {
	const workPrompt = await readFile(join(repoRoot, ".pi", "prompts", "work.md"), "utf8");
	const issueLoopSkill = await readFile(join(repoRoot, ".pi", "skills", "issue-loop", "SKILL.md"), "utf8");

	assert.match(workPrompt, /show the issue and branch strategy/);
	assert.match(workPrompt, /after acceptance, immediately work one issue in the same run/);
	assert.match(issueLoopSkill, /Branch strategy:/);
	assert.match(issueLoopSkill, /Next action if accepted: immediately dispatch/);
	assert.match(issueLoopSkill, /If the user declines, stop without creating a branch, commit, issue update, PR, or other mutating change\./);
	assert.match(issueLoopSkill, /Do not ask the user to run a second command before dispatching\./);
});

test("issue workflow instructions require automatic separate review when a target exists", async () => {
	const issuePrompt = await readFile(join(repoRoot, ".pi", "prompts", "issue.md"), "utf8");
	const workPrompt = await readFile(join(repoRoot, ".pi", "prompts", "work.md"), "utf8");
	const issueWorkerSkill = await readFile(join(repoRoot, ".pi", "skills", "github-issue-worker", "SKILL.md"), "utf8");
	const issueLoopSkill = await readFile(join(repoRoot, ".pi", "skills", "issue-loop", "SKILL.md"), "utf8");

	assert.match(issuePrompt, /automatically run separate review when there is a PR or reviewable diff/);
	assert.match(workPrompt, /run separate review when there is a PR or reviewable diff/);
	assert.match(issueWorkerSkill, /## 9\. Automatic review handoff/);
	assert.match(issueWorkerSkill, /If a PR was opened or updated, review that PR with the `pr-review` workflow/);
	assert.match(issueWorkerSkill, /if there is a reviewable local diff against the base branch, review that diff with the `ic-review` workflow/);
	assert.match(issueWorkerSkill, /If there is no PR and no reviewable diff, stop and explain clearly/);
	assert.match(issueWorkerSkill, /The worker never merges; merge is handled post-handoff per project config/);
	assert.match(issueWorkerSkill, /Closure deferral to post-merge/);
	assert.match(issueWorkerSkill, /deferred — closure after merge per project config/);
	assert.match(issueWorkerSkill, /Review: <review target and verdict, or clear reason review did not run>/);
	assert.match(issueLoopSkill, /Review:/);
});

test("supervised issue workflows require accurate final stage summaries", async () => {
	const issuePrompt = await readFile(join(repoRoot, ".pi", "prompts", "issue.md"), "utf8");
	const workPrompt = await readFile(join(repoRoot, ".pi", "prompts", "work.md"), "utf8");
	const issueWorkerSkill = await readFile(join(repoRoot, ".pi", "skills", "github-issue-worker", "SKILL.md"), "utf8");
	const issueLoopSkill = await readFile(join(repoRoot, ".pi", "skills", "issue-loop", "SKILL.md"), "utf8");

	for (const content of [issuePrompt, workPrompt, issueWorkerSkill, issueLoopSkill]) {
		assert.match(content, /stage-by-stage summary/);
		assert.match(content, /succeeded, skipped, or failed/);
		assert.match(content, /stop reason/);
		assert.match(content, /issue number/);
		assert.match(content, /branch name/);
		assert.match(content, /PR link/);
		assert.match(content, /validation result/);
		assert.match(content, /review verdict/);
		assert.match(content, /tracker completion/);
		assert.match(content, /next recommended human action/);
		assert.match(content, /Do not claim validation, review, or tracker completion occurred unless command output was observed/);
	}

	assert.match(issueWorkerSkill, /Issue selection: <succeeded\|skipped\|failed/);
	assert.match(issueWorkerSkill, /Branch setup: <succeeded\|skipped\|failed/);
	assert.match(issueWorkerSkill, /Implementation: <succeeded\|skipped\|failed/);
	assert.match(issueWorkerSkill, /Validation: <succeeded\|skipped\|failed/);
	assert.match(issueWorkerSkill, /PR creation\/update: <succeeded\|skipped\|failed/);
	assert.match(issueWorkerSkill, /Review: <succeeded\|skipped\|failed/);
	assert.match(issueWorkerSkill, /Tracker completion: <succeeded\|skipped\|failed/);
	assert.match(issueWorkerSkill, /BLOCKED: <reason>/);
	assert.match(issueWorkerSkill, /Next recommended human action: <question, decomposition, or human action>/);
	assert.match(issueWorkerSkill, /skipped — not run/);
	assert.match(issueLoopSkill, /copy or condense the issue worker's stage statuses/);
});

test("issue workflow explicitly completes tracker items without PR auto-close wording", async () => {
	const issuePrompt = await readFile(join(repoRoot, ".pi", "prompts", "issue.md"), "utf8");
	const workPrompt = await readFile(join(repoRoot, ".pi", "prompts", "work.md"), "utf8");
	const issueWorkerSkill = await readFile(join(repoRoot, ".pi", "skills", "github-issue-worker", "SKILL.md"), "utf8");
	const projectConfigTemplate = await readFile(join(repoRoot, ".pi", "skills", "project-config", "TEMPLATE.md"), "utf8");
	const projectConfig = await readFile(join(repoRoot, "docs", "flock", "project.md"), "utf8");

	assert.match(issuePrompt, /explicitly mark the tracker item complete/);
	assert.match(workPrompt, /explicit tracker completion rather than PR auto-close wording/);
	assert.match(issueWorkerSkill, /## 10\. Complete tracker item/);
	assert.match(issueWorkerSkill, /gh issue close <number> --reason completed/);
	assert.match(issueWorkerSkill, /Do not close the issue when implementation is incomplete, validation failed, review is blocking/);
	assert.match(issueWorkerSkill, /Use neutral references such as `Refs #<number>`/);
	assert.doesNotMatch(issueWorkerSkill, /Use `Closes #<number>`/);
	assert.match(projectConfigTemplate, /Tracker completion policy/);
	assert.match(projectConfig, /Tracker completion policy/);
});

test("operator run workflow is exposed and bounded", async () => {
	const operatePrompt = await readFile(join(repoRoot, ".pi", "prompts", "operate.md"), "utf8");
	const operatorRunSkill = await readFile(join(repoRoot, ".pi", "skills", "operator-run", "SKILL.md"), "utf8");

	assert.match(operatePrompt, /Use the `operator-run` skill/);
	assert.match(operatePrompt, /read `docs\/flock\/project\.md` when present/);
	assert.match(operatePrompt, /recommend exactly one next action/);
	assert.match(operatePrompt, /execute one delegated action per cycle/);
	assert.match(operatePrompt, /loop mode repeats safe cycles only until explicit limits or a stop condition/);
	assert.match(operatePrompt, /merge only under an explicit conditional Merge approval policy/);
	assert.match(operatePrompt, /Do not claim validation, review, tracker changes, or tracker completion occurred unless command output was observed/);

	assert.match(operatorRunSkill, /Run a bounded Flock operator decision cycle or bounded multi-step loop/);
	assert.match(operatorRunSkill, /Before taking any mutating action, read `docs\/flock\/project\.md` completely/);
	assert.match(operatorRunSkill, /Operator Approval Policy/);
	assert.match(operatorRunSkill, /ready issue work requires `Issue selection for queued work`/);
	assert.match(operatorRunSkill, /`ask` or equivalent confirmation language permits dispatch only after/);
	assert.match(operatorRunSkill, /`never`, `blocked`, missing, unclear/);
	assert.match(operatorRunSkill, /triage requires `Triage labels\/comments`/);
	assert.match(operatorRunSkill, /grooming requires `Grooming labels\/comments`/);
	assert.match(operatorRunSkill, /Dispatch exactly one underlying workflow per cycle/);
	assert.match(operatorRunSkill, /Use the `issue-loop` skill/);
	assert.match(operatorRunSkill, /merge requires the `Merge` policy category/);
	assert.match(operatorRunSkill, /never merge any other PR/);
	assert.match(operatorRunSkill, /statusCheckRollup/);
	assert.match(operatorRunSkill, /MERGEABLE/);
	assert.match(operatorRunSkill, /PR not green/);
	assert.match(operatorRunSkill, /merge failed/);
	assert.match(operatorRunSkill, /merge verification failed/);
	assert.match(operatorRunSkill, /gh pr merge <number> --squash/);
	assert.match(operatorRunSkill, /verified check-wait command/);
	assert.match(operatorRunSkill, /CHANGES_REQUESTED/);
	assert.match(operatorRunSkill, /fail-closed/);
	assert.match(operatorRunSkill, /An inconclusive result never merges/);
	assert.match(operatorRunSkill, /resume target/);
	assert.match(operatorRunSkill, /its author is the authenticated account/);
	assert.match(operatorRunSkill, /its linked issue is open/);
	assert.match(operatorRunSkill, /flock-operator-run` provenance marker comment authored by the authenticated account/);
	assert.match(operatorRunSkill, /a marker comment from any other author is meaningless/);
	assert.match(operatorRunSkill, /never merge it/);
	assert.match(operatorRunSkill, /fresh non-blocking `pr-review` verdict/);
	assert.match(operatorRunSkill, /expected safe state/);
	assert.match(operatorRunSkill, /ends the run instead of continuing/);
	assert.match(operatorRunSkill, /action=<work\|resume\|triage\|groom\|review\|stop>/);
	assert.match(operatorRunSkill, /origin\/\u003cdefault-branch>/);
	assert.match(operatorRunSkill, /the operator performs `gh issue close[^`]*` only after the merge is verified/);
	assert.match(operatorRunSkill, /Do not claim validation, review, tracker changes, or tracker completion unless command output/);
});

test("operator run workflow supports bounded loop mode with audited stop conditions", async () => {
	const operatePrompt = await readFile(join(repoRoot, ".pi", "prompts", "operate.md"), "utf8");
	const operatorRunSkill = await readFile(join(repoRoot, ".pi", "skills", "operator-run", "SKILL.md"), "utf8");
	const operatorWorkflow = await readFile(join(repoRoot, "docs", "operator-workflow.md"), "utf8");

	for (const content of [operatePrompt, operatorRunSkill]) {
		assert.match(content, /--loop/);
		assert.match(content, /--max-cycles <n>/);
		assert.match(content, /--max-runtime <duration>/);
		assert.match(content, /max issues/);
		assert.match(content, /max grooming/);
	}

	assert.match(operatorRunSkill, /Loop continuation gate/);
	assert.match(operatorRunSkill, /git status --short/);
	assert.match(operatorRunSkill, /git branch --show-current/);
	assert.match(operatorRunSkill, /Do not continue after a failed or blocked issue/);
	assert.match(operatorRunSkill, /queue is empty/);
	assert.match(operatorRunSkill, /review cannot run/);
	assert.match(operatorRunSkill, /configured limits are reached/);
	assert.match(operatorRunSkill, /Final run log/);
	assert.match(operatorRunSkill, /Cycle log:/);
	assert.match(operatorRunSkill, /Tracker changes:/);
	assert.match(operatorWorkflow, /Loop mode is available for trusted repositories/);
});

test("operator herdr worker dispatch is gated, fail-stop, and independently verified", async () => {
	const operatorRunSkill = await readFile(join(repoRoot, ".pi", "skills", "operator-run", "SKILL.md"), "utf8");
	const issueWorkerSkill = await readFile(join(repoRoot, ".pi", "skills", "github-issue-worker", "SKILL.md"), "utf8");
	const projectConfig = await readFile(join(repoRoot, "docs", "flock", "project.md"), "utf8");

	// Activation gate: HERDR_ENV=1 plus a config-defined worktree pattern; otherwise unchanged.
	assert.match(operatorRunSkill, /## 5a\. Herdr worker dispatch/);
	assert.match(operatorRunSkill, /HERDR_ENV/);
	assert.match(operatorRunSkill, /behavior outside Herdr is unchanged/);
	assert.match(operatorRunSkill, /never relaxes any gate/);

	// Dispatch sequence: worktree pane, named pi agent, bounded prompt wait.
	assert.match(operatorRunSkill, /herdr worktree create/);
	assert.match(operatorRunSkill, /--no-focus/);
	assert.match(operatorRunSkill, /herdr agent start issue-<n> --kind pi --pane <pane-id>/);
	assert.match(operatorRunSkill, /herdr agent prompt issue-<n>/);
	assert.match(operatorRunSkill, /--wait --timeout <per-issue-ms>/);

	// Distinct fail-stop reasons; no dialog answering or re-prompting.
	assert.match(operatorRunSkill, /worker blocked/);
	assert.match(operatorRunSkill, /worker timeout/);
	assert.match(operatorRunSkill, /worker not ready/);
	assert.match(operatorRunSkill, /worker stalled/);
	assert.match(operatorRunSkill, /agent_not_ready/);
	assert.match(operatorRunSkill, /agent_prompt_stalled/);
	assert.match(operatorRunSkill, /Never answer the nested approval dialog/);
	assert.match(operatorRunSkill, /never re-prompt/);
	assert.match(operatorRunSkill, /worktree create failed/);
	assert.match(operatorRunSkill, /worker handoff missing/);
	assert.match(operatorRunSkill, /worker claim mismatch/);

	// Handoff file convention and independent supervisor verification.
	assert.match(operatorRunSkill, /\.flock\/handoff-issue-<n>\.md/);
	assert.match(operatorRunSkill, /never records worker claims from the handoff alone/);
	assert.match(operatorRunSkill, /git ls-remote --heads origin <branch>/);
	assert.match(operatorRunSkill, /gh pr list --state open --head <branch>/);
	assert.match(operatorRunSkill, /reviewDecision/);

	// Review fixes: mutation gate carve-out, supervisor-observed review, early
	// provenance marker, and defined agent-start failure handling.
	assert.match(
		operatorRunSkill,
		/must dispatch through the `issue-loop` workflow with `--yes --limit 1`, or through the section 5a Herdr worker dispatch when it is active/,
	);
	assert.match(operatorRunSkill, /the supervisor dispatches a fresh `pr-review` for the PR from its own session/);
	assert.match(operatorRunSkill, /before the validation and review legs/);
	assert.match(operatorRunSkill, /Any `herdr agent start` failure/);

	// Re-review fixes: resume re-establishes validation, Herdr selection bound,
	// and the provenance marker is posted exactly once.
	assert.match(operatorRunSkill, /re-run the configured gate command against the PR head/);
	assert.match(operatorRunSkill, /validation evidence: the configured gate command passed against the PR head in this run/);
	assert.match(operatorRunSkill, /exactly one issue per cycle/);
	assert.match(operatorRunSkill, /post it once/);

	// Round-3 review fixes: summary resume criteria include the validation leg,
	// the gate re-run certifies the pushed PR head (sha equality), and the
	// marker dedupe guard checks marker authorship.
	assert.match(operatorRunSkill, /the configured gate command re-run against the PR head passed in the resuming run/);
	assert.match(projectConfig, /the configured gate command re-run against the PR head passed in the resuming run/);
	assert.match(operatorRunSkill, /rev-parse HEAD/);
	assert.match(operatorRunSkill, /headRefOid/);
	assert.match(operatorRunSkill, /marker comment authored by the authenticated account is already present/);

	// Run log records agent, pane/workspace IDs, worktree path, and verification.
	assert.match(operatorRunSkill, /Herdr dispatch: <enabled\|disabled/);
	assert.match(operatorRunSkill, /agent=<issue-<n>\|none>/);
	assert.match(operatorRunSkill, /pane=<pane-id\|none>/);
	assert.match(operatorRunSkill, /worktree=<path\|none>/);
	assert.match(operatorRunSkill, /verification=<branch\/PR\/validation\/review re-verified/);

	// Nested worker mode in the issue worker skill.
	assert.match(issueWorkerSkill, /## Herdr worktree dispatch \(nested worker mode\)/);
	assert.match(issueWorkerSkill, /[Tt]he issue branch already exists and is checked out/);
	assert.match(issueWorkerSkill, /skip step 5 branch creation/);
	assert.match(issueWorkerSkill, /Never commit the handoff file/);

	// Project config documents the optional Herdr worktree pattern.
	assert.match(projectConfig, /## Herdr/);
	assert.match(projectConfig, /Herdr worker dispatch: enabled/);
	assert.match(projectConfig, /Worktree pattern:/);
	assert.match(projectConfig, /Per-issue worker timeout: 45m/);
	assert.match(projectConfig, /absent = herdr dispatch disabled|absent, herdr dispatch is disabled/);
});

test("operator herdr post-merge cleanup removes run-created worktrees and itemizes leftovers", async () => {
	const operatorRunSkill = await readFile(join(repoRoot, ".pi", "skills", "operator-run", "SKILL.md"), "utf8");
	const projectConfig = await readFile(join(repoRoot, "docs", "flock", "project.md"), "utf8");

	// Post-merge removal of the run-created worktree after verified merge + issue close.
	assert.match(operatorRunSkill, /herdr worktree remove --workspace <workspace-id>/);
	assert.match(operatorRunSkill, /scoped strictly to resources created in the current run/);
	assert.match(operatorRunSkill, /Never remove a pre-existing or previous-run worktree/);
	assert.match(operatorRunSkill, /A removal failure is non-fatal/);

	// Removal is handoff-aware: the never-committed handoff file is deleted and
	// the worktree confirmed otherwise clean before removal; never --force past
	// unexpected state. Deletion must be documented before the removal command.
	assert.match(operatorRunSkill, /rm <worktree-root>\/\.flock\/handoff-issue-<n>\.md/);
	assert.match(operatorRunSkill, /git -C <worktree-root> status --short/);
	assert.match(operatorRunSkill, /do not remove and do not use `--force`/);
	assert.ok(
		operatorRunSkill.indexOf("rm <worktree-root>/.flock/handoff-issue-<n>.md") <
			operatorRunSkill.indexOf("herdr worktree remove --workspace <workspace-id>"),
		"handoff deletion must precede the removal command",
	);

	// Failed/blocked/timeout workers stay in place and are itemized in the final run log.
	assert.match(operatorRunSkill, /never remove a failed, blocked, timed-out, or stalled worker's pane or worktree/);
	assert.match(operatorRunSkill, /left in place for human inspection/);
	assert.match(operatorRunSkill, /agent name, workspace ID, worktree path, stop reason/);
	assert.match(operatorRunSkill, /Follow-up items:/);

	// Merge-stopped cycles are itemized too, and previous-run stale worktrees are
	// discovered (report-only) rather than silently absent from the log.
	assert.match(operatorRunSkill, /merge-stopped cycles whose worktrees and panes were intentionally preserved/);
	assert.match(operatorRunSkill, /previous runs are report-only follow-up items/);
	assert.match(operatorRunSkill, /herdr worktree list/);

	// Stale cleanup wording is gone from both documents.
	assert.doesNotMatch(operatorRunSkill, /worktree cleanup is out of scope for the operator/);
	assert.doesNotMatch(operatorRunSkill, /worktree cleanup is a separate post-merge concern/);
	assert.doesNotMatch(projectConfig, /Worktree cleanup after merge is handled separately/);

	// Project config documents handoff-aware post-merge cleanup and report-only stale worktrees.
	assert.match(projectConfig, /Post-merge cleanup: after a verified merge and issue close/);
	assert.match(projectConfig, /herdr worktree remove --workspace/);
	assert.match(projectConfig, /never `--force` past unexpected state/);
	assert.match(projectConfig, /report-only \(enumerated via `herdr worktree list`\), never auto-removed/);
});

test("operator dry-run plan workflow is exposed and read-only", async () => {
	const operatorPlanSkill = await readFile(join(repoRoot, ".pi", "skills", "operator-plan", "SKILL.md"), "utf8");
	const operatorRunSkill = await readFile(join(repoRoot, ".pi", "skills", "operator-run", "SKILL.md"), "utf8");

	assert.match(operatorRunSkill, /Follow the read-only `operator-plan` contract/);
	assert.match(operatorRunSkill, /Recommended action: <groom\|work\|review PR\|triage\|stop\|ask human>/);
	assert.match(operatorRunSkill, /Would mutate: no/);

	assert.match(operatorPlanSkill, /Produce exactly one read-only dry-run Flock operator plan/);
	assert.match(operatorPlanSkill, /If `docs\/flock\/project\.md` is present, read it before recommending an action/);
	assert.match(operatorPlanSkill, /likely grooming need/);
	assert.match(operatorPlanSkill, /triage queue status/);
	assert.match(operatorPlanSkill, /Recommend exactly one next action/);
	assert.match(operatorPlanSkill, /`review PR`/);
	assert.match(operatorPlanSkill, /Would mutate: no/);
	assert.match(operatorPlanSkill, /Do not run mutating commands/);
});

test("project config documents operator approval policy", async () => {
	const projectConfigSkill = await readFile(join(repoRoot, ".pi", "skills", "project-config", "SKILL.md"), "utf8");
	const projectConfigTemplate = await readFile(join(repoRoot, ".pi", "skills", "project-config", "TEMPLATE.md"), "utf8");
	const projectConfig = await readFile(join(repoRoot, "docs", "flock", "project.md"), "utf8");
	const operatorWorkflow = await readFile(join(repoRoot, "docs", "operator-workflow.md"), "utf8");

	for (const content of [projectConfigSkill, projectConfigTemplate, projectConfig]) {
		assert.match(content, /Operator Approval Policy/);
		assert.match(content, /Issue selection/);
		assert.match(content, /Grooming labels\/comments/);
		assert.match(content, /Triage labels\/comments/);
		assert.match(content, /Branch creation/);
		assert.match(content, /Commits/);
		assert.match(content, /PR creation\/update/);
		assert.match(content, /Tracker completion\/issue close/);
		assert.match(content, /Merge/);
	}

	assert.match(projectConfigSkill, /Mutating operator automation should block when the operator approval policy is absent/);
	assert.match(projectConfigTemplate, /dry-run only/);
	assert.match(projectConfig, /conditional operator merge/);
	assert.match(projectConfig, /All other PRs remain human-merged/);
	assert.match(projectConfig, /statusCheckRollup/);
	assert.match(projectConfig, /mergeable: MERGEABLE/);
	assert.match(projectConfig, /reviewDecision: APPROVED/);
	assert.match(projectConfig, /review verdict non-blocking/);
	assert.match(projectConfig, /Max PR wait per issue: 15m/);
	assert.match(projectConfig, /squash/);
	assert.match(projectConfig, /Check-wait command \(verified/);
	assert.match(projectConfig, /PR author is the authenticated account/);
	assert.match(projectConfig, /IN\("SUCCESS","SKIPPED","NEUTRAL"\)/);
	assert.match(projectConfig, /fail-closed/);
	assert.match(projectConfig, /Issue closure happens after merge/);
	assert.match(operatorWorkflow, /Example: conservative repository policy/);
	assert.match(operatorWorkflow, /Example: trusted\/high-automation repository policy/);
});

test("skills load from .pi/skills with required descriptions", () => {
	const { skills, diagnostics } = loadSkillsFromDir({
		dir: join(repoRoot, ".pi", "skills"),
		source: "test",
	});

	assert.deepEqual(diagnostics, []);
	assertSameMembers(
		skills.map((skill) => skill.name),
		expectedSkillNames,
		"skill directory should contain every expected Flock skill",
	);

	for (const skill of skills) {
		assert.equal(typeof skill.description, "string");
		assert.notEqual(skill.description.trim(), "");
	}
});

test("bundled agent markdown files have required frontmatter", async () => {
	const agentsDir = join(repoRoot, ".pi", "agents");
	const entries = await readdir(agentsDir, { withFileTypes: true });
	const agentFiles = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name)
		.sort();

	assertSameMembers(
		agentFiles.map((fileName) => fileName.replace(/\.md$/, "")),
		expectedAgentNames,
		"agents directory should contain every expected bundled Flock agent",
	);

	for (const fileName of agentFiles) {
		const filePath = join(agentsDir, fileName);
		const content = await readFile(filePath, "utf8");
		const { frontmatter, body } = parseFrontmatter(content);
		const expectedName = fileName.replace(/\.md$/, "");

		assert.equal(frontmatter.name, expectedName, `${fileName} name should match file name`);
		assert.equal(typeof frontmatter.description, "string", `${fileName} missing description`);
		assert.notEqual(frontmatter.description.trim(), "", `${fileName} has empty description`);
		assert.notEqual(body.trim(), "", `${fileName} has empty body`);
	}
});
