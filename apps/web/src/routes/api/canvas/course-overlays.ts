import { auth } from "@canvas-v5/auth";
import type { IconId } from "@canvas-v5/canvas-core";
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
						hiddenTabIds: input.hiddenTabIds ?? [],
						updatedAt: now,
					})
					.onConflictDoUpdate({
						target: [
							canvasCourseOverlay.userId,
							canvasCourseOverlay.canvasConnectionId,
							canvasCourseOverlay.canvasCourseId,
						],
						set: {
							...(input.icon !== undefined ? { icon: input.icon } : {}),
							...(input.hiddenTabIds !== undefined
								? { hiddenTabIds: input.hiddenTabIds }
								: {}),
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

const iconIds = [
	"atom",
	"flask",
	"microscope",
	"book",
	"bookmark",
	"notebook",
	"star",
	"paintbrush",
	"palette",
	"brain",
	"brain-circuit",
	"calculator",
	"diff",
	"divide",
	"pi",
	"radical",
	"cone",
	"code",
	"binary",
	"government",
	"gavel",
	"earth",
] as const satisfies readonly IconId[];

const courseOverlayInput = z
	.object({
		canvasConnectionId: z.string().min(1),
		canvasCourseId: z.number().int(),
		icon: z.enum(iconIds).nullable().optional(),
		hiddenTabIds: z.array(z.string().min(1).max(200)).max(200).optional(),
	})
	.refine(
		(input) => input.icon !== undefined || input.hiddenTabIds !== undefined,
		"At least one overlay field is required",
	);

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
		hiddenTabIds: row.hiddenTabIds,
		updatedAt: row.updatedAt.toISOString(),
	};
}
