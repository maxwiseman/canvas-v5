import { db, PostgresCanvasRepository } from "@canvas-v5/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
	ensureCanvasIdentityFresh,
	getCanvasFreshness,
	listOwnedCanvasIdentities,
} from "./canvas-sync";

export function createCanvasMcpServer(userId: string) {
	const server = new McpServer({ name: "canvas-v5", version: "0.1.0" });

	server.registerTool(
		"canvas_list_accounts",
		{
			title: "List Canvas accounts",
			description: "List the Canvas accounts available to the current user.",
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async () => result({ accounts: await listOwnedCanvasIdentities(userId) }),
	);

	server.registerTool(
		"canvas_list_courses",
		{
			title: "List Canvas courses",
			description:
				"List active courses. Uses a direct Canvas credential when available and otherwise requests an extension refresh when stale.",
			inputSchema: {
				accountId: z.string().optional(),
				refresh: z.boolean().default(true),
			},
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async ({ accountId, refresh }) => {
			const resolvedAccountId = await resolveAccountId(userId, accountId);
			const acquisition = refresh
				? await ensureCanvasIdentityFresh({
						userId,
						canvasIdentityId: resolvedAccountId,
					})
				: {
						mode: "cache" as const,
						freshness: await getCanvasFreshness(userId, resolvedAccountId),
					};
			const repository = new PostgresCanvasRepository(db, userId);
			return result({
				accountId: resolvedAccountId,
				courses: await repository.listCourses(resolvedAccountId),
				acquisition,
			});
		},
	);

	server.registerTool(
		"canvas_list_assignments",
		{
			title: "List Canvas assignments",
			description:
				"List assignments, optionally for one course. Results include observation and Canvas update timestamps.",
			inputSchema: {
				accountId: z.string().optional(),
				courseId: z.number().int().optional(),
				refresh: z.boolean().default(true),
			},
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async ({ accountId, courseId, refresh }) => {
			const resolvedAccountId = await resolveAccountId(userId, accountId);
			const acquisition = refresh
				? await ensureCanvasIdentityFresh({
						userId,
						canvasIdentityId: resolvedAccountId,
					})
				: {
						mode: "cache" as const,
						freshness: await getCanvasFreshness(userId, resolvedAccountId),
					};
			const repository = new PostgresCanvasRepository(db, userId);
			return result({
				accountId: resolvedAccountId,
				assignments: await repository.listAssignments(
					resolvedAccountId,
					courseId,
				),
				acquisition,
			});
		},
	);

	server.registerTool(
		"canvas_get_assignment",
		{
			title: "Get Canvas assignment",
			description: "Get one Canvas assignment, including its full description.",
			inputSchema: {
				accountId: z.string().optional(),
				courseId: z.number().int(),
				assignmentId: z.number().int(),
				refresh: z.boolean().default(true),
			},
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async ({ accountId, courseId, assignmentId, refresh }) => {
			const resolvedAccountId = await resolveAccountId(userId, accountId);
			const acquisition = refresh
				? await ensureCanvasIdentityFresh({
						userId,
						canvasIdentityId: resolvedAccountId,
					})
				: {
						mode: "cache" as const,
						freshness: await getCanvasFreshness(userId, resolvedAccountId),
					};
			const repository = new PostgresCanvasRepository(db, userId);
			return result({
				accountId: resolvedAccountId,
				assignment: await repository.getAssignment(
					resolvedAccountId,
					courseId,
					assignmentId,
				),
				acquisition,
			});
		},
	);

	server.registerTool(
		"canvas_refresh",
		{
			title: "Refresh Canvas data",
			description:
				"Force a direct refresh when a server credential exists, or enqueue an extension sync request.",
			inputSchema: { accountId: z.string().optional() },
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async ({ accountId }) => {
			const resolvedAccountId = await resolveAccountId(userId, accountId);
			return result({
				accountId: resolvedAccountId,
				acquisition: await ensureCanvasIdentityFresh({
					userId,
					canvasIdentityId: resolvedAccountId,
					force: true,
				}),
			});
		},
	);

	return server;
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
		"Multiple Canvas accounts are connected. Provide accountId from canvas_list_accounts.",
	);
}

function result(value: Record<string, unknown>) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value) }],
		structuredContent: value,
	};
}
