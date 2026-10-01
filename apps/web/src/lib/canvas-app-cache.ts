import type {
	NormalizedCanvasAssignment,
	NormalizedCanvasCalendarEvent,
	NormalizedCanvasCourse,
	NormalizedCanvasResource,
} from "@canvas-v5/canvas-core";

export interface CanvasAppCache {
	courses: NormalizedCanvasCourse[];
	assignments: NormalizedCanvasAssignment[];
	resources: NormalizedCanvasResource[];
	calendar: NormalizedCanvasCalendarEvent[];
}

/** Only paths under the Canvas API are accepted, including pagination links. */
export function canvasAppRequestUrl(path: string, baseUrl: string) {
	const base = new URL(baseUrl);
	const url = new URL(path, base);
	if (
		url.origin !== base.origin ||
		!url.pathname.startsWith("/api/v1/") ||
		url.username ||
		url.password ||
		url.hash ||
		/%(?:2e|2f|5c)/i.test(url.pathname) ||
		path.includes("\\")
	) {
		throw new Error("Invalid Canvas API path.");
	}
	return url;
}

function resourceValue(resource: NormalizedCanvasResource) {
	return {
		...resource.metadata,
		id: Number(resource.canvasResourceId) || resource.canvasResourceId,
		course_id: resource.course_id,
		title: resource.title,
		name: resource.title,
		display_name: resource.title,
		body: resource.body,
		message: resource.body,
		description: resource.body,
		html_url: resource.html_url,
		url:
			resource.resourceType === "page"
				? resource.canvasResourceId
				: resource.metadata?.url,
		page_id: resource.metadata?.page_id ?? Number(resource.canvasResourceId),
	};
}

export function readCanvasAppCache(
	path: string,
	cache: CanvasAppCache,
): unknown {
	const url = new URL(path, "https://canvas.invalid");
	const route = url.pathname
		.slice("/api/v1/".length)
		.split("/")
		.map(decodeURIComponent);
	const [area, id, collection, item, detail] = route;
	if (area === "courses" && !id) return cache.courses;
	if (area === "calendar_events") {
		const contexts = url.searchParams.getAll("context_codes[]");
		return cache.calendar.filter(
			(event) =>
				!contexts.length || contexts.includes(event.context_code ?? ""),
		);
	}
	if (area === "planner" && id === "items") {
		return cache.assignments.map((assignment) => ({
			course_id: assignment.course_id,
			plannable_id: assignment.id,
			plannable_type: "assignment",
			plannable_date: assignment.due_at,
			plannable: {
				id: assignment.id,
				title: assignment.name,
				points_possible: assignment.points_possible,
			},
			html_url: assignment.html_url,
			submissions: {
				submitted: Boolean(assignment.submission?.submitted_at),
				graded: Boolean(assignment.submission?.graded),
				missing: Boolean(assignment.submission?.missing),
			},
		}));
	}
	if (area === "courses" && id) {
		const courseId = Number(id);
		if (!collection)
			return required(cache.courses.find((course) => course.id === courseId));
		if (collection === "assignments") {
			const assignments = cache.assignments.filter(
				(assignment) => assignment.course_id === courseId,
			);
			if (!item) return assignments;
			const assignment = required(
				assignments.find((candidate) => String(candidate.id) === item),
			);
			if (detail === "submissions") {
				return required(
					assignment.submission && {
						...assignment.submission,
						assignment_id: assignment.id,
					},
				);
			}
			return assignment;
		}
		const type = (
			{
				pages: "page",
				quizzes: "quiz",
				discussion_topics: "discussion",
				files: "file",
				front_page: "page",
			} as const
		)[collection as "pages"];
		if (type) {
			const resources = cache.resources.filter(
				(resource) =>
					resource.course_id === courseId && resource.resourceType === type,
			);
			if (collection === "front_page")
				return resourceValue(
					required(resources.find((resource) => resource.metadata?.front_page)),
				);
			if (item)
				return resourceValue(
					required(
						resources.find((resource) => resource.canvasResourceId === item),
					),
				);
			return resources.map(resourceValue);
		}
	}
	if (area === "announcements") {
		const courses = url.searchParams.getAll("context_codes[]");
		return cache.resources
			.filter(
				(resource) =>
					resource.resourceType === "announcement" &&
					(!courses.length || courses.includes(`course_${resource.course_id}`)),
			)
			.map(resourceValue);
	}
	throw new Error(
		"This view needs a Canvas API-token connection. Browser-session accounts expose cached courses, assignments, submissions, pages, and calendar here; open Canvas V5 in your browser for this view.",
	);
}

function required<T>(value: T | undefined | null): T {
	if (value == null)
		throw new Error(
			"This item is not in the Canvas cache. Refresh Canvas or open it in your browser.",
		);
	return value;
}
