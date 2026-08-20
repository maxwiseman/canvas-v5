import {
	normalizeCanvasAssignment,
	normalizeCanvasCourse,
} from "./normalization";
import type {
	CanvasAccountRef,
	CanvasDataSource,
	CanvasSyncRepository,
	CanvasSyncResult,
	NormalizedCanvasAssignment,
	NormalizedCanvasCourse,
} from "./types";

export async function fetchNormalizedCourses(
	source: CanvasDataSource,
	account: CanvasAccountRef,
	observedAt = new Date().toISOString(),
): Promise<NormalizedCanvasCourse[]> {
	const payloads = await source.paginatedRequest<unknown>(
		"/api/v1/courses?enrollment_state=active&include[]=term&include[]=syllabus_body&per_page=100",
	);
	return Promise.all(
		payloads.map((payload) =>
			normalizeCanvasCourse(payload, account, observedAt),
		),
	);
}

export async function fetchNormalizedAssignments(
	source: CanvasDataSource,
	account: CanvasAccountRef,
	courseId: number,
	observedAt = new Date().toISOString(),
): Promise<NormalizedCanvasAssignment[]> {
	const payloads = await source.paginatedRequest<unknown>(
		`/api/v1/courses/${courseId}/assignments?include[]=submission&override_assignment_dates=true&per_page=100`,
	);
	return Promise.all(
		payloads.map((payload) =>
			normalizeCanvasAssignment(payload, account, courseId, observedAt),
		),
	);
}

export async function syncCoursesAndAssignments(options: {
	source: CanvasDataSource;
	repository: CanvasSyncRepository;
	account: CanvasAccountRef;
	observedAt?: string;
	generationId?: string;
}): Promise<CanvasSyncResult[]> {
	const observedAt = options.observedAt ?? new Date().toISOString();
	const generationId = options.generationId ?? crypto.randomUUID();
	const courses = await fetchNormalizedCourses(
		options.source,
		options.account,
		observedAt,
	);
	const results: CanvasSyncResult[] = [
		await options.repository.applySnapshot({
			account: options.account,
			scope: "courses",
			generationId,
			observedAt,
			records: courses,
		}),
	];

	for (const course of courses) {
		const assignments = await fetchNormalizedAssignments(
			options.source,
			options.account,
			course.id,
			observedAt,
		);
		results.push(
			await options.repository.applySnapshot({
				account: options.account,
				scope: "assignments",
				scopeKey: String(course.id),
				generationId,
				observedAt,
				records: assignments,
			}),
		);
	}

	return results;
}
