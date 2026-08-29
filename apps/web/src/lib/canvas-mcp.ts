import { db, PostgresCanvasRepository } from "@canvas-v5/db";
import assignmentWidgetHtml from "@canvas-v5/mcp-app/assignment-widget.html?raw";
import {
	RESOURCE_MIME_TYPE,
	registerAppResource,
	registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
	assignmentDetail,
	type CanvasMcpAssignmentSource,
	type CanvasMcpPageSource,
	isValidTimeZone,
	listCompactAssignments,
	listCompactPages,
	pageDetail,
	resourceDetail,
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
const ASSIGNMENT_WIDGET_URI = "ui://canvas-v5/upcoming-assignments-v4.html";
const ASSIGNMENT_PREVIEW_URI = "ui://canvas-v5/assignment-preview-v1.html";
const RESOURCE_PREVIEW_URI = "ui://canvas-v5/course-resource-preview-v1.html";
const CALENDAR_WIDGET_URI = "ui://canvas-v5/calendar-v2.html";
const timezoneSchema = z
	.string()
	.default("UTC")
	.describe("IANA timezone such as America/New_York. Defaults to UTC.");
const paginationSchema = {
	limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
	cursor: z.string().optional(),
};

const upcomingInputSchema = z.object({
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
});
const upcomingDisplayInputSchema = upcomingInputSchema.omit({ refresh: true });

interface CanvasMcpContext {
	userId: string;
	scopes: string[];
}

export function createCanvasMcpServer(context: string | CanvasMcpContext) {
	const { userId, scopes } =
		typeof context === "string"
			? { userId: context, scopes: ["canvas:read", "canvas:refresh"] }
			: context;
	const server = new McpServer({ name: "canvas-v5", version: "0.4.0" });
	const readAnnotations = {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	};
	const refreshableAnnotations = {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	};

	server.registerTool(
		"canvas_list_accounts",
		{
			title: "List Canvas accounts and health",
			description:
				"List every connected Canvas account with sync health. Use this to distinguish an empty account from one that is refreshing, unavailable, or needs reauthentication.",
			annotations: readAnnotations,
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
			annotations: refreshableAnnotations,
		},
		async ({ accountId, refresh }) =>
			runTool(async () => {
				assertRefreshScope(scopes, refresh);
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
			annotations: refreshableAnnotations,
		},
		async (input) =>
			runTool(async () => {
				assertRefreshScope(scopes, input.refresh);
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
			inputSchema: upcomingInputSchema.shape,
			annotations: refreshableAnnotations,
		},
		async (input) =>
			runTool(async () => {
				assertRefreshScope(scopes, input.refresh);
				const result = await listUpcomingAssignments(userId, input);
				return success(
					result,
					`Returned ${result.assignments.length} upcoming incomplete assignment${result.assignments.length === 1 ? "" : "s"}.`,
				);
			}),
	);

	registerAppTool(
		server,
		"canvas_show_upcoming_assignments",
		{
			title: "Show upcoming Canvas assignments",
			description:
				"Display a fast, interactive, date-grouped view of cached upcoming Canvas assignments. Use this when a visual assignment overview would help the user review or open their work. To fetch newer Canvas data, call canvas_refresh first and then call this tool.",
			inputSchema: upcomingDisplayInputSchema.shape,
			annotations: readAnnotations,
			_meta: {
				ui: { resourceUri: ASSIGNMENT_WIDGET_URI },
				"openai/outputTemplate": ASSIGNMENT_WIDGET_URI,
				"openai/toolInvocation/invoking": "Loading Canvas assignments…",
				"openai/toolInvocation/invoked": "Canvas assignments ready",
			},
		},
		async (input) =>
			runTool(async () => {
				const result = await listUpcomingAssignments(userId, {
					...input,
					refresh: false,
				});
				return success(
					result,
					`Displayed ${result.assignments.length} upcoming Canvas assignment${result.assignments.length === 1 ? "" : "s"}.`,
				);
			}),
	);

	registerAppTool(
		server,
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
			annotations: refreshableAnnotations,
			_meta: {
				ui: { resourceUri: ASSIGNMENT_PREVIEW_URI },
				"openai/outputTemplate": ASSIGNMENT_PREVIEW_URI,
				"openai/toolInvocation/invoking": "Loading Canvas assignment…",
				"openai/toolInvocation/invoked": "Canvas assignment ready",
			},
		},
		async ({ accountId, courseId, assignmentId, refresh }) =>
			runTool(async () => {
				assertRefreshScope(scopes, refresh);
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
		"canvas_list_pages",
		{
			title: "List Canvas pages",
			description:
				"Browse compact Canvas Page summaries for one account. Results include page URL slugs, course details, Canvas links, and cache freshness but omit page bodies; use canvas_get_page for full content. Cached read by default.",
			inputSchema: {
				accountId: z.string().optional(),
				courseId: z.number().int().optional(),
				courseIds: z.array(z.number().int()).max(100).optional(),
				refresh: z.boolean().default(false),
				...paginationSchema,
			},
			annotations: refreshableAnnotations,
		},
		async (input) =>
			runTool(async () => {
				assertRefreshScope(scopes, input.refresh);
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
				const sources = await loadPageSources(userId, [health]);
				const page = listCompactPages(sources, {
					accountIds: [resolvedAccountId],
					courseIds: combineCourseIds(input.courseId, input.courseIds),
					limit: input.limit,
					cursor: input.cursor,
				});
				return success(
					{ account: health, ...page, acquisition },
					`Returned ${page.pages.length} compact Canvas Page summar${page.pages.length === 1 ? "y" : "ies"}.`,
				);
			}),
	);

	registerAppTool(
		server,
		"canvas_get_page",
		{
			title: "Get Canvas page details",
			description:
				"Get one Canvas Page's full cached content after identifying it with canvas_list_pages or canvas_search.",
			inputSchema: {
				accountId: z.string().optional(),
				courseId: z.number().int(),
				pageUrl: z.string().min(1),
				refresh: z.boolean().default(false),
			},
			annotations: refreshableAnnotations,
			_meta: {
				ui: { resourceUri: RESOURCE_PREVIEW_URI },
				"openai/outputTemplate": RESOURCE_PREVIEW_URI,
				"openai/toolInvocation/invoking": "Loading Canvas page…",
				"openai/toolInvocation/invoked": "Canvas page ready",
			},
		},
		async ({ accountId, courseId, pageUrl, refresh }) =>
			runTool(async () => {
				assertRefreshScope(scopes, refresh);
				const resolvedAccountId = await resolveAccountId(userId, accountId);
				const acquisition = await acquireAccount(
					userId,
					resolvedAccountId,
					refresh,
				);
				const repository = new PostgresCanvasRepository(db, userId);
				const [courses, resources] = await Promise.all([
					repository.listCourses(resolvedAccountId),
					repository.listResources(resolvedAccountId, courseId),
				]);
				const page = resources.find(
					(resource) =>
						resource.resourceType === "page" &&
						resource.canvasResourceId === pageUrl,
				);
				if (!page) throw new Error("Canvas page not found.");
				const course = courses.find((candidate) => candidate.id === courseId);
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
						page: pageDetail(page),
						acquisition,
					},
					`Returned details for ${page.title}.`,
				);
			}),
	);

	registerAppTool(
		server,
		"canvas_get_course_resource",
		{
			title: "Get Canvas course resource details",
			description:
				"Preview one cached Canvas announcement, page, quiz, discussion, discussion entry, or file after identifying it with canvas_search. Use the exact resourceType and resourceId returned by search.",
			inputSchema: {
				accountId: z.string().optional(),
				courseId: z.number().int(),
				resourceType: z.enum([
					"announcement",
					"page",
					"quiz",
					"discussion",
					"discussion-entry",
					"file",
				]),
				resourceId: z.string().min(1),
				refresh: z.boolean().default(false),
			},
			annotations: refreshableAnnotations,
			_meta: {
				ui: { resourceUri: RESOURCE_PREVIEW_URI },
				"openai/outputTemplate": RESOURCE_PREVIEW_URI,
				"openai/toolInvocation/invoking": "Loading Canvas resource…",
				"openai/toolInvocation/invoked": "Canvas resource ready",
			},
		},
		async ({ accountId, courseId, resourceType, resourceId, refresh }) =>
			runTool(async () => {
				assertRefreshScope(scopes, refresh);
				const resolvedAccountId = await resolveAccountId(userId, accountId);
				const acquisition = await acquireAccount(
					userId,
					resolvedAccountId,
					refresh,
				);
				const repository = new PostgresCanvasRepository(db, userId);
				const [courses, resources] = await Promise.all([
					repository.listCourses(resolvedAccountId),
					repository.listResources(resolvedAccountId, courseId),
				]);
				const resource = resources.find(
					(candidate) =>
						candidate.resourceType === resourceType &&
						candidate.canvasResourceId === resourceId,
				);
				if (!resource) throw new Error("Canvas course resource not found.");
				const course = courses.find((candidate) => candidate.id === courseId);
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
						resource: resourceDetail(resource),
						acquisition,
					},
					`Returned details for ${resource.title}.`,
				);
			}),
	);

	registerAppTool(
		server,
		"canvas_show_calendar",
		{
			title: "Show Canvas calendar",
			description:
				"Display a compact calendar of cached Canvas events and assignment due dates. Defaults to the current month.",
			inputSchema: {
				accountIds: z.array(z.string()).max(50).optional(),
				courseIds: z.array(z.number().int()).max(100).optional(),
				start: z.string().datetime({ offset: true }).optional(),
				end: z.string().datetime({ offset: true }).optional(),
				timezone: timezoneSchema,
			},
			annotations: readAnnotations,
			_meta: {
				ui: { resourceUri: CALENDAR_WIDGET_URI },
				"openai/outputTemplate": CALENDAR_WIDGET_URI,
				"openai/toolInvocation/invoking": "Loading Canvas calendar…",
				"openai/toolInvocation/invoked": "Canvas calendar ready",
			},
		},
		async (input) =>
			runTool(async () => {
				validateTimezone(input.timezone);
				const range = calendarRange(input.start, input.end);
				const selected = await selectAccountHealth(userId, input.accountIds);
				const [sources, events] = await Promise.all([
					loadAssignmentSources(userId, selected),
					loadCalendarEvents(userId, selected, range, input.courseIds),
				]);
				const page = listCompactAssignments(sources, {
					accountIds: selected.map((health) => health.account.id),
					courseIds: input.courseIds,
					dueAfter: range.start,
					dueBefore: range.end,
					includeUndated: false,
					includeCompleted: true,
					includeOverdue: false,
					limit: MAX_PAGE_SIZE,
					timezone: input.timezone,
				});
				return success(
					{
						accounts: selected,
						assignments: page.assignments,
						events,
						pageInfo: page.pageInfo,
						view: {
							kind: "calendar",
							timezone: input.timezone,
							start: range.start,
							end: range.end,
						},
					},
					`Displayed ${page.assignments.length + events.length} Canvas calendar item${page.assignments.length + events.length === 1 ? "" : "s"}.`,
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
			annotations: refreshableAnnotations,
		},
		async ({ query, accountId, courseId, refresh, limit }) =>
			runTool(async () => {
				assertRefreshScope(scopes, refresh);
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
			annotations: refreshableAnnotations,
		},
		async ({ accountId, accountIds }) =>
			runTool(async () => {
				assertRefreshScope(scopes, true);
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

	registerAppResource(
		server,
		"Canvas V5 upcoming assignments",
		ASSIGNMENT_WIDGET_URI,
		{
			description: "Interactive date-grouped Canvas assignment overview.",
			mimeType: RESOURCE_MIME_TYPE,
		},
		async () => ({
			contents: [
				{
					uri: ASSIGNMENT_WIDGET_URI,
					mimeType: RESOURCE_MIME_TYPE,
					text: assignmentWidgetHtml,
					_meta: {
						ui: {
							prefersBorder: true,
							csp: { connectDomains: [], resourceDomains: [] },
						},
						"openai/widgetDescription":
							"An interactive Canvas V5 overview grouped by due date, with refresh, pagination, and links to assignments.",
						"openai/widgetPrefersBorder": true,
					},
				},
			],
		}),
	);

	for (const resource of [
		{
			name: "Canvas V5 assignment preview",
			uri: ASSIGNMENT_PREVIEW_URI,
			description: "Focused Canvas assignment preview.",
			widgetDescription:
				"A focused Canvas V5 assignment preview with due date, submission details, assignment content, and an Open in Canvas action.",
		},
		{
			name: "Canvas V5 course resource preview",
			uri: RESOURCE_PREVIEW_URI,
			description: "Focused Canvas course-resource preview.",
			widgetDescription:
				"A focused Canvas V5 preview for pages, quizzes, announcements, discussions, posts, and files.",
		},
		{
			name: "Canvas V5 calendar",
			uri: CALENDAR_WIDGET_URI,
			description: "Compact Canvas calendar.",
			widgetDescription:
				"A compact Canvas V5 month calendar with assignment due dates and a selected-day agenda.",
		},
	] as const) {
		registerAppResource(
			server,
			resource.name,
			resource.uri,
			{
				description: resource.description,
				mimeType: RESOURCE_MIME_TYPE,
			},
			async () => ({
				contents: [
					{
						uri: resource.uri,
						mimeType: RESOURCE_MIME_TYPE,
						text: assignmentWidgetHtml,
						_meta: {
							ui: {
								prefersBorder: true,
								csp: { connectDomains: [], resourceDomains: [] },
							},
							"openai/widgetDescription": resource.widgetDescription,
							"openai/widgetPrefersBorder": true,
						},
					},
				],
			}),
		);
	}

	return server;
}

function calendarRange(start?: string, end?: string) {
	const now = new Date();
	const rangeStart = start
		? new Date(start)
		: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const rangeEnd = end
		? new Date(end)
		: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
	if (
		!Number.isFinite(rangeStart.getTime()) ||
		!Number.isFinite(rangeEnd.getTime())
	) {
		throw new Error("Calendar start and end must be valid dates.");
	}
	if (rangeStart >= rangeEnd) {
		throw new Error("Calendar start must be before end.");
	}
	return { start: rangeStart.toISOString(), end: rangeEnd.toISOString() };
}

async function listUpcomingAssignments(
	userId: string,
	input: z.infer<typeof upcomingInputSchema>,
) {
	validateTimezone(input.timezone);
	const selected = await selectAccountHealth(userId, input.accountIds);
	const acquisition = await Promise.all(
		selected.map((health) =>
			acquireAccount(userId, health.account.id, input.refresh),
		),
	);
	const accounts = await selectAccountHealth(
		userId,
		selected.map((health) => health.account.id),
	);
	const sources = await loadAssignmentSources(userId, accounts);
	const now = new Date();
	const dueAfter = input.dueAfter ?? now.toISOString();
	const dueBefore =
		input.dueBefore ??
		new Date(
			now.getTime() + DEFAULT_UPCOMING_DAYS * 24 * 60 * 60 * 1000,
		).toISOString();
	const page = listCompactAssignments(sources, {
		accountIds: accounts.map((health) => health.account.id),
		courseIds: input.courseIds,
		dueAfter,
		dueBefore,
		includeUndated: input.includeUndated,
		includeCompleted: input.includeCompleted,
		includeOverdue: input.includeOverdue,
		limit: input.limit,
		cursor: input.cursor,
		timezone: input.timezone,
	});
	return {
		accounts,
		...page,
		acquisition,
		view: {
			timezone: input.timezone,
			filters: {
				accountIds: input.accountIds,
				courseIds: input.courseIds,
				dueAfter,
				dueBefore,
				includeUndated: input.includeUndated,
				includeCompleted: input.includeCompleted,
				includeOverdue: input.includeOverdue,
				limit: input.limit,
			},
		},
	};
}

function assertRefreshScope(scopes: string[], refresh: boolean) {
	if (refresh && !scopes.includes("canvas:refresh")) {
		throw new Error(
			"The canvas:refresh permission is required to refresh Canvas data.",
		);
	}
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

async function loadPageSources(
	userId: string,
	health: Awaited<ReturnType<typeof listCanvasAccountHealth>>,
): Promise<CanvasMcpPageSource[]> {
	const repository = new PostgresCanvasRepository(db, userId);
	return Promise.all(
		health.map(async ({ account }) => ({
			account,
			courses: await repository.listCourses(account.id),
			resources: await repository.listResources(account.id),
		})),
	);
}

async function loadCalendarEvents(
	userId: string,
	health: Awaited<ReturnType<typeof listCanvasAccountHealth>>,
	range: { start: string; end: string },
	courseIds?: number[],
) {
	const repository = new PostgresCanvasRepository(db, userId);
	const selectedCourses = courseIds ? new Set(courseIds) : null;
	const start = new Date(range.start);
	const end = new Date(range.end);
	const groups = await Promise.all(
		health.map(async ({ account }) => {
			const [courses, events] = await Promise.all([
				repository.listCourses(account.id),
				repository.listCalendarEvents(account.id),
			]);
			const courseById = new Map(courses.map((course) => [course.id, course]));
			return events.flatMap((event) => {
				const courseId = calendarCourseId(event.context_code);
				if (selectedCourses && (!courseId || !selectedCourses.has(courseId))) {
					return [];
				}
				const startsAt = event.all_day_date ?? event.start_at;
				if (!startsAt) return [];
				const eventStart = new Date(startsAt);
				if (
					!Number.isFinite(eventStart.getTime()) ||
					eventStart < start ||
					eventStart >= end
				) {
					return [];
				}
				const course = courseId ? courseById.get(courseId) : undefined;
				return [
					{
						id: event.id,
						title: event.title,
						startAt: event.start_at ?? null,
						endAt: event.end_at ?? null,
						allDay: event.all_day ?? false,
						allDayDate: event.all_day_date ?? null,
						contextCode: event.context_code ?? null,
						contextName: course?.name ?? event.context_name ?? account.label,
						htmlUrl: event.html_url ?? null,
						account: { id: account.id, label: account.label },
						course: course
							? {
									id: course.id,
									name: course.name,
									code: course.course_code ?? null,
								}
							: null,
					},
				];
			});
		}),
	);
	return groups
		.flat()
		.sort((left, right) =>
			(left.allDayDate ?? left.startAt ?? "").localeCompare(
				right.allDayDate ?? right.startAt ?? "",
			),
		);
}

function calendarCourseId(contextCode?: string) {
	const match = contextCode?.match(/^course_(\d+)$/);
	if (!match?.[1]) return undefined;
	const courseId = Number(match[1]);
	return Number.isSafeInteger(courseId) ? courseId : undefined;
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
