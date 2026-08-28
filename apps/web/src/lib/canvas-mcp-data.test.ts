import { describe, expect, test } from "bun:test";
import type {
	NormalizedCanvasAssignment,
	NormalizedCanvasCourse,
	NormalizedCanvasResource,
} from "@canvas-v5/canvas-core";

import {
	assignmentDetail,
	listCompactAssignments,
	listCompactPages,
	pageDetail,
} from "./canvas-mcp-data";

const metadata = {
	canvasAccountId: "account-1",
	observedAt: "2026-08-19T12:00:00.000Z",
	contentHash: "hash",
};
const courses: NormalizedCanvasCourse[] = [
	{
		...metadata,
		id: 42,
		name: "Biology",
		course_code: "BIO 101",
	},
];

function assignment(
	id: number,
	dueAt: string | null,
	workflowState = "unsubmitted",
): NormalizedCanvasAssignment {
	return {
		...metadata,
		id,
		course_id: 42,
		name: `Assignment ${id}`,
		due_at: dueAt,
		published: true,
		points_possible: 10,
		html_url: `https://canvas.example.edu/courses/42/assignments/${id}`,
		submission: { workflow_state: workflowState },
	};
}

describe("Canvas MCP assignment projection", () => {
	test("joins courses, filters completed work, sorts due dates, and paginates", () => {
		const source = {
			account: {
				id: "account-1",
				label: "School",
				canvasBaseUrl: "https://canvas.example.edu",
			},
			courses,
			assignments: [
				assignment(3, "2026-08-23T12:00:00.000Z"),
				assignment(1, "2026-08-21T12:00:00.000Z"),
				assignment(2, "2026-08-22T12:00:00.000Z", "submitted"),
			],
		};
		const first = listCompactAssignments([source], {
			dueAfter: "2026-08-20T00:00:00.000Z",
			dueBefore: "2026-08-25T00:00:00.000Z",
			includeUndated: false,
			includeCompleted: false,
			includeOverdue: false,
			limit: 1,
			timezone: "America/New_York",
		});

		expect(first.assignments).toHaveLength(1);
		expect(first.assignments[0]?.id).toBe(1);
		expect(first.assignments[0]?.course).toEqual({
			id: 42,
			name: "Biology",
			code: "BIO 101",
		});
		expect(first.assignments[0]?.dueAtDisplay).toContain("EDT");
		expect(first.pageInfo.hasMore).toBe(true);

		const second = listCompactAssignments([source], {
			dueAfter: "2026-08-20T00:00:00.000Z",
			dueBefore: "2026-08-25T00:00:00.000Z",
			includeUndated: false,
			includeCompleted: false,
			includeOverdue: false,
			limit: 1,
			cursor: first.pageInfo.nextCursor ?? undefined,
			timezone: "America/New_York",
		});
		expect(second.assignments[0]?.id).toBe(3);
		expect(second.pageInfo.hasMore).toBe(false);
	});

	test("detail projection never returns unknown or sensitive fields", () => {
		const raw = {
			...assignment(1, "2026-08-21T12:00:00.000Z"),
			description: "Full instructions",
			rubric: [{ id: "criterion-1" }],
			external_tool_tag_attributes: { secure_params: "secret" },
		} as NormalizedCanvasAssignment;
		const detail = assignmentDetail(raw);

		expect(detail.description).toBe("Full instructions");
		expect(detail.rubric).toEqual([{ id: "criterion-1" }]);
		expect(JSON.stringify(detail)).not.toContain("secure_params");
	});
});

describe("Canvas MCP page projection", () => {
	const resources: NormalizedCanvasResource[] = [
		{
			...metadata,
			id: "42:page:week-one",
			course_id: 42,
			resourceType: "page",
			canvasResourceId: "week-one",
			title: "Week One",
			body: "<p>Read chapter one.</p>",
			html_url: "https://canvas.example.edu/courses/42/pages/week-one",
			updated_at: "2026-08-20T12:00:00.000Z",
		},
		{
			...metadata,
			id: "42:quiz:7",
			course_id: 42,
			resourceType: "quiz",
			canvasResourceId: "7",
			title: "Week One Quiz",
			body: "Not a page",
		},
	];

	test("lists only pages with course context and paginates", () => {
		const result = listCompactPages(
			[
				{
					account: {
						id: "account-1",
						label: "School",
						canvasBaseUrl: "https://canvas.example.edu",
					},
					courses,
					resources,
				},
			],
			{ courseIds: [42], limit: 1 },
		);

		expect(result.pages).toEqual([
			expect.objectContaining({
				pageUrl: "week-one",
				title: "Week One",
				course: { id: 42, name: "Biology", code: "BIO 101" },
			}),
		]);
		expect(result.pages[0]).not.toHaveProperty("body");
		expect(result.pageInfo.hasMore).toBe(false);
	});

	test("returns full page content without arbitrary metadata", () => {
		const cachedPage = resources[0];
		if (!cachedPage) throw new Error("Expected a cached Page fixture.");
		const detail = pageDetail({
			...cachedPage,
			metadata: { url: "week-one", unknown: "not exposed" },
		});

		expect(detail.body).toBe("<p>Read chapter one.</p>");
		expect(detail.pageUrl).toBe("week-one");
		expect(JSON.stringify(detail)).not.toContain("not exposed");
	});
});
