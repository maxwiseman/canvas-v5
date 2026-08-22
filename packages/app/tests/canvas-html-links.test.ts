import { describe, expect, test } from "bun:test";
import { resolveCanvasHtmlLink } from "../src/components/canvas-html";

describe("resolveCanvasHtmlLink", () => {
	test("recognizes relative Canvas file links for inline previews", () => {
		expect(
			resolveCanvasHtmlLink(
				"/courses/42/files/99?wrap=1",
				"https://school.instructure.com",
			),
		).toEqual({
			kind: "file",
			href: "/courses/42/files/99?wrap=1",
			courseId: 42,
			fileId: 99,
		});
	});

	test("recognizes Canvas file preview URLs", () => {
		expect(
			resolveCanvasHtmlLink(
				"https://school.instructure.com/courses/42/files/99/preview",
				"https://school.instructure.com",
			),
		).toMatchObject({ kind: "file", courseId: 42, fileId: 99 });
	});

	test("does not intercept file-shaped links from another origin", () => {
		expect(
			resolveCanvasHtmlLink(
				"https://example.com/courses/42/files/99",
				"https://school.instructure.com",
			),
		).toEqual({
			kind: "external",
			href: "https://example.com/courses/42/files/99",
		});
	});
});
