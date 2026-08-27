import type { CanvasModuleItem } from "@canvas-v5/canvas-sdk";

export interface ModuleItemLink {
	href: string;
	external: boolean;
}

export function moduleItemLink(
	courseId: string,
	item: CanvasModuleItem,
): ModuleItemLink | undefined {
	const internalHref = internalModuleItemHref(courseId, item);
	if (internalHref) return { href: internalHref, external: false };

	const rawUrl =
		item.type === "ExternalUrl" ? item.external_url : item.html_url;
	if (!rawUrl) return undefined;

	try {
		const url = new URL(rawUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return undefined;
		}
		if (item.type !== "ExternalUrl") {
			url.searchParams.set("canvas_v5_native", "1");
		}
		return { href: url.toString(), external: true };
	} catch {
		return undefined;
	}
}

export function internalModuleItemHref(
	courseId: string,
	item: CanvasModuleItem,
) {
	const encodedCourseId = encodeURIComponent(courseId);
	const moduleItemContext = `?module_item_id=${item.id}`;
	if (item.type === "Assignment" && item.content_id !== undefined) {
		return `/courses/${encodedCourseId}/assignments/${item.content_id}${moduleItemContext}`;
	}
	if (item.type === "Quiz" && item.content_id !== undefined) {
		return `/courses/${encodedCourseId}/quizzes/${item.content_id}${moduleItemContext}`;
	}
	if (item.type === "Page" && item.page_url) {
		return `/courses/${encodedCourseId}/pages/${encodeURIComponent(item.page_url)}${moduleItemContext}`;
	}
	if (item.type === "Discussion" && item.content_id !== undefined) {
		return `/courses/${encodedCourseId}/discussions/${item.content_id}${moduleItemContext}`;
	}

	return undefined;
}
