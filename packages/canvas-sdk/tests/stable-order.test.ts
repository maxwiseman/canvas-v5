import { describe, expect, test } from "bun:test";
import { stableSortByDate, stableSortByLabel } from "../src/stable-order";

const sortItems = (items: Array<{ id: number; label: string }>) =>
	stableSortByLabel(
		items,
		(item) => item.label,
		(item) => item.id,
	);

describe("stableSortByLabel", () => {
	test("returns the same display order regardless of source order", () => {
		const cached = [
			{ id: 30, label: "Week 10" },
			{ id: 10, label: "Introduction" },
			{ id: 20, label: "Week 2" },
		];
		const refreshed = [cached[1], cached[2], cached[0]];

		expect(sortItems(cached).map((item) => item.id)).toEqual([10, 20, 30]);
		expect(sortItems(refreshed).map((item) => item.id)).toEqual([10, 20, 30]);
	});

	test("uses the stable ID when labels match", () => {
		expect(
			sortItems([
				{ id: 2, label: "Overview" },
				{ id: 1, label: "overview" },
			]).map((item) => item.id),
		).toEqual([1, 2]);
	});

	test("does not mutate the source array", () => {
		const source = [
			{ id: 2, label: "B" },
			{ id: 1, label: "A" },
		];

		sortItems(source);

		expect(source.map((item) => item.id)).toEqual([2, 1]);
	});

	test("sorts dates deterministically with missing dates last", () => {
		const items = [
			{ id: 3, label: "Undated", date: null },
			{ id: 2, label: "Later", date: "2026-09-02T12:00:00Z" },
			{ id: 1, label: "Sooner", date: "2026-09-01T12:00:00Z" },
		];

		expect(
			stableSortByDate(items, (item) => item.date, "ascending", {
				getLabel: (item) => item.label,
				getId: (item) => item.id,
			}).map((item) => item.id),
		).toEqual([1, 2, 3]);
		expect(
			stableSortByDate(items, (item) => item.date, "descending", {
				getLabel: (item) => item.label,
				getId: (item) => item.id,
			}).map((item) => item.id),
		).toEqual([2, 1, 3]);
	});
});
