import { describe, expect, test } from "bun:test";
import { emptySnapshot } from "@canvas-v5/canvas-sdk";

import { buildSearchItems } from "../src/components/global-search";

describe("global Canvas search", () => {
	test("indexes Page titles and full bodies alongside assignments", () => {
		const snapshot = emptySnapshot("extension");
		snapshot.courses = [
			{
				id: 42,
				name: "Biology",
				course_code: "BIO 101",
			},
		];
		snapshot.assignments = [
			{
				id: 7,
				course_id: 42,
				name: "Lab report",
				description: "Write up the microscopy results",
			},
		];
		snapshot.resources = [
			{
				id: "42:page:cell-structure",
				course_id: 42,
				resourceType: "page",
				canvasResourceId: "cell-structure",
				title: "Cell Structure",
				body: "<p>Mitochondria and chloroplast study guide</p>",
				canvasAccountId: "account-1",
				observedAt: "2026-08-28T12:00:00.000Z",
				contentHash: "hash",
			},
		];

		const items = buildSearchItems(snapshot);
		const page = items.find(
			(item) => item.id === "resource:42:page:cell-structure",
		);

		expect(items.some((item) => item.group === "Assignments")).toBe(true);
		expect(page).toMatchObject({
			title: "Cell Structure",
			group: "Pages",
			href: "/courses/42/pages/cell-structure",
		});
		expect(page?.keywords).toContain("mitochondria and chloroplast");
	});
});
