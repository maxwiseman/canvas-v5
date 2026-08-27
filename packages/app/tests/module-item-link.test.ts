import { describe, expect, test } from "bun:test";
import type { CanvasModuleItem } from "@canvas-v5/canvas-sdk";
import { moduleItemLink } from "../src/lib/module-item-link";

function item(overrides: Partial<CanvasModuleItem>): CanvasModuleItem {
	return {
		id: 1,
		module_id: 10,
		title: "Module item",
		type: "Assignment",
		...overrides,
	};
}

describe("moduleItemLink", () => {
	test("maps supported Canvas content to shared app routes", () => {
		expect(
			moduleItemLink("42", item({ content_id: 7, type: "Assignment" })),
		).toEqual({
			href: "/courses/42/assignments/7?module_item_id=1",
			external: false,
		});
		expect(
			moduleItemLink("42", item({ content_id: 8, type: "Discussion" })),
		).toEqual({
			href: "/courses/42/discussions/8?module_item_id=1",
			external: false,
		});
		expect(
			moduleItemLink("42", item({ page_url: "week-1", type: "Page" })),
		).toEqual({
			href: "/courses/42/pages/week-1?module_item_id=1",
			external: false,
		});
		expect(moduleItemLink("42", item({ content_id: 9, type: "Quiz" }))).toEqual(
			{
				href: "/courses/42/quizzes/9?module_item_id=1",
				external: false,
			},
		);
	});

	test("keeps unsupported Canvas content on the native fallback", () => {
		expect(
			moduleItemLink(
				"42",
				item({
					html_url: "https://school.instructure.com/courses/42/files/3",
					type: "File",
				}),
			),
		).toEqual({
			href: "https://school.instructure.com/courses/42/files/3?canvas_v5_native=1",
			external: true,
		});
	});

	test("leaves direct external URLs external", () => {
		expect(
			moduleItemLink(
				"42",
				item({
					external_url: "https://example.com/resource",
					type: "ExternalUrl",
				}),
			),
		).toEqual({ href: "https://example.com/resource", external: true });
	});
});
