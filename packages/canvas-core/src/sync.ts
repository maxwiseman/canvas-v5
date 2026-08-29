import { CanvasRequestError } from "./errors";
import {
	normalizeCanvasAssignment,
	normalizeCanvasCalendarEvent,
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
	NormalizedCanvasCalendarEvent,
	NormalizedCanvasCourse,
	NormalizedCanvasResource,
} from "./types";

export async function fetchNormalizedCalendarEvents(
	source: CanvasDataSource,
	account: CanvasAccountRef,
	contextCodes: string[],
	observedAt = new Date().toISOString(),
): Promise<NormalizedCanvasCalendarEvent[]> {
	const groups = chunkValues(contextCodes, 10);
	const paths = (groups.length > 0 ? groups : [[]]).map((contexts) => {
		const search = new URLSearchParams({
			type: "event",
			all_events: "true",
			per_page: "100",
		});
		for (const contextCode of contexts) {
			search.append("context_codes[]", contextCode);
		}
		return `/api/v1/calendar_events?${search.toString()}`;
	});
	const payloads = (
		await Promise.all(
			paths.map((path) => source.paginatedRequest<unknown>(path)),
		)
	).flat();
	const events = await Promise.all(
		payloads.map((payload) =>
			normalizeCanvasCalendarEvent(payload, account, observedAt),
		),
	);
	return [...new Map(events.map((event) => [event.id, event])).values()];
}

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
	const payloads = await fetchAssignmentPayloads(source, courseId);
	return normalizeAssignmentPayloads(payloads, account, courseId, observedAt);
}

async function fetchAssignmentPayloads(
	source: CanvasDataSource,
	courseId: number,
): Promise<Array<Record<string, unknown>>> {
	return source.paginatedRequest<Record<string, unknown>>(
		`/api/v1/courses/${courseId}/assignments?include[]=submission&override_assignment_dates=true&per_page=100`,
	);
}

function normalizeAssignmentPayloads(
	payloads: Array<Record<string, unknown>>,
	account: CanvasAccountRef,
	courseId: number,
	observedAt: string,
) {
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
	linkedContent: Array<string | null | undefined> = [],
): Promise<NormalizedCanvasResource[]> {
	return (
		await fetchNormalizedCourseContent(source, account, courseId, observedAt, {
			includeAssignments: false,
			linkedContent,
		})
	).resources;
}

export async function fetchNormalizedCourseSearchContent(
	source: CanvasDataSource,
	account: CanvasAccountRef,
	courseId: number,
	observedAt = new Date().toISOString(),
	linkedContent: Array<string | null | undefined> = [],
) {
	return fetchNormalizedCourseContent(source, account, courseId, observedAt, {
		includeAssignments: true,
		linkedContent,
	});
}

type DiscoverableResourceType =
	| Exclude<CanvasResourceType, "discussion-entry">
	| "assignment";

interface ResourceCandidate {
	type: DiscoverableResourceType;
	resourceId: string;
	record?: Record<string, unknown>;
}

interface ResourceDescriptor {
	listPath?: (courseId: number) => string;
	detailPath: (courseId: number, resourceId: string) => string;
	recordId: (record: Record<string, unknown>) => string | undefined;
	needsDetail: (record: Record<string, unknown>) => boolean;
}

const RESOURCE_DESCRIPTORS: Record<
	DiscoverableResourceType,
	ResourceDescriptor
> = {
	assignment: {
		detailPath: (courseId, id) =>
			`/api/v1/courses/${courseId}/assignments/${id}`,
		recordId: numericRecordId,
		needsDetail: (record) => record.description === undefined,
	},
	announcement: {
		listPath: (courseId) =>
			`/api/v1/announcements?context_codes[]=course_${courseId}&per_page=100`,
		detailPath: (courseId, id) =>
			`/api/v1/courses/${courseId}/discussion_topics/${id}`,
		recordId: numericRecordId,
		needsDetail: (record) => record.message === undefined,
	},
	page: {
		listPath: (courseId) => `/api/v1/courses/${courseId}/pages?per_page=100`,
		detailPath: (courseId, slug) =>
			`/api/v1/courses/${courseId}/pages/${encodeURIComponent(slug)}`,
		recordId: (record) => optionalString(record.url),
		needsDetail: (record) => record.body === undefined,
	},
	quiz: {
		listPath: (courseId) => `/api/v1/courses/${courseId}/quizzes?per_page=100`,
		detailPath: (courseId, id) => `/api/v1/courses/${courseId}/quizzes/${id}`,
		recordId: numericRecordId,
		needsDetail: (record) => record.description === undefined,
	},
	discussion: {
		listPath: (courseId) =>
			`/api/v1/courses/${courseId}/discussion_topics?order_by=recent_activity&per_page=100`,
		detailPath: (courseId, id) =>
			`/api/v1/courses/${courseId}/discussion_topics/${id}`,
		recordId: numericRecordId,
		needsDetail: (record) => record.message === undefined,
	},
	file: {
		listPath: (courseId) => `/api/v1/courses/${courseId}/files?per_page=100`,
		detailPath: (_courseId, id) => `/api/v1/files/${id}`,
		recordId: numericRecordId,
		needsDetail: () => false,
	},
};

const RESOURCE_COLLECTION_ORDER: DiscoverableResourceType[] = [
	"announcement",
	"page",
	"quiz",
	"discussion",
	"file",
];
const MAX_DISCOVERED_RESOURCES_PER_COURSE = 500;
const RESOURCE_RESOLUTION_CONCURRENCY = 8;

async function fetchNormalizedCourseContent(
	source: CanvasDataSource,
	account: CanvasAccountRef,
	courseId: number,
	observedAt: string,
	options: {
		includeAssignments: boolean;
		linkedContent: Array<string | null | undefined>;
	},
) {
	const [assignmentPayloads, collectionGroups, frontPage] = await Promise.all([
		options.includeAssignments
			? fetchAssignmentPayloads(source, courseId)
			: Promise.resolve([]),
		Promise.all(
			RESOURCE_COLLECTION_ORDER.map(async (type) => ({
				type,
				records: await optionalResourceCollection(
					source,
					RESOURCE_DESCRIPTORS[type].listPath?.(courseId) ?? "",
				),
			})),
		),
		optionalResourceRequest(source, `/api/v1/courses/${courseId}/front_page`),
	]);

	const candidates = new Map<string, ResourceCandidate>();
	const queue: string[] = [];
	const processed = new Set<string>();
	let discoveredCount = 0;
	const addCandidate = (
		type: DiscoverableResourceType,
		resourceId: string,
		record?: Record<string, unknown>,
		discovered = false,
	) => {
		if (!resourceId) return;
		if (type === "discussion" && candidates.has(`announcement:${resourceId}`))
			return;
		const key = `${type}:${resourceId}`;
		const current = candidates.get(key);
		if (current) {
			if (record && !current.record) current.record = record;
			return;
		}
		if (discovered) {
			if (discoveredCount >= MAX_DISCOVERED_RESOURCES_PER_COURSE) return;
			discoveredCount += 1;
		}
		candidates.set(key, { type, resourceId, record });
		queue.push(key);
	};

	for (const record of assignmentPayloads) {
		const id = RESOURCE_DESCRIPTORS.assignment.recordId(record);
		if (id) addCandidate("assignment", id, record);
	}
	for (const { type, records } of collectionGroups) {
		for (const record of records) {
			const id = RESOURCE_DESCRIPTORS[type].recordId(record);
			if (id) addCandidate(type, id, record);
		}
	}
	if (frontPage) {
		const id = RESOURCE_DESCRIPTORS.page.recordId(frontPage);
		if (id) addCandidate("page", id, frontPage);
	}

	for (const body of options.linkedContent) {
		for (const reference of extractLinkedResourceReferences(body, courseId)) {
			addCandidate(reference.type, reference.resourceId, undefined, true);
		}
	}

	while (queue.length > 0) {
		const keys = queue.splice(0, RESOURCE_RESOLUTION_CONCURRENCY);
		await Promise.all(
			keys.map(async (key) => {
				if (processed.has(key)) return;
				processed.add(key);
				const candidate = candidates.get(key);
				if (!candidate) return;
				const descriptor = RESOURCE_DESCRIPTORS[candidate.type];
				if (!candidate.record || descriptor.needsDetail(candidate.record)) {
					const detail = await optionalResourceRequest(
						source,
						descriptor.detailPath(courseId, candidate.resourceId),
					);
					if (!detail && !candidate.record) {
						candidates.delete(key);
						return;
					}
					candidate.record = {
						...candidateFallback(candidate),
						...candidate.record,
						...detail,
					};
				}
				for (const reference of extractLinkedResourceReferences(
					resourceSearchBody(candidate.record),
					courseId,
				)) {
					addCandidate(reference.type, reference.resourceId, undefined, true);
				}
			}),
		);
	}

	const assignments = await normalizeAssignmentPayloads(
		candidateRecords(candidates, "assignment"),
		account,
		courseId,
		observedAt,
	);
	const resourceGroups = RESOURCE_COLLECTION_ORDER.map((type) => ({
		type: type as CanvasResourceType,
		records: candidateRecords(candidates, type),
	}));
	const discussions = candidateRecords(candidates, "discussion");
	const discussionViews = await Promise.all(
		discussions.map(async (discussion) => {
			const topicId = Number(discussion.id);
			if (!Number.isSafeInteger(topicId)) return [];
			const view = await safeRequest<{
				view?: Array<Record<string, unknown>>;
				entries?: Array<Record<string, unknown>>;
			}>(
				source,
				`/api/v1/courses/${courseId}/discussion_topics/${topicId}/view`,
				{},
			);
			return flattenDiscussionEntries(view.view ?? view.entries ?? [], topicId);
		}),
	);
	resourceGroups.push({
		type: "discussion-entry",
		records: discussionViews.flat(),
	});
	const resources = await Promise.all(
		resourceGroups.flatMap(({ type, records }) =>
			records.map((record) =>
				normalizeCanvasResource(record, account, courseId, type, observedAt),
			),
		),
	);
	return { assignments, resources };
}

function candidateRecords(
	candidates: Map<string, ResourceCandidate>,
	type: DiscoverableResourceType,
) {
	return [...candidates.values()].flatMap((candidate) =>
		candidate.type === type && candidate.record ? [candidate.record] : [],
	);
}

function candidateFallback(candidate: ResourceCandidate) {
	return candidate.type === "page"
		? { url: candidate.resourceId }
		: { id: Number(candidate.resourceId) };
}

function numericRecordId(record: Record<string, unknown>) {
	const id = Number(record.id);
	return Number.isSafeInteger(id) ? String(id) : undefined;
}

function resourceSearchBody(record: Record<string, unknown> | undefined) {
	if (!record) return undefined;
	return (
		optionalString(record.body) ??
		optionalString(record.description) ??
		optionalString(record.message)
	);
}

function extractLinkedResourceReferences(
	value: unknown,
	courseId: number,
): Array<Pick<ResourceCandidate, "type" | "resourceId">> {
	if (typeof value !== "string" || !value) return [];
	const references = new Map<
		string,
		Pick<ResourceCandidate, "type" | "resourceId">
	>();
	const pagePattern = new RegExp(
		`/(?:api/v1/)?courses/${courseId}/pages/([^\\s"'?#<>]+)`,
		"g",
	);
	for (const match of value.matchAll(pagePattern)) {
		const encodedSlug = match[1];
		if (!encodedSlug) continue;
		let resourceId = encodedSlug;
		try {
			resourceId = decodeURIComponent(encodedSlug).split("#", 1)[0] ?? "";
		} catch {}
		if (!resourceId) continue;
		references.set(`page:${resourceId}`, { type: "page", resourceId });
	}
	for (const [path, type] of [
		["assignments", "assignment"],
		["announcements", "announcement"],
		["quizzes", "quiz"],
		["discussion_topics", "discussion"],
		["files", "file"],
	] as const) {
		const pattern = new RegExp(
			`/(?:api/v1/)?courses/${courseId}/${path}/(\\d+)`,
			"g",
		);
		for (const match of value.matchAll(pattern)) {
			const resourceId = match[1];
			if (resourceId)
				references.set(`${type}:${resourceId}`, { type, resourceId });
		}
	}
	return [...references.values()];
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
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

async function optionalResourceRequest(
	source: CanvasDataSource,
	path: string,
): Promise<Record<string, unknown> | undefined> {
	try {
		return await source.request<Record<string, unknown>>(path);
	} catch (error) {
		if (
			error instanceof CanvasRequestError &&
			(error.status === 403 || error.status === 404)
		)
			return undefined;
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
	const calendarEventsPromise = fetchNormalizedCalendarEvents(
		options.source,
		options.account,
		[
			...(options.account.canvasUserId
				? [`user_${options.account.canvasUserId}`]
				: []),
			...courses.map((course) => `course_${course.id}`),
		],
		observedAt,
	);
	const courseData = [] as Array<{
		courseId: number;
		assignments: NormalizedCanvasAssignment[];
		resources: NormalizedCanvasResource[];
	}>;
	for (const course of courses) {
		const { assignments, resources } = await fetchNormalizedCourseSearchContent(
			options.source,
			options.account,
			course.id,
			observedAt,
			[course.syllabus_body],
		);
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
	const calendarEvents = await calendarEventsPromise;
	results.push(
		await options.repository.applySnapshot({
			account: options.account,
			scope: "calendar",
			generationId,
			observedAt,
			records: calendarEvents,
		}),
	);
	return results;
}

function chunkValues<T>(values: T[], size: number) {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}
