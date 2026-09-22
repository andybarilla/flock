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
	"product",
	"project-config",
	"pr-review",
	"review",
	"scout-and-plan",
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
	["lead", "tech-lead"],
	["product", "product-manager"],
	["project-config", "project-config"],
]);

const expectedSkillNames = [
	"engineering-manager",
	"flock-status",
	"github-issue-worker",
	"groom",
	"ic-dev",
	"ic-review",
	"issue-loop",
	"pr-review",
	"product-manager",
	"project-config",
	"tech-lead",
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
