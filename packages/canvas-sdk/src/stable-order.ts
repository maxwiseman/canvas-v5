const displayNameCollator = new Intl.Collator("en-US", {
	numeric: true,
	sensitivity: "base",
});

type StableKey = number | string;

interface StableFallback<T> {
	getLabel: (item: T) => string;
	getId: (item: T) => StableKey;
}

export function stableSortByLabel<T>(
	items: readonly T[],
	getLabel: (item: T) => string,
	getId: (item: T) => StableKey,
) {
	return [...items].sort((a, b) => compareLabelsAndIds(a, b, getLabel, getId));
}

export function stableSortByDate<T>(
	items: readonly T[],
	getDate: (item: T) => string | null | undefined,
	direction: "ascending" | "descending",
	fallback: StableFallback<T>,
) {
	return [...items].sort((a, b) => {
		const aTime = parseDate(getDate(a));
		const bTime = parseDate(getDate(b));

		if (aTime !== undefined && bTime !== undefined && aTime !== bTime) {
			return direction === "ascending" ? aTime - bTime : bTime - aTime;
		}
		if (aTime !== undefined) return -1;
		if (bTime !== undefined) return 1;

		return compareLabelsAndIds(a, b, fallback.getLabel, fallback.getId);
	});
}

function parseDate(value: string | null | undefined) {
	if (!value) return undefined;
	const time = Date.parse(value);
	return Number.isFinite(time) ? time : undefined;
}

function compareLabelsAndIds<T>(
	a: T,
	b: T,
	getLabel: (item: T) => string,
	getId: (item: T) => StableKey,
) {
	const labelOrder = displayNameCollator.compare(
		getLabel(a).trim(),
		getLabel(b).trim(),
	);
	if (labelOrder !== 0) return labelOrder;

	const aId = getId(a);
	const bId = getId(b);
	if (typeof aId === "number" && typeof bId === "number") {
		return aId - bId;
	}
	return displayNameCollator.compare(String(aId), String(bId));
}
