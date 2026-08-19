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

	test("stable hashes ignore object key order", async () => {
		expect(await hashCanvasRecord({ a: 1, b: 2 })).toBe(
			await hashCanvasRecord({ b: 2, a: 1 }),
		);
	});
});
