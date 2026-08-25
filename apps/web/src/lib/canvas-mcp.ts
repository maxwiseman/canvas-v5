import { db, PostgresCanvasRepository } from "@canvas-v5/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
	assignmentDetail,
	type CanvasMcpAssignmentSource,
	isValidTimeZone,
	listCompactAssignments,
} from "./canvas-mcp-data";
import {
	CanvasSessionRequiredError,
	ensureCanvasIdentityFresh,
	getCanvasFreshness,
	listCanvasAccountHealth,
	listOwnedCanvasIdentities,
} from "./canvas-sync";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_UPCOMING_DAYS = 7;
const timezoneSchema = z
	.string()
	.default("UTC")
	.describe("IANA timezone such as America/New_York. Defaults to UTC.");
const paginationSchema = {
	limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
	cursor: z.string().optional(),
};

export function createCanvasMcpServer(userId: string) {
	const server = new McpServer({ name: "canvas-v5", version: "0.3.0" });

	server.registerTool(
		"canvas_list_accounts",
		{
			title: "List Canvas accounts and health",
			description:
				"List every connected Canvas account with sync health. Use this to distinguish an empty account from one that is refreshing, unavailable, or needs reauthentication.",
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async () =>
			runTool(async () => {
				const accounts = await listCanvasAccountHealth(userId);
				return success(
					{ accounts },
					`Found ${accounts.length} connected Canvas account${accounts.length === 1 ? "" : "s"}.`,
				);
			}),
	);

	server.registerTool(
		"canvas_list_courses",
		{
			title: "List Canvas courses",
			description:
				"List compact course summaries for one account. This is a cached read by default; set refresh=true only when newer Canvas data is specifically needed.",
			inputSchema: {
				accountId: z.string().optional(),
				refresh: z.boolean().default(false),
			},
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async ({ accountId, refresh }) =>
			runTool(async () => {
				const resolvedAccountId = await resolveAccountId(userId, accountId);
				const acquisition = await acquireAccount(
					userId,
					resolvedAccountId,
					refresh,
				);
				const repository = new PostgresCanvasRepository(db, userId);
				const courses = (await repository.listCourses(resolvedAccountId)).map(
					(course) => ({
						id: course.id,
						name: course.name,
						code: course.course_code ?? null,
						workflowState: course.workflow_state ?? null,
						startAt: course.start_at ?? null,
						endAt: course.end_at ?? null,
					}),
				);
				const health = await accountHealth(userId, resolvedAccountId);
				return success(
					{ account: health, courses, acquisition },
					`Returned ${courses.length} compact course summar${courses.length === 1 ? "y" : "ies"}.`,
				);
			}),
	);

	server.registerTool(
		"canvas_list_assignments",
		{
			title: "List Canvas assignments",
			description:
				"Browse compact assignment summaries for one account. Results omit descriptions, rubrics, LTI configuration, and other large fields; use canvas_get_assignment for full safe details. Cached read by default.",
			inputSchema: {
				accountId: z.string().optional(),
				courseId: z.number().int().optional(),
				courseIds: z.array(z.number().int()).max(100).optional(),
				dueAfter: z.string().datetime({ offset: true }).optional(),
				dueBefore: z.string().datetime({ offset: true }).optional(),
				includeUndated: z.boolean().default(true),
				includeCompleted: z.boolean().default(true),
				timezone: timezoneSchema,
				refresh: z.boolean().default(false),
				...paginationSchema,
			},
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async (input) =>
			runTool(async () => {
				validateTimezone(input.timezone);
				const resolvedAccountId = await resolveAccountId(
					userId,
					input.accountId,
				);
				const acquisition = await acquireAccount(
					userId,
					resolvedAccountId,
					input.refresh,
				);
				const health = await accountHealth(userId, resolvedAccountId);
				const sources = await loadAssignmentSources(userId, [health]);
				const page = listCompactAssignments(sources, {
					accountIds: [resolvedAccountId],
					courseIds: combineCourseIds(input.courseId, input.courseIds),
					dueAfter: input.dueAfter,
					dueBefore: input.dueBefore,
					includeUndated: input.includeUndated,
					includeCompleted: input.includeCompleted,
					includeOverdue: false,
					limit: input.limit,
					cursor: input.cursor,
					timezone: input.timezone,
				});
				return success(
					{ account: health, ...page, acquisition },
					`Returned ${page.assignments.length} compact assignment summar${page.assignments.length === 1 ? "y" : "ies"}.`,
				);
			}),
	);

	server.registerTool(
		"canvas_list_upcoming_assignments",
		{
			title: "List upcoming Canvas assignments",
			description:
				"Best default tool for questions like 'what assignments are coming up?' Returns incomplete assignments across all ready accounts for the next 7 days, sorted by effective due date, with course names, submission state, account health, and pagination. Cached read by default.",
			inputSchema: {
				accountIds: z.array(z.string()).max(50).optional(),
				courseIds: z.array(z.number().int()).max(100).optional(),
				dueAfter: z.string().datetime({ offset: true }).optional(),
				dueBefore: z.string().datetime({ offset: true }).optional(),
				includeUndated: z.boolean().default(false),
				includeCompleted: z.boolean().default(false),
				includeOverdue: z.boolean().default(false),
				timezone: timezoneSchema,
				refresh: z.boolean().default(false),
				...paginationSchema,
			},
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async (input) =>
			runTool(async () => {
				validateTimezone(input.timezone);
				const selected = await selectAccountHealth(userId, input.accountIds);
				const acquisition = await Promise.all(
					selected.map((health) =>
						acquireAccount(userId, health.account.id, input.refresh),
					),
				);
				const refreshedHealth = await selectAccountHealth(
					userId,
					selected.map((health) => health.account.id),
				);
				const sources = await loadAssignmentSources(userId, refreshedHealth);
				const now = new Date();
				const page = listCompactAssignments(sources, {
					accountIds: refreshedHealth.map((health) => health.account.id),
					courseIds: input.courseIds,
					dueAfter: input.dueAfter ?? now.toISOString(),
					dueBefore:
						input.dueBefore ??
						new Date(
							now.getTime() + DEFAULT_UPCOMING_DAYS * 24 * 60 * 60 * 1000,
						).toISOString(),
					includeUndated: input.includeUndated,
					includeCompleted: input.includeCompleted,
					includeOverdue: input.includeOverdue,
					limit: input.limit,
					cursor: input.cursor,
					timezone: input.timezone,
				});
				return success(
					{ accounts: refreshedHealth, ...page, acquisition },
					`Returned ${page.assignments.length} upcoming incomplete assignment${page.assignments.length === 1 ? "" : "s"}.`,
				);
			}),
	);

	server.registerTool(
		"canvas_get_assignment",
		{
			title: "Get Canvas assignment details",
			description:
				"Get one assignment's full privacy-safe details, including description and rubric. Call this only after identifying an assignment from a compact list.",
			inputSchema: {
				accountId: z.string().optional(),
				courseId: z.number().int(),
				assignmentId: z.number().int(),
				refresh: z.boolean().default(false),
			},
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async ({ accountId, courseId, assignmentId, refresh }) =>
			runTool(async () => {
				const resolvedAccountId = await resolveAccountId(userId, accountId);
				const acquisition = await acquireAccount(
					userId,
					resolvedAccountId,
					refresh,
				);
				const repository = new PostgresCanvasRepository(db, userId);
				const assignment = await repository.getAssignment(
					resolvedAccountId,
					courseId,
					assignmentId,
				);
				if (!assignment) throw new Error("Canvas assignment not found.");
				const course = (await repository.listCourses(resolvedAccountId)).find(
					(candidate) => candidate.id === courseId,
				);
				return success(
					{
						accountId: resolvedAccountId,
						course: course
							? {
									id: course.id,
									name: course.name,
									code: course.course_code ?? null,
								}
							: { id: courseId, name: `Course ${courseId}`, code: null },
						assignment: assignmentDetail(assignment),
						acquisition,
					},
					`Returned details for ${assignment.name}.`,
				);
			}),
	);

	server.registerTool(
		"canvas_search",
		{
			title: "Search cached Canvas content",
			description:
				"Search the local-first Canvas cache across courses, assignments, pages, quizzes, announcements, discussions, discussion posts, and file metadata. Content is refreshed in the background; set refresh=true only when newer Canvas data is required.",
			inputSchema: {
				query: z.string().min(1),
				accountId: z.string().optional(),
				courseId: z.number().int().optional(),
				refresh: z.boolean().default(false),
				limit: z.number().int().min(1).max(100).default(25),
			},
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async ({ query, accountId, courseId, refresh, limit }) =>
			runTool(async () => {
				const resolvedAccountId = await resolveAccountId(userId, accountId);
				const acquisition = await acquireAccount(
					userId,
					resolvedAccountId,
					refresh,
				);
				const repository = new PostgresCanvasRepository(db, userId);
				const [courses, assignments, resources] = await Promise.all([
					repository.listCourses(resolvedAccountId),
					repository.listAssignments(resolvedAccountId, courseId),
					repository.listResources(resolvedAccountId, courseId),
				]);
				const courseById = new Map(
					courses.map((course) => [course.id, course]),
				);
				const terms = searchText(query).split(" ").filter(Boolean);
				const results = [
					...(courseId === undefined
						? courses.map((course) => ({
								kind: "course",
								courseId: course.id,
								title: course.name,
								courseName: course.name,
								body: course.syllabus_body ?? "",
							}))
						: []),
					...assignments.map((assignment) => ({
						kind: "assignment",
						courseId: assignment.course_id,
						resourceId: String(assignment.id),
						title: assignment.name,
						courseName: courseById.get(assignment.course_id)?.name,
						body: assignment.description ?? "",
						htmlUrl: assignment.html_url ?? null,
					})),
					...resources.map((resource) => ({
						kind: resource.resourceType,
						courseId: resource.course_id,
						resourceId: resource.canvasResourceId,
						title: resource.title,
						courseName: courseById.get(resource.course_id)?.name,
						body: resource.body ?? "",
						htmlUrl: resource.html_url ?? null,
					})),
				]
					.map((result) => ({
						...result,
						searchValue: searchText(
							`${result.title} ${result.courseName ?? ""} ${result.body}`,
						),
					}))
					.filter((result) =>
						terms.every((term) => result.searchValue.includes(term)),
					)
					.slice(0, limit)
					.map(({ body, searchValue: _searchValue, ...result }) => ({
						...result,
						snippet: contentSnippet(body),
					}));
				const health = await accountHealth(userId, resolvedAccountId);
				return success(
					{ account: health, query, results, acquisition },
					`Found ${results.length} cached Canvas search result${results.length === 1 ? "" : "s"}.`,
				);
			}),
	);

	server.registerTool(
		"canvas_refresh",
		{
			title: "Refresh Canvas data",
			description:
				"Explicitly request fresh Canvas data. Refreshes all connected accounts by default, using direct API credentials when available and the extension otherwise. Normal list calls do not refresh unless refresh=true.",
			inputSchema: {
				accountId: z.string().optional(),
				accountIds: z.array(z.string()).max(50).optional(),
			},
			annotations: { readOnlyHint: false, idempotentHint: true },
		},
		async ({ accountId, accountIds }) =>
			runTool(async () => {
				const selected = await selectAccountHealth(
					userId,
					combineAccountIds(accountId, accountIds),
				);
				const refreshes = await Promise.all(
					selected.map(async (health) => {
						try {
							return {
								accountId: health.account.id,
								ok: true,
								acquisition: await ensureCanvasIdentityFresh({
									userId,
									canvasIdentityId: health.account.id,
									force: true,
								}),
							};
						} catch (error) {
							return {
								accountId: health.account.id,
								ok: false,
								error: toolError(error),
							};
						}
					}),
				);
				const accounts = await selectAccountHealth(
					userId,
					selected.map((health) => health.account.id),
				);
				return success(
					{ accounts, refreshes },
					`Requested refresh for ${selected.length} Canvas account${selected.length === 1 ? "" : "s"}.`,
				);
			}),
	);

	return server;
}

async function acquireAccount(
	userId: string,
	accountId: string,
	refresh: boolean,
) {
	return refresh
		? ensureCanvasIdentityFresh({ userId, canvasIdentityId: accountId })
		: {
				mode: "cache" as const,
				freshness: await getCanvasFreshness(userId, accountId),
			};
}

async function loadAssignmentSources(
	userId: string,
	health: Awaited<ReturnType<typeof listCanvasAccountHealth>>,
): Promise<CanvasMcpAssignmentSource[]> {
	const repository = new PostgresCanvasRepository(db, userId);
	return Promise.all(
		health.map(async ({ account }) => ({
			account,
			courses: await repository.listCourses(account.id),
			assignments: await repository.listAssignments(account.id),
		})),
	);
}

async function accountHealth(userId: string, accountId: string) {
	const health = await selectAccountHealth(userId, [accountId]);
	const account = health[0];
	if (!account) throw new Error("Canvas account not found.");
	return account;
}

async function selectAccountHealth(userId: string, requested?: string[]) {
	const health = await listCanvasAccountHealth(userId);
	if (!requested) return health;
	const requestedIds = [...new Set(requested)];
	const availableIds = new Set(health.map((account) => account.account.id));
	const missing = requestedIds.filter((id) => !availableIds.has(id));
	if (missing.length > 0) {
		throw new Error(`Canvas account not found: ${missing.join(", ")}.`);
	}
	return health.filter((account) => requestedIds.includes(account.account.id));
}

async function resolveAccountId(userId: string, requested?: string) {
	const accounts = await listOwnedCanvasIdentities(userId);
	if (requested) {
		if (!accounts.some((account) => account.id === requested)) {
			throw new Error("Canvas account not found.");
		}
		return requested;
	}
	if (accounts.length === 1 && accounts[0]) return accounts[0].id;
	if (accounts.length === 0)
		throw new Error("No Canvas accounts are connected.");
	throw new Error(
		"Multiple Canvas accounts are connected. Provide accountId from canvas_list_accounts, or use canvas_list_upcoming_assignments to query all accounts.",
	);
}

function combineCourseIds(courseId?: number, courseIds?: number[]) {
	if (courseId === undefined) return courseIds;
	return [...new Set([courseId, ...(courseIds ?? [])])];
}

function combineAccountIds(accountId?: string, accountIds?: string[]) {
	if (!accountId) return accountIds;
	return [...new Set([accountId, ...(accountIds ?? [])])];
}

function validateTimezone(timezone: string) {
	if (!isValidTimeZone(timezone)) {
		throw new Error(
			`timezone must be a valid IANA timezone; received ${timezone}.`,
		);
	}
}

function searchText(value: string) {
	return value
		.replace(/<[^>]*>/g, " ")
		.toLocaleLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

function contentSnippet(value: string) {
	const text = value
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > 240 ? `${text.slice(0, 237)}...` : text || null;
}

async function runTool(
	callback: () => Promise<ReturnType<typeof success>>,
): Promise<ReturnType<typeof success> | ReturnType<typeof failure>> {
	try {
		return await callback();
	} catch (error) {
		return failure(toolError(error));
	}
}

function success(value: Record<string, unknown>, summary: string) {
	return {
		content: [{ type: "text" as const, text: summary }],
		structuredContent: { ok: true, ...value },
	};
}

function failure(error: ReturnType<typeof toolError>) {
	return {
		isError: true,
		content: [{ type: "text" as const, text: error.message }],
		structuredContent: { ok: false, error },
	};
}

function toolError(error: unknown) {
	const message =
		error instanceof Error ? error.message : "Canvas data is unavailable.";
	let code = "CANVAS_UNAVAILABLE";
	if (error instanceof CanvasSessionRequiredError) {
		code = "EXTENSION_SESSION_REQUIRED";
	} else if (/not found/i.test(message)) {
		code = "NOT_FOUND";
	} else if (/multiple Canvas accounts/i.test(message)) {
		code = "ACCOUNT_ID_REQUIRED";
	} else if (/cursor/i.test(message)) {
		code = "INVALID_CURSOR";
	} else if (/dueAfter|dueBefore/i.test(message)) {
		code = "INVALID_DATE_RANGE";
	} else if (/timezone/i.test(message)) {
		code = "INVALID_TIMEZONE";
	}
	return { code, message, retryable: code === "CANVAS_UNAVAILABLE" };
}
