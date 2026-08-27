import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function createCanvasAppRouter() {
	return createRouter({
		routeTree,
		parseSearch: parseCanvasSearch,
		scrollRestoration: true,
		defaultPreload: "intent",
	});
}

/**
 * Matches TanStack Router's default search parsing without relying on
 * URLSearchParams#entries. Firefox extension content scripts can expose a
 * non-iterable entries result even though URLSearchParams#forEach still works.
 */
export function parseCanvasSearch(search: string) {
	const searchParams = new URLSearchParams(search);
	const result: Record<string, unknown> = Object.create(null);

	searchParams.forEach((rawValue, key) => {
		const value = parseSearchValue(rawValue);
		const previousValue = result[key];

		if (previousValue == null) {
			result[key] = value;
		} else if (Array.isArray(previousValue)) {
			previousValue.push(value);
		} else {
			result[key] = [previousValue, value];
		}
	});

	return result;
}

function parseSearchValue(value: string) {
	const coerced = coerceSearchValue(value);
	if (typeof coerced !== "string") {
		return coerced;
	}

	try {
		return JSON.parse(coerced);
	} catch {
		return coerced;
	}
}

function coerceSearchValue(value: string) {
	if (!value) return "";
	if (value === "false") return false;
	if (value === "true") return true;
	return +value * 0 === 0 && String(+value) === value ? +value : value;
}
