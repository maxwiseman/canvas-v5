import { describe, expect, test } from "bun:test";
import { SubmissionDraftSync } from "../src/submission-drafts";
import type { CanvasSubmissionDraft, CanvasTransport } from "../src/types";

function fixture(initial?: CanvasSubmissionDraft) {
	const records = new Map<string, CanvasSubmissionDraft>(
		initial ? [[initial.id, initial]] : [],
	);
	const disk = new Map<string, CanvasSubmissionDraft>();
	const state = {
		account: "canvas:student",
		remote: "",
		attempt: 0,
		fail: false,
		failDisk: false,
		pauseWrite: undefined as undefined | (() => Promise<void>),
	};
	const writes: { body: string; attempt: number }[] = [];
	const transport: CanvasTransport = {
		mode: "mock",
		probeAuth: async () => ({ status: "unauthenticated" }),
		paginatedRequest: async () => [],
		request: async <T>(path: string, options?: { body?: unknown }) => {
			if (state.fail) throw new Error("Offline");
			if (path.endsWith("/submissions/self")) return { id: 99 } as T;
			expect(path).toBe("/api/graphql");
			const body = options?.body as {
				query: string;
				variables: {
					input: {
						body: string;
						attempt: number;
						submissionId: string;
						activeSubmissionType: string;
					};
				};
			};
			if (body.query.startsWith("query"))
				return {
					data: {
						submission: {
							_id: "99",
							attempt: state.attempt,
							submissionDraft: {
								body: state.remote,
								submissionAttempt: state.attempt + 1,
							},
						},
					},
				} as T;
			const input = body.variables.input;
			expect(input.submissionId).toBe("99");
			expect(input.activeSubmissionType).toBe("online_text_entry");
			writes.push(input);
			await state.pauseWrite?.();
			state.remote = input.body;
			return {
				data: {
					createSubmissionDraft: {
						submissionDraft: {
							body: state.remote,
							submissionAttempt: input.attempt,
						},
						errors: [],
					},
				},
			} as T;
		},
	};
	const sync = new SubmissionDraftSync({
		transport,
		account: () => state.account,
		get: (id) => records.get(id),
		publish: (draft) => records.set(draft.id, draft),
		persist: async (draft) => {
			if (state.failDisk) throw new Error("Disk full");
			disk.set(draft.id, structuredClone(draft));
		},
	});
	return {
		state,
		writes,
		sync,
		disk,
		get: () => {
			const draft = records.get("draft");
			if (!draft) throw new Error("Missing draft");
			return draft;
		},
		load: () => sync.load("draft", "canvas:student", 1, 2),
	};
}
describe("submission draft persistence", () => {
	test("loads native HTML, stores locally, and saves an explicit attempt without submitting", async () => {
		const f = fixture();
		f.state.remote = "<p><strong>From Canvas</strong></p>";
		await f.load();
		expect(f.get().body).toBe(f.state.remote);
		await f.sync.edit("draft", "<p>Local edit</p>");
		expect(f.disk.get("draft")?.pending).toBe(true);
		await f.sync.flush("draft");
		expect(f.writes).toHaveLength(1);
		expect(f.writes[0]?.attempt).toBe(1);
		expect(f.get().pending).toBe(false);
		expect(f.get().status).toBe("saved");
	});
	test("retains offline edits across hydration and retries", async () => {
		const f = fixture();
		await f.load();
		f.state.fail = true;
		await f.sync.edit("draft", "<p>Offline essay</p>");
		await f.sync.flush("draft");
		expect(f.get().status).toBe("error");
		expect(f.get().localSaved).toBe(true);
		const resumed = fixture(f.disk.get("draft"));
		await resumed.load();
		await resumed.sync.flush("draft");
		expect(resumed.state.remote).toBe("<p>Offline essay</p>");
	});
	test("does not let a delayed save discard newer typing", async () => {
		const f = fixture();
		await f.load();
		let release!: () => void;
		let started!: () => void;
		const began = new Promise<void>((r) => {
			started = r;
		});
		f.state.pauseWrite = () =>
			new Promise<void>((r) => {
				release = r;
				started();
			});
		await f.sync.edit("draft", "First");
		const saving = f.sync.flush("draft");
		await began;
		await f.sync.edit("draft", "Second");
		f.state.pauseWrite = undefined;
		release();
		await saving;
		expect(f.writes.map((x) => x.body)).toEqual(["First", "Second"]);
		expect(f.get().body).toBe("Second");
		expect(f.get().pending).toBe(false);
	});
	test("detects remote edits and deletions before writing and offers either draft", async () => {
		const f = fixture();
		f.state.remote = "Original";
		await f.load();
		await f.sync.edit("draft", "Local");
		f.state.remote = "";
		await f.sync.flush("draft");
		expect(f.get().status).toBe("conflict");
		expect(f.writes).toHaveLength(0);
		await f.sync.resolve("draft", false);
		expect(f.get().body).toBe("");
		expect(f.get().pending).toBe(false);
		await f.sync.edit("draft", "Local again");
		f.state.remote = "Other device";
		await f.sync.flush("draft");
		await f.sync.resolve("draft", true);
		expect(f.state.remote).toBe("Local again");
	});
	test("never automatically carries a pending draft into a new attempt", async () => {
		const f = fixture();
		await f.load();
		await f.sync.edit("draft", "Old attempt");
		f.state.attempt = 1;
		await f.sync.flush("draft");
		expect(f.get().status).toBe("conflict");
		expect(f.writes).toHaveLength(0);
		await f.load();
		expect(f.get().status).toBe("conflict");
		await f.sync.resolve("draft", true);
		expect(f.writes[0]?.attempt).toBe(2);
	});
	test("does not send queued writing to a different account", async () => {
		const f = fixture();
		await f.load();
		await f.sync.edit("draft", "Private");
		f.state.account = "canvas:other";
		await f.sync.flush("draft");
		expect(f.writes).toHaveLength(0);
		expect(f.get().pending).toBe(true);
	});
	test("clears the local draft after a successful submission", async () => {
		const f = fixture();
		await f.load();
		await f.sync.edit("draft", "Finished");
		await f.sync.flush("draft");
		await f.sync.submitted("draft");
		expect(f.get().body).toBe("");
		expect(f.get().pending).toBe(false);
		expect(f.get().attempt).toBe(2);
	});
	test("reports storage failures without claiming a local save", async () => {
		const f = fixture();
		await f.load();
		f.state.fail = true;
		f.state.failDisk = true;
		await f.sync.edit("draft", "Keep me");
		await f.sync.flush("draft");
		expect(f.get().body).toBe("Keep me");
		expect(f.get().localSaved).toBe(false);
		expect(f.get().error).toContain("Keep the editor open");
	});
});
