import { describe, expect, test } from "bun:test";
import { parseCanvasSearch } from "../src/create-app-router";

describe("parseCanvasSearch", () => {
	test("parses search params without using the entries iterator", () => {
		const originalEntries = URLSearchParams.prototype.entries;
		URLSearchParams.prototype.entries = () => {
			throw new TypeError("entries is not iterable");
		};

		try {
			expect(parseCanvasSearch("?page=2&enabled=true&label=hello")).toEqual({
				page: 2,
				enabled: true,
				label: "hello",
			});
		} finally {
			URLSearchParams.prototype.entries = originalEntries;
		}
	});

	test("preserves duplicate and JSON-encoded values", () => {
		expect(
			parseCanvasSearch(
				"?course=1&course=2&filters=%7B%22late%22%3Atrue%7D&code=01",
			),
		).toEqual({
			course: [1, 2],
			filters: { late: true },
			code: "01",
		});
	});
});
