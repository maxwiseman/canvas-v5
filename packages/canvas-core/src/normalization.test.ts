import { describe, expect, test } from "bun:test";

import {
	hashCanvasRecord,
	normalizeCanvasAssignment,
	normalizeCanvasCourse,
} from "./normalization";

const account = {
	id: "account-1",
	baseUrl: "https://canvas.example.edu",
};

describe("Canvas normalization", () => {
	test("normalizes and scopes a course", async () => {
		const course = await normalizeCanvasCourse(
			{ id: "42", name: "Biology", default_view: "modules" },
			account,
			"2026-08-19T12:00:00.000Z",
		);

		expect(course.id).toBe(42);
		expect(course.canvasAccountId).toBe(account.id);
		expect(course.default_view).toBe("modules");
		expect(course.contentHash).toHaveLength(64);
	});

	test("assignment hashes change when descriptions change", async () => {
		const first = await normalizeCanvasAssignment(
			{ id: 7, name: "Essay", description: "First" },
			account,
			42,
			"2026-08-19T12:00:00.000Z",
		);
		const second = await normalizeCanvasAssignment(
			{ id: 7, name: "Essay", description: "Revised" },
			account,
			42,
			"2026-08-19T12:00:00.000Z",
		);

		expect(first.contentHash).not.toBe(second.contentHash);
	});

	test("keeps agent-useful details while dropping sensitive passthrough fields", async () => {
		const assignment = await normalizeCanvasAssignment(
			{
				id: 7,
				name: "Essay",
				description: "Write it",
				points_possible: 25,
				rubric: [{ id: "criterion-1" }],
				external_tool_tag_attributes: {
					url: "https://lti.example.edu",
					secure_params: "do-not-store",
				},
				submission: {
					workflow_state: "submitted",
					submitted_at: "2026-08-19T11:00:00.000Z",
					late: false,
				},
			},
			account,
			42,
			"2026-08-19T12:00:00.000Z",
		);

		expect(assignment.points_possible).toBe(25);
		expect(assignment.rubric).toEqual([{ id: "criterion-1" }]);
		expect(assignment.submission?.workflow_state).toBe("submitted");
		expect(assignment).not.toHaveProperty("external_tool_tag_attributes");
		expect(JSON.stringify(assignment)).not.toContain("secure_params");
	});

	test("normalizes nullable and serialized Canvas submission flags", async () => {
		const assignment = await normalizeCanvasAssignment(
			{
				id: 8,
				name: "Quiz",
				submission: {
					workflow_state: "graded",
					excused: null,
					missing: "false",
					late: 0,
					graded: 1,
				},
			},
			account,
			42,
			"2026-08-19T12:00:00.000Z",
		);

		expect(assignment.submission).toMatchObject({
			workflow_state: "graded",
			missing: false,
			late: false,
			graded: true,
		});
		expect(assignment.submission?.excused).toBeUndefined();
	});

	test("stable hashes ignore object key order", async () => {
		expect(await hashCanvasRecord({ a: 1, b: 2 })).toBe(
			await hashCanvasRecord({ b: 2, a: 1 }),
		);
	});
});
