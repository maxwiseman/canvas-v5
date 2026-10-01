import { db, PostgresCanvasRepository } from "@canvas-v5/db";
import { user } from "@canvas-v5/db/schema/auth";
import {
	canvasAssignmentComment,
	canvasConnection,
	canvasCourseOverlay,
	canvasIdentity,
} from "@canvas-v5/db/schema/canvas";
import { env } from "@canvas-v5/env/server";
import canvasAppHtml from "@canvas-v5/mcp-app/canvas-app.html?raw";
import {
	RESOURCE_MIME_TYPE,
	registerAppResource,
	registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { readCanvasApi } from "./canvas-app-api";
import { canvasAppRequestUrl, readCanvasAppCache } from "./canvas-app-cache";
import { decryptCanvasToken } from "./canvas-token";
import { canvasToolSecurity } from "./mcp-authorization";

export const CANVAS_APP_URI = "ui://canvas-v5/app-v1.html";
const annotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
};

export function registerCanvasPluginApp(server: McpServer, userId: string) {
	registerAppTool(
		server,
		"canvas_open_app",
		{
			title: "Canvas workspace",
			description:
				"Open the full Canvas V5 interface to browse courses, assignments, modules, submissions, calendar, and inbox inside ChatGPT.",
			inputSchema: {},
			annotations,
			_meta: {
				...canvasToolSecurity(),
				ui: { resourceUri: CANVAS_APP_URI },
				"openai/outputTemplate": CANVAS_APP_URI,
				"openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
			},
		},
		async () =>
			appResult(async () => {
				const [users, connections, overlays] = await Promise.all([
					db
						.select({ id: user.id, name: user.name, email: user.email })
						.from(user)
						.where(eq(user.id, userId)),
					db
						.select()
						.from(canvasConnection)
						.where(eq(canvasConnection.userId, userId)),
					db
						.select()
						.from(canvasCourseOverlay)
						.where(eq(canvasCourseOverlay.userId, userId)),
				]);
				if (!users[0])
					throw new Error("Canvas V5 user not found. Reconnect the plugin.");
				return {
					user: users[0],
					appUrl: env.BETTER_AUTH_URL,
					accounts: connections.map((connection, index) => ({
						id: connection.id,
						connectionId: connection.id,
						canvasIdentityId: connection.canvasIdentityId ?? undefined,
						label: connection.label,
						canvasBaseUrl: connection.canvasBaseUrl,
						authMode: connection.authMode,
						canvasUserId: connection.canvasUserId ?? undefined,
						isActive: index === 0,
					})),
					courseOverlays: overlays.map(
						({
							id,
							canvasConnectionId,
							canvasCourseId,
							icon,
							hiddenTabIds,
							updatedAt,
						}) => ({
							id,
							canvasConnectionId,
							canvasCourseId,
							icon,
							hiddenTabIds,
							updatedAt: updatedAt.toISOString(),
						}),
					),
				};
			}),
	);

	registerAppTool(
		server,
		"canvas_app_read",
		{
			title: "Read Canvas workspace view",
			description:
				"Load data for the Canvas workspace UI using the connected user's account. No write operations are accepted.",
			inputSchema: {
				connectionId: z.string().min(1),
				path: z.string().startsWith("/api/v1/").max(4000),
				paginated: z.boolean().default(false),
			},
			annotations,
			_meta: { ...canvasToolSecurity(), ui: { visibility: ["app"] } },
		},
		async ({ connectionId, path, paginated }) =>
			appResult(async () => {
				const [connection] = await db
					.select()
					.from(canvasConnection)
					.where(
						and(
							eq(canvasConnection.userId, userId),
							eq(canvasConnection.id, connectionId),
						),
					);
				if (!connection) throw new Error("Canvas connection not found.");
				const url = canvasAppRequestUrl(path, connection.canvasBaseUrl);
				// Canvas conversation GETs otherwise mark messages as read.
				if (url.pathname.startsWith("/api/v1/conversations/"))
					url.searchParams.set("auto_mark_as_read", "false");
				if (
					connection.authMode !== "canvas-session" &&
					connection.encryptedAccessToken
				) {
					return readCanvasApi(
						url,
						decryptCanvasToken(connection.encryptedAccessToken),
						paginated,
					);
				}
				if (!connection.canvasIdentityId)
					throw new Error(
						"Open Canvas in your browser to sync this connection first.",
					);
				const repository = new PostgresCanvasRepository(db, userId);
				const accountId = connection.canvasIdentityId;
				const [courses, assignments, resources, calendar] = await Promise.all([
					repository.listCourses(accountId),
					repository.listAssignments(accountId),
					repository.listResources(accountId),
					repository.listCalendarEvents(accountId),
				]);
				return readCanvasAppCache(path, {
					courses,
					assignments,
					resources,
					calendar,
				});
			}),
	);

	registerAppTool(
		server,
		"canvas_app_comments",
		{
			title: "Read Canvas assignment comments",
			description:
				"Read the connected user's Canvas V5 assignment comments for the embedded workspace.",
			inputSchema: {
				canvasDomain: z
					.string()
					.regex(/^[a-z0-9.-]+$/i)
					.max(253),
				canvasCourseId: z.number().int().positive(),
				canvasAssignmentId: z.number().int().positive(),
			},
			annotations,
			_meta: { ...canvasToolSecurity(), ui: { visibility: ["app"] } },
		},
		async ({ canvasDomain, canvasCourseId, canvasAssignmentId }) =>
			appResult(async () => {
				const rows = await db
					.select({
						comment: canvasAssignmentComment,
						identity: canvasIdentity,
					})
					.from(canvasAssignmentComment)
					.innerJoin(
						canvasIdentity,
						eq(canvasAssignmentComment.canvasIdentityId, canvasIdentity.id),
					)
					.where(
						and(
							eq(canvasAssignmentComment.userId, userId),
							eq(canvasIdentity.userId, userId),
							eq(
								canvasAssignmentComment.canvasDomain,
								canvasDomain.toLowerCase(),
							),
							eq(canvasAssignmentComment.canvasCourseId, canvasCourseId),
							eq(
								canvasAssignmentComment.canvasAssignmentId,
								canvasAssignmentId,
							),
						),
					)
					.orderBy(asc(canvasAssignmentComment.createdAt));
				return rows.map(({ comment, identity }) => ({
					id: comment.id,
					canvasDomain: comment.canvasDomain,
					canvasCourseId: comment.canvasCourseId,
					canvasAssignmentId: comment.canvasAssignmentId,
					content: comment.content,
					author: {
						canvasIdentityId: identity.id,
						canvasUserId: identity.canvasUserId,
						displayName: identity.displayName ?? identity.label,
						avatarUrl: identity.avatarUrl,
					},
					createdAt: comment.createdAt.toISOString(),
					updatedAt: comment.updatedAt.toISOString(),
				}));
			}),
	);

	registerAppResource(
		server,
		"Canvas workspace",
		CANVAS_APP_URI,
		{},
		async () => {
			const connections = await db
				.select({ baseUrl: canvasConnection.canvasBaseUrl })
				.from(canvasConnection)
				.where(eq(canvasConnection.userId, userId));
			return {
				contents: [
					{
						uri: CANVAS_APP_URI,
						mimeType: RESOURCE_MIME_TYPE,
						text: canvasAppHtml,
						_meta: {
							ui: {
								prefersBorder: false,
								csp: {
									connectDomains: [],
									resourceDomains: [
										...new Set(
											connections.map(
												(connection) => new URL(connection.baseUrl).origin,
											),
										),
										"https://*.instructure.com",
										"https://*.amazonaws.com",
									],
								},
							},
							"openai/widgetDescription":
								"The full Canvas V5 course workspace. Data is loaded through the authenticated plugin connection.",
							"openai/ui": {
								preferredDisplayMode: "fullscreen",
								availableDisplayModes: ["fullscreen"],
							},
						},
					},
				],
			};
		},
	);
}

async function appResult(load: () => Promise<unknown>) {
	try {
		// UI data is not copied into the conversation/model context.
		return { content: [], _meta: { canvasApp: await load() } };
	} catch (error) {
		return {
			isError: true,
			content: [
				{
					type: "text" as const,
					text:
						error instanceof Error ? error.message : "Unable to load Canvas.",
				},
			],
		};
	}
}
