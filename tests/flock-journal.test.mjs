import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	FLOCK_EVENT_NAMES,
	JOURNAL_SCHEMA_VERSION,
	appendJournalEvent,
	buildJournalEvent,
	journalPathFor,
	validateEventParams,
} from "../.pi/extensions/flock-journal/index.ts";

function validParams(overrides = {}) {
	return {
		run_id: "operator-run-test",
		workflow: "operator-run",
		event: "run_started",
		repo: "owner/repo",
		...overrides,
	};
}

function makeCwd() {
	return mkdtempSync(join(tmpdir(), "flock-journal-test-"));
}

test("flock_event validates required fields", () => {
	for (const field of ["run_id", "workflow", "event", "repo"]) {
		const missing = validParams();
		delete missing[field];
		const result = validateEventParams(missing);
		assert.equal(result.ok, false, `${field} should be required`);
		assert.match(result.error, new RegExp(`"${field}"`));

		const empty = validateEventParams(validParams({ [field]: "  " }));
		assert.equal(empty.ok, false, `${field} should reject empty strings`);
	}
});

test("flock_event rejects unknown event names with a clear error", () => {
	const result = validateEventParams(validParams({ event: "exploded" }));
	assert.equal(result.ok, false);
	assert.match(result.error, /unknown event "exploded"/);
	for (const name of FLOCK_EVENT_NAMES) {
		assert.ok(result.error.includes(name), `error should list known event ${name}`);
	}
});

test("flock_event type-checks optional fields when present", () => {
	assert.equal(validateEventParams(validParams({ issue: "45" })).ok, false);
	assert.equal(validateEventParams(validParams({ issue: 0 })).ok, false);
	assert.equal(validateEventParams(validParams({ pr: 1.5 })).ok, false);
	assert.equal(validateEventParams(validParams({ branch: 42 })).ok, false);
	assert.equal(validateEventParams(validParams({ data: ["not", "an", "object"] })).ok, false);
	assert.equal(validateEventParams(validParams({ data: null })).ok, false);

	const withOptionals = validateEventParams(
		validParams({ issue: 45, pr: 12, branch: "flock/issue-45-x", data: { passed: true } }),
	);
	assert.equal(withOptionals.ok, true);
});

test("flock_event appends one valid JSON event per line and creates .flock/", () => {
	const cwd = makeCwd();
	const first = buildJournalEvent(validateEventParams(validParams()).params);
	const second = buildJournalEvent(
		validateEventParams(
			validParams({ event: "gate_result", issue: 45, branch: "flock/issue-45-x", data: { passed: true } }),
		).params,
	);

	const firstResult = appendJournalEvent(cwd, first);
	assert.equal(firstResult.ok, true);
	assert.equal(firstResult.path, journalPathFor(cwd));
	const secondResult = appendJournalEvent(cwd, second);
	assert.equal(secondResult.ok, true);

	const lines = readFileSync(journalPathFor(cwd), "utf8").split("\n").filter(Boolean);
	assert.equal(lines.length, 2);

	const parsed = lines.map((line) => JSON.parse(line));
	for (const event of parsed) {
		assert.equal(event.v, JOURNAL_SCHEMA_VERSION);
		assert.ok(!Number.isNaN(Date.parse(event.ts)), "ts should be an ISO-8601 timestamp");
		assert.equal(event.run_id, "operator-run-test");
		assert.equal(event.workflow, "operator-run");
		assert.equal(event.repo, "owner/repo");
	}
	assert.equal(parsed[0].event, "run_started");
	assert.equal(parsed[1].event, "gate_result");
	assert.equal(parsed[1].issue, 45);
	assert.deepEqual(parsed[1].data, { passed: true });
});

test("flock_event generates ts itself and omits absent optional fields", () => {
	const event = buildJournalEvent(validateEventParams(validParams()).params, "2026-01-02T03:04:05.000Z");
	assert.equal(event.ts, "2026-01-02T03:04:05.000Z");
	assert.equal("issue" in event, false);
	assert.equal("pr" in event, false);
	assert.equal("branch" in event, false);
	assert.equal("data" in event, false);

	const generated = buildJournalEvent(validateEventParams(validParams()).params);
	assert.ok(!Number.isNaN(Date.parse(generated.ts)));
});

test("flock_event journal write failure is fail-open with a warning", () => {
	const cwd = makeCwd();
	// A regular file named `.flock` makes the journal directory unwritable.
	writeFileSync(join(cwd, ".flock"), "not a directory");

	const event = buildJournalEvent(validateEventParams(validParams()).params);
	let result;
	assert.doesNotThrow(() => {
		result = appendJournalEvent(cwd, event);
	});
	assert.equal(result.ok, false);
	assert.equal(typeof result.warning, "string");
	assert.match(result.warning, /fail-open/);
	assert.equal(statSync(join(cwd, ".flock")).isFile(), true, "no journal directory should appear");
});

test("flock_event refuses a symlinked journal file and does not write through it", () => {
	const cwd = makeCwd();
	mkdirSync(join(cwd, ".flock"));
	const outside = join(cwd, "outside.jsonl");
	writeFileSync(outside, "");
	symlinkSync(outside, join(cwd, ".flock", "events.jsonl"));

	const event = buildJournalEvent(validateEventParams(validParams()).params);
	let result;
	assert.doesNotThrow(() => {
		result = appendJournalEvent(cwd, event);
	});
	assert.equal(result.ok, false);
	assert.match(result.warning, /symlink|symbolic link/);
	assert.match(result.warning, /fail-open/);
	assert.equal(readFileSync(outside, "utf8"), "", "nothing may be written through the symlink");
});

test("flock_event refuses a symlinked .flock directory", () => {
	const cwd = makeCwd();
	const elsewhere = mkdtempSync(join(tmpdir(), "flock-journal-elsewhere-"));
	symlinkSync(elsewhere, join(cwd, ".flock"));

	const event = buildJournalEvent(validateEventParams(validParams()).params);
	const result = appendJournalEvent(cwd, event);
	assert.equal(result.ok, false);
	assert.match(result.warning, /symlink|symbolic link/);
	assert.equal(
		statSync(join(elsewhere, "events.jsonl"), { throwIfNoEntry: false }),
		undefined,
		"no journal may appear in the symlink target",
	);
});

test("flock_event refuses a hard-linked journal file and does not write through it", () => {
	const cwd = makeCwd();
	mkdirSync(join(cwd, ".flock"));
	const outside = join(cwd, "outside.jsonl");
	writeFileSync(outside, "");
	linkSync(outside, join(cwd, ".flock", "events.jsonl"));

	const event = buildJournalEvent(validateEventParams(validParams()).params);
	let result;
	assert.doesNotThrow(() => {
		result = appendJournalEvent(cwd, event);
	});
	assert.equal(result.ok, false);
	assert.match(result.warning, /hard link/);
	assert.match(result.warning, /fail-open/);
	assert.equal(readFileSync(outside, "utf8"), "", "nothing may be written through the hard link");
});
