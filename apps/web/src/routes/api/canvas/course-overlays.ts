import { auth } from "@canvas-v5/auth";
import { db } from "@canvas-v5/db";
import {
	canvasConnection,
	canvasCourseOverlay,
} from "@canvas-v5/db/schema/canvas";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const Route = createFileRoute("/api/canvas/course-overlays")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json([], { status: 401 });
				}

				const rows = await db
					.select()
					.from(canvasCourseOverlay)
					.where(eq(canvasCourseOverlay.userId, session.user.id));

				return Response.json(rows.map(toApiOverlay));
			},
			POST: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json(
						{ error: "Authentication required" },
						{ status: 401 },
					);
				}

				const input = courseOverlayInput.parse(await request.json());
				const connection = await findConnectionForUser(
					session.user.id,
					input.canvasConnectionId,
				);
				if (!connection) {
					return Response.json(
						{ error: "Canvas connection not found" },
						{ status: 404 },
					);
				}

				const id = `${session.user.id}:${input.canvasConnectionId}:${input.canvasCourseId}`;
				const now = new Date();

				const [row] = await db
					.insert(canvasCourseOverlay)
					.values({
						id,
						userId: session.user.id,
						canvasConnectionId: input.canvasConnectionId,
						canvasCourseId: input.canvasCourseId,
						icon: input.icon ?? null,
						updatedAt: now,
					})
					.onConflictDoUpdate({
						target: [
							canvasCourseOverlay.userId,
							canvasCourseOverlay.canvasConnectionId,
							canvasCourseOverlay.canvasCourseId,
						],
						set: {
							icon: input.icon ?? null,
							updatedAt: now,
						},
					})
					.returning();

				if (!row) {
					const [fallbackRow] = await db
						.select()
						.from(canvasCourseOverlay)
						.where(
							and(
								eq(canvasCourseOverlay.userId, session.user.id),
								eq(
									canvasCourseOverlay.canvasConnectionId,
									input.canvasConnectionId,
								),
								eq(canvasCourseOverlay.canvasCourseId, input.canvasCourseId),
							),
						);
					return Response.json(fallbackRow ? toApiOverlay(fallbackRow) : null);
				}

				return Response.json(toApiOverlay(row));
			},
		},
	},
});

const courseOverlayInput = z.object({
	canvasConnectionId: z.string().min(1),
	canvasCourseId: z.number().int(),
	icon: z.string().nullable().optional(),
});

async function findConnectionForUser(userId: string, connectionId: string) {
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

function toApiOverlay(row: typeof canvasCourseOverlay.$inferSelect) {
	return {
		id: row.id,
		canvasConnectionId: row.canvasConnectionId,
		canvasCourseId: row.canvasCourseId,
		icon: row.icon,
		updatedAt: row.updatedAt.toISOString(),
	};
}
