import { randomUUID } from "node:crypto";
import { auth } from "@canvas-v5/auth";
import { db } from "@canvas-v5/db";
import { canvasAssignmentComment } from "@canvas-v5/db/schema/canvas";
import { createFileRoute } from "@tanstack/react-router";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

export const Route = createFileRoute("/api/canvas/assignment-comments")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json(
						{ error: "Authentication required" },
						{ status: 401 },
					);
				}

				const url = new URL(request.url);
				const parsed = assignmentTarget.safeParse({
					canvasDomain: url.searchParams.get("canvasDomain"),
					canvasCourseId: url.searchParams.get("canvasCourseId"),
					canvasAssignmentId: url.searchParams.get("canvasAssignmentId"),
				});
				if (!parsed.success) {
					return Response.json(
						{ error: "Invalid assignment target" },
						{ status: 400 },
					);
				}

				const target = normalizeTarget(parsed.data);
				const rows = await db
					.select()
					.from(canvasAssignmentComment)
					.where(targetFilter(session.user.id, target))
					.orderBy(asc(canvasAssignmentComment.createdAt));

				return Response.json(rows.map(toApiComment));
			},
			POST: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json(
						{ error: "Authentication required" },
						{ status: 401 },
					);
				}

				const parsed = assignmentCommentInput.safeParse(await request.json());
				if (!parsed.success) {
					return Response.json(
						{ error: "Invalid assignment comment" },
						{ status: 400 },
					);
				}

				const target = normalizeTarget(parsed.data);
				const [row] = await db
					.insert(canvasAssignmentComment)
					.values({
						id: randomUUID(),
						userId: session.user.id,
						...target,
						content: parsed.data.content.trim(),
					})
					.returning();
				if (!row) {
					return Response.json(
						{ error: "Comment could not be saved" },
						{ status: 500 },
					);
				}

				return Response.json(toApiComment(row), { status: 201 });
			},
		},
	},
});

const assignmentTarget = z.object({
	canvasDomain: z
		.string()
		.trim()
		.min(1)
		.max(253)
		.regex(/^[a-z0-9.-]+$/i),
	canvasCourseId: z.coerce.number().int().positive(),
	canvasAssignmentId: z.coerce.number().int().positive(),
});

const assignmentCommentInput = assignmentTarget.extend({
	content: z.string().trim().min(1).max(10_000),
});

type AssignmentTarget = z.infer<typeof assignmentTarget>;

function normalizeTarget(target: AssignmentTarget) {
	return {
		canvasDomain: target.canvasDomain.toLowerCase(),
		canvasCourseId: target.canvasCourseId,
		canvasAssignmentId: target.canvasAssignmentId,
	};
}

function targetFilter(userId: string, target: AssignmentTarget) {
	return and(
		eq(canvasAssignmentComment.userId, userId),
		eq(canvasAssignmentComment.canvasDomain, target.canvasDomain),
		eq(canvasAssignmentComment.canvasCourseId, target.canvasCourseId),
		eq(canvasAssignmentComment.canvasAssignmentId, target.canvasAssignmentId),
	);
}

function toApiComment(row: typeof canvasAssignmentComment.$inferSelect) {
	return {
		id: row.id,
		canvasDomain: row.canvasDomain,
		canvasCourseId: row.canvasCourseId,
		canvasAssignmentId: row.canvasAssignmentId,
		content: row.content,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}
