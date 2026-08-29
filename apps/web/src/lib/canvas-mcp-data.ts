import type {
	NormalizedCanvasAssignment,
	NormalizedCanvasCourse,
	NormalizedCanvasResource,
} from "@canvas-v5/canvas-core";

export interface CanvasMcpAccount {
	id: string;
	label: string;
	canvasBaseUrl: string;
}

export interface CanvasMcpAssignment {
	id: number;
	name: string;
	account: Pick<CanvasMcpAccount, "id" | "label">;
	course: {
		id: number;
		name: string;
		code: string | null;
	};
	dueAt: string | null;
	dueAtDisplay: string | null;
	pointsPossible: number | null;
	omitFromFinalGrade: boolean;
	published: boolean;
	htmlUrl: string | null;
	submission: {
		workflowState: "unsubmitted" | "submitted" | "graded";
		submittedAt: string | null;
		missing: boolean;
		late: boolean;
		excused: boolean;
	};
}

export interface CanvasMcpAssignmentSource {
	account: CanvasMcpAccount;
	courses: NormalizedCanvasCourse[];
	assignments: NormalizedCanvasAssignment[];
}

export interface CanvasMcpPageSource {
	account: CanvasMcpAccount;
	courses: NormalizedCanvasCourse[];
	resources: NormalizedCanvasResource[];
}

export interface CanvasMcpPageFilters {
	accountIds?: string[];
	courseIds?: number[];
	limit: number;
	cursor?: string;
}

export interface CanvasMcpAssignmentFilters {
	accountIds?: string[];
	courseIds?: number[];
	dueAfter?: string;
	dueBefore?: string;
	includeUndated?: boolean;
	includeCompleted?: boolean;
	includeOverdue?: boolean;
	limit: number;
	cursor?: string;
	timezone: string;
}

export function listCompactAssignments(
	sources: CanvasMcpAssignmentSource[],
	filters: CanvasMcpAssignmentFilters,
) {
	const dueAfter = parseOptionalDate(filters.dueAfter, "dueAfter");
	const dueBefore = parseOptionalDate(filters.dueBefore, "dueBefore");
	if (dueAfter && dueBefore && dueAfter > dueBefore) {
		throw new Error("dueAfter must be before dueBefore.");
	}

	const accountIds = filters.accountIds ? new Set(filters.accountIds) : null;
	const courseIds = filters.courseIds ? new Set(filters.courseIds) : null;
	const assignments = sources
		.filter((source) => !accountIds || accountIds.has(source.account.id))
		.flatMap((source) => {
			const courses = new Map(
				source.courses.map((course) => [course.id, course]),
			);
			return source.assignments.flatMap((assignment) => {
				if (courseIds && !courseIds.has(assignment.course_id)) return [];
				const compact = compactAssignment(
					assignment,
					source.account,
					courses.get(assignment.course_id),
					filters.timezone,
				);
				const dueAt = compact.dueAt ? new Date(compact.dueAt) : null;
				if (!dueAt && !filters.includeUndated) return [];
				if (dueAt && dueAfter && dueAt < dueAfter && !filters.includeOverdue) {
					return [];
				}
				if (dueAt && dueBefore && dueAt > dueBefore) return [];
				if (!filters.includeCompleted && isCompleted(compact)) return [];
				return [compact];
			});
		})
		.sort(compareAssignments);

	const offset = decodeCursor(filters.cursor);
	const page = assignments.slice(offset, offset + filters.limit);
	const nextOffset = offset + page.length;
	return {
		assignments: page,
		pageInfo: {
			hasMore: nextOffset < assignments.length,
			nextCursor:
				nextOffset < assignments.length ? encodeCursor(nextOffset) : null,
		},
	};
}

export function listCompactPages(
	sources: CanvasMcpPageSource[],
	filters: CanvasMcpPageFilters,
) {
	const accountIds = filters.accountIds ? new Set(filters.accountIds) : null;
	const courseIds = filters.courseIds ? new Set(filters.courseIds) : null;
	const pages = sources
		.filter((source) => !accountIds || accountIds.has(source.account.id))
		.flatMap((source) => {
			const courses = new Map(
				source.courses.map((course) => [course.id, course]),
			);
			return source.resources.flatMap((resource) => {
				if (resource.resourceType !== "page") return [];
				if (courseIds && !courseIds.has(resource.course_id)) return [];
				const course = courses.get(resource.course_id);
				return [
					{
						pageUrl: resource.canvasResourceId,
						title: resource.title,
						account: {
							id: source.account.id,
							label: source.account.label,
						},
						course: {
							id: resource.course_id,
							name: course?.name ?? `Course ${resource.course_id}`,
							code: course?.course_code ?? null,
						},
						htmlUrl: resource.html_url ?? null,
						updatedAt: resource.updated_at ?? null,
						observedAt: resource.observedAt,
					},
				];
			});
		})
		.sort(
			(left, right) =>
				left.account.label.localeCompare(right.account.label) ||
				left.course.name.localeCompare(right.course.name) ||
				left.title.localeCompare(right.title) ||
				left.pageUrl.localeCompare(right.pageUrl),
		);

	const offset = decodeCursor(filters.cursor);
	const page = pages.slice(offset, offset + filters.limit);
	const nextOffset = offset + page.length;
	return {
		pages: page,
		pageInfo: {
			hasMore: nextOffset < pages.length,
			nextCursor: nextOffset < pages.length ? encodeCursor(nextOffset) : null,
		},
	};
}

export function pageDetail(page: NormalizedCanvasResource) {
	return {
		pageUrl: page.canvasResourceId,
		courseId: page.course_id,
		title: page.title,
		body: page.body ?? null,
		htmlUrl: page.html_url ?? null,
		updatedAt: page.updated_at ?? null,
		observedAt: page.observedAt,
		contentHash: page.contentHash,
	};
}

export function resourceDetail(resource: NormalizedCanvasResource) {
	const metadata = resource.metadata ?? {};
	const safeMetadata = Object.fromEntries(
		[
			"url",
			"topic_id",
			"user_name",
			"posted_at",
			"created_at",
			"due_at",
			"lock_at",
			"unlock_at",
			"points_possible",
			"question_count",
			"content_type",
			"display_name",
			"filename",
			"size",
			"published",
			"front_page",
			"locked_for_user",
			"lock_explanation",
		]
			.filter((key) => metadata[key] !== undefined)
			.map((key) => [key, metadata[key]]),
	);
	return {
		id: resource.canvasResourceId,
		courseId: resource.course_id,
		type: resource.resourceType,
		title: resource.title,
		body: resource.body ?? null,
		htmlUrl: resource.html_url ?? null,
		updatedAt: resource.updated_at ?? null,
		metadata: safeMetadata,
		observedAt: resource.observedAt,
		contentHash: resource.contentHash,
	};
}

export function isValidTimeZone(value: string) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
		return true;
	} catch {
		return false;
	}
}

export function assignmentDetail(assignment: NormalizedCanvasAssignment) {
	return {
		id: assignment.id,
		courseId: assignment.course_id,
		name: assignment.name,
		description: assignment.description ?? null,
		createdAt: assignment.created_at ?? null,
		updatedAt: assignment.updated_at ?? null,
		dueAt: assignment.due_at ?? null,
		unlockAt: assignment.unlock_at ?? null,
		lockAt: assignment.lock_at ?? null,
		htmlUrl: assignment.html_url ?? null,
		pointsPossible: assignment.points_possible ?? null,
		published:
			assignment.published ?? assignment.workflow_state === "published",
		workflowState: assignment.workflow_state ?? null,
		omitFromFinalGrade: assignment.omit_from_final_grade ?? false,
		submissionTypes: assignment.submission_types ?? [],
		allowedExtensions: assignment.allowed_extensions ?? [],
		allowedAttempts: assignment.allowed_attempts ?? null,
		dueDateRequired: assignment.due_date_required ?? false,
		onlyVisibleToOverrides: assignment.only_visible_to_overrides ?? false,
		lockedForUser: assignment.locked_for_user ?? false,
		canSubmit: assignment.can_submit ?? false,
		hasOverrides: assignment.has_overrides ?? false,
		allDates: assignment.all_dates ?? null,
		rubricSettings: assignment.rubric_settings ?? null,
		rubric: assignment.rubric ?? null,
		submission: assignment.submission ?? null,
		observedAt: assignment.observedAt,
		contentHash: assignment.contentHash,
	};
}

function compactAssignment(
	assignment: NormalizedCanvasAssignment,
	account: CanvasMcpAccount,
	course: NormalizedCanvasCourse | undefined,
	timezone: string,
): CanvasMcpAssignment {
	const dueAt = validIsoDate(assignment.due_at);
	const workflowState = submissionWorkflowState(assignment);
	return {
		id: assignment.id,
		name: assignment.name,
		account: { id: account.id, label: account.label },
		course: {
			id: assignment.course_id,
			name: course?.name ?? `Course ${assignment.course_id}`,
			code: course?.course_code ?? null,
		},
		dueAt,
		dueAtDisplay: dueAt ? formatDate(dueAt, timezone) : null,
		pointsPossible: assignment.points_possible ?? null,
		omitFromFinalGrade: assignment.omit_from_final_grade ?? false,
		published:
			assignment.published ?? assignment.workflow_state === "published",
		htmlUrl: assignment.html_url ?? null,
		submission: {
			workflowState,
			submittedAt: validIsoDate(assignment.submission?.submitted_at),
			missing: assignment.submission?.missing ?? false,
			late: assignment.submission?.late ?? false,
			excused: assignment.submission?.excused ?? false,
		},
	};
}

function submissionWorkflowState(
	assignment: NormalizedCanvasAssignment,
): CanvasMcpAssignment["submission"]["workflowState"] {
	const state = assignment.submission?.workflow_state?.toLowerCase();
	if (assignment.submission?.graded || state === "graded") return "graded";
	if (
		assignment.submission?.submitted_at ||
		state === "submitted" ||
		state === "pending_review"
	) {
		return "submitted";
	}
	return "unsubmitted";
}

function isCompleted(assignment: CanvasMcpAssignment) {
	return (
		assignment.submission.excused ||
		assignment.submission.workflowState === "submitted" ||
		assignment.submission.workflowState === "graded"
	);
}

function compareAssignments(
	left: CanvasMcpAssignment,
	right: CanvasMcpAssignment,
) {
	if (left.dueAt !== right.dueAt) {
		if (!left.dueAt) return 1;
		if (!right.dueAt) return -1;
		return left.dueAt.localeCompare(right.dueAt);
	}
	return (
		left.account.label.localeCompare(right.account.label) ||
		left.course.name.localeCompare(right.course.name) ||
		left.id - right.id
	);
}

function parseOptionalDate(value: string | undefined, field: string) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`${field} must be a valid ISO 8601 timestamp.`);
	}
	return date;
}

function validIsoDate(value: unknown) {
	if (typeof value !== "string") return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDate(value: string, timezone: string) {
	return new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZone: timezone,
		timeZoneName: "short",
	}).format(new Date(value));
}

function encodeCursor(offset: number) {
	return btoa(JSON.stringify({ version: 1, offset }))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function decodeCursor(cursor: string | undefined) {
	if (!cursor) return 0;
	try {
		const base64 = cursor.replaceAll("-", "+").replaceAll("_", "/");
		const padding = "=".repeat((4 - (base64.length % 4)) % 4);
		const parsed = JSON.parse(atob(base64 + padding)) as {
			version?: unknown;
			offset?: unknown;
		};
		if (
			parsed.version !== 1 ||
			typeof parsed.offset !== "number" ||
			!Number.isSafeInteger(parsed.offset) ||
			parsed.offset < 0
		) {
			throw new Error("Invalid cursor payload.");
		}
		return parsed.offset;
	} catch {
		throw new Error("cursor is invalid or expired.");
	}
}
