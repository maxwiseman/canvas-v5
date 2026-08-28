import { describe, expect, test } from "bun:test";
import type { NormalizedCanvasResource } from "@canvas-v5/canvas-core";
import { selectCachedPage } from "../src/runtime";

const cachedPage: NormalizedCanvasResource = {
	id: "263259:page:c-dot-1-6-kinematics",
	course_id: 263259,
	resourceType: "page",
	canvasResourceId: "c-dot-1-6-kinematics",
	title: "C.1.6 - Kinematics",
	body: "<p>Class 1.6 learning objectives</p>",
	html_url:
		"https://canvas.example.edu/courses/263259/pages/c-dot-1-6-kinematics",
	updated_at: "2026-08-28T12:00:00.000Z",
	metadata: {
		page_id: 2611316,
		published: true,
		front_page: false,
	},
	canvasAccountId: "account-1",
	observedAt: "2026-08-28T12:00:00.000Z",
	contentHash: "hash",
};

describe("cached Page selection", () => {
	test("projects a crawled Page into the route model without fetching it again", () => {
		expect(
			selectCachedPage([cachedPage], 263259, cachedPage.canvasResourceId),
		).toEqual(
			expect.objectContaining({
				page_id: 2611316,
				url: "c-dot-1-6-kinematics",
				title: "C.1.6 - Kinematics",
				body: "<p>Class 1.6 learning objectives</p>",
				published: true,
			}),
		);
	});

	test("does not treat a title-only Page summary as route-ready", () => {
		expect(
			selectCachedPage(
				[{ ...cachedPage, body: null }],
				263259,
				cachedPage.canvasResourceId,
			),
		).toBeUndefined();
	});
});
