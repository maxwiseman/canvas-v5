import { randomUUID } from "node:crypto";
import { auth } from "@canvas-v5/auth";
import { db } from "@canvas-v5/db";
import { canvasConnection } from "@canvas-v5/db/schema/canvas";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { encryptCanvasToken } from "../../../lib/canvas-token";

export const Route = createFileRoute("/api/canvas/connections")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json([], { status: 401 });
				}

				const rows = await db
					.select()
					.from(canvasConnection)
					.where(eq(canvasConnection.userId, session.user.id));

				return Response.json(rows.map((row) => toApiConnection(row)));
			},
			POST: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json(
						{ error: "Authentication required" },
						{ status: 401 },
					);
				}

				const parsedInput = connectionInput.parse(await request.json());
				if (
					parsedInput.authMode !== "canvas-session" &&
					!parsedInput.accessToken?.trim()
				) {
					return Response.json(
						{ error: "Access token required" },
						{ status: 400 },
					);
				}

				const input = normalizeConnectionInput(parsedInput);
				const now = new Date();
				const existingConnection = await findExistingConnection(
					session.user.id,
					input.id,
				);
				const label =
					parsedInput.authMode === "canvas-session" &&
					parsedInput.connectionId &&
					existingConnection
						? existingConnection.label
						: input.label;
				const encryptedAccessToken = input.accessToken
					? encryptCanvasToken(input.accessToken)
					: undefined;
				const updateValues = {
					canvasBaseUrl: input.canvasBaseUrl,
					canvasUserId: input.canvasUserId ?? null,
					label,
					authMode: input.authMode,
					updatedAt: now,
					...(encryptedAccessToken ? { encryptedAccessToken } : {}),
				};
				const [row] = await db
					.insert(canvasConnection)
					.values({
						id: input.id,
						userId: session.user.id,
						canvasBaseUrl: input.canvasBaseUrl,
						canvasUserId: input.canvasUserId ?? null,
						label,
						authMode: input.authMode,
						encryptedAccessToken,
						updatedAt: now,
					})
					.onConflictDoUpdate({
						target: canvasConnection.id,
						set: updateValues,
					})
					.returning();

				if (!row) {
					return Response.json(
						{ error: "Connection could not be saved" },
						{ status: 500 },
					);
				}

				return Response.json(toApiConnection(row, true));
			},
		},
	},
});

const connectionInput = z.object({
	id: z.string().min(1).optional(),
	connectionId: z.string().min(1).optional(),
	label: z.string().min(1),
	canvasBaseUrl: z.string().trim().url(),
	canvasUserId: z.string().optional(),
	authMode: z.enum(["canvas-session", "api-token", "oauth"]),
	accessToken: z.string().optional(),
	isActive: z.boolean().optional(),
});

function normalizeConnectionInput(input: z.infer<typeof connectionInput>) {
	const canvasBaseUrl = new URL(input.canvasBaseUrl).origin;
	const id =
		input.connectionId ??
		input.id ??
		(input.authMode === "canvas-session" && input.canvasUserId
			? `${canvasBaseUrl}:${input.canvasUserId}:canvas-session`
			: randomUUID());

	return {
		id,
		label: input.label.trim(),
		canvasBaseUrl,
		canvasUserId: input.canvasUserId?.trim() || undefined,
		authMode: input.authMode,
		accessToken: input.accessToken?.trim() || undefined,
		isActive: input.isActive ?? true,
	};
}

async function findExistingConnection(userId: string, connectionId: string) {
	const [connection] = await db
		.select()
		.from(canvasConnection)
		.where(
			and(
				eq(canvasConnection.userId, userId),
				eq(canvasConnection.id, connectionId),
			),
		);
	return connection;
}

function toApiConnection(
	row: typeof canvasConnection.$inferSelect,
	isActive = false,
) {
	return {
		id: row.id,
		connectionId: row.id,
		label: row.label,
		canvasBaseUrl: row.canvasBaseUrl,
		canvasUserId: row.canvasUserId ?? undefined,
		authMode: row.authMode,
		isActive,
	};
}
