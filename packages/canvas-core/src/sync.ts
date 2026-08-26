import { CanvasRequestError } from "./errors";
import {
	normalizeCanvasAssignment,
	normalizeCanvasCourse,
	normalizeCanvasResource,
} from "./normalization";
import type {
	CanvasAccountRef,
	CanvasDataSource,
	CanvasResourceType,
	CanvasSyncRepository,
	CanvasSyncResult,
	NormalizedCanvasAssignment,
	NormalizedCanvasCourse,
	NormalizedCanvasResource,
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

export async function fetchNormalizedCourseResources(
	source: CanvasDataSource,
	account: CanvasAccountRef,
	courseId: number,
	observedAt = new Date().toISOString(),
): Promise<NormalizedCanvasResource[]> {
	const [announcements, pageSummaries, quizSummaries, discussions, files] =
		await Promise.all([
			optionalResourceCollection(
				source,
				`/api/v1/announcements?context_codes[]=course_${courseId}&per_page=100`,
			),
			optionalResourceCollection(
				source,
				`/api/v1/courses/${courseId}/pages?per_page=100`,
			),
			optionalResourceCollection(
				source,
				`/api/v1/courses/${courseId}/quizzes?per_page=100`,
			),
			optionalResourceCollection(
				source,
				`/api/v1/courses/${courseId}/discussion_topics?order_by=recent_activity&per_page=100`,
			),
			optionalResourceCollection(
				source,
				`/api/v1/courses/${courseId}/files?per_page=100`,
			),
		]);

	const [pages, quizzes, discussionViews] = await Promise.all([
		Promise.all(
			pageSummaries.map(async (page) => {
				const pageUrl = String(page.url ?? "");
				return pageUrl
					? safeRequest(
							source,
							`/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`,
							page,
						)
					: page;
			}),
		),
		Promise.all(
			quizSummaries.map(async (quiz) => {
				const quizId = Number(quiz.id);
				return Number.isFinite(quizId)
					? safeRequest(
							source,
							`/api/v1/courses/${courseId}/quizzes/${quizId}`,
							quiz,
						)
					: quiz;
			}),
		),
		Promise.all(
			discussions.map(async (discussion) => {
				const topicId = Number(discussion.id);
				if (!Number.isFinite(topicId)) return [];
				const view = await safeRequest<{
					view?: Array<Record<string, unknown>>;
					entries?: Array<Record<string, unknown>>;
				}>(
					source,
					`/api/v1/courses/${courseId}/discussion_topics/${topicId}/view`,
					{},
				);
				return flattenDiscussionEntries(
					view.view ?? view.entries ?? [],
					topicId,
				);
			}),
		),
	]);

	const groups: Array<{
		type: CanvasResourceType;
		records: Array<Record<string, unknown>>;
	}> = [
		{ type: "announcement", records: announcements },
		{ type: "page", records: pages },
		{ type: "quiz", records: quizzes },
		{ type: "discussion", records: discussions },
		{ type: "discussion-entry", records: discussionViews.flat() },
		{ type: "file", records: files },
	];

	return Promise.all(
		groups.flatMap(({ type, records }) =>
			records.map((record) =>
				normalizeCanvasResource(record, account, courseId, type, observedAt),
			),
		),
	);
}

async function optionalResourceCollection(
	source: CanvasDataSource,
	path: string,
): Promise<Array<Record<string, unknown>>> {
	try {
		return await source.paginatedRequest<Record<string, unknown>>(path);
	} catch (error) {
		if (
			error instanceof CanvasRequestError &&
			(error.status === 403 || error.status === 404)
		) {
			return [];
		}
		throw error;
	}
}

async function safeRequest<T>(
	source: CanvasDataSource,
	path: string,
	fallback: T,
): Promise<T> {
	try {
		return await source.request<T>(path);
	} catch {
		return fallback;
	}
}

function flattenDiscussionEntries(
	entries: Array<Record<string, unknown>>,
	topicId: number,
): Array<Record<string, unknown>> {
	return entries.flatMap((entry) => {
		const replies = Array.isArray(entry.replies)
			? (entry.replies as Array<Record<string, unknown>>)
			: [];
		const normalized: Record<string, unknown> = { ...entry, topic_id: topicId };
		delete normalized.replies;
		return [normalized, ...flattenDiscussionEntries(replies, topicId)];
	});
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

export async function syncCanvasSearchCache(options: {
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
	const courseData = [] as Array<{
		courseId: number;
		assignments: NormalizedCanvasAssignment[];
		resources: NormalizedCanvasResource[];
	}>;
	for (const course of courses) {
		const [assignments, resources] = await Promise.all([
			fetchNormalizedAssignments(
				options.source,
				options.account,
				course.id,
				observedAt,
			),
			fetchNormalizedCourseResources(
				options.source,
				options.account,
				course.id,
				observedAt,
			),
		]);
		courseData.push({ courseId: course.id, assignments, resources });
	}
	const results: CanvasSyncResult[] = [
		await options.repository.applySnapshot({
			account: options.account,
			scope: "courses",
			generationId,
			observedAt,
			records: courses,
		}),
	];
	for (const { courseId, assignments, resources } of courseData) {
		results.push(
			await options.repository.applySnapshot({
				account: options.account,
				scope: "assignments",
				scopeKey: String(courseId),
				generationId,
				observedAt,
				records: assignments,
			}),
		);
		results.push(
			await options.repository.applySnapshot({
				account: options.account,
				scope: "resources",
				scopeKey: String(courseId),
				generationId,
				observedAt,
				records: resources,
			}),
		);
	}
	return results;
}
