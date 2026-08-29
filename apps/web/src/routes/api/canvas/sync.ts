import { auth } from "@canvas-v5/auth";
import {
	normalizeCanvasAssignment,
	normalizeCanvasCalendarEvent,
	normalizeCanvasCourse,
	normalizeCanvasResource,
} from "@canvas-v5/canvas-core";
import { db, PostgresCanvasRepository } from "@canvas-v5/db";
import { canvasIdentity, canvasSyncRequest } from "@canvas-v5/db/schema/canvas";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const Route = createFileRoute("/api/canvas/sync")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json(
						{ error: "Authentication required" },
						{ status: 401 },
					);
				}
				const input = syncInput.parse(await request.json());
				const [identity] = await db
					.select()
					.from(canvasIdentity)
					.where(
						and(
							eq(canvasIdentity.id, input.canvasIdentityId),
							eq(canvasIdentity.userId, session.user.id),
						),
					);
				if (!identity) {
					return Response.json(
						{ error: "Canvas account not found" },
						{ status: 404 },
					);
				}

				const account = {
					id: identity.id,
					baseUrl: identity.canvasBaseUrl,
					canvasUserId: identity.canvasUserId,
				};
				const observedAt = input.observedAt ?? new Date().toISOString();
				const generationId = input.generationId ?? crypto.randomUUID();
				const repository = new PostgresCanvasRepository(db, session.user.id);
				const courses = await Promise.all(
					input.courses.map((course) =>
						normalizeCanvasCourse(course, account, observedAt),
					),
				);
				const results = [
					await repository.applySnapshot({
						account,
						scope: "courses",
						generationId,
						observedAt,
						records: courses,
					}),
				];
				for (const group of input.assignments) {
					const assignments = await Promise.all(
						group.records.map((assignment) =>
							normalizeCanvasAssignment(
								assignment,
								account,
								group.courseId,
								observedAt,
							),
						),
					);
					results.push(
						await repository.applySnapshot({
							account,
							scope: "assignments",
							scopeKey: String(group.courseId),
							generationId,
							observedAt,
							records: assignments,
						}),
					);
				}
				for (const group of input.resources) {
					const resources = await Promise.all(
						group.records.map((resource) =>
							normalizeCanvasResource(
								resource,
								account,
								group.courseId,
								resource.resourceType,
								observedAt,
							),
						),
					);
					results.push(
						await repository.applySnapshot({
							account,
							scope: "resources",
							scopeKey: String(group.courseId),
							generationId,
							observedAt,
							records: resources,
						}),
					);
				}
				const calendarEvents = await Promise.all(
					input.calendarEvents.map((event) =>
						normalizeCanvasCalendarEvent(event, account, observedAt),
					),
				);
				results.push(
					await repository.applySnapshot({
						account,
						scope: "calendar",
						generationId,
						observedAt,
						records: calendarEvents,
					}),
				);

				if (input.requestId) {
					await db
						.update(canvasSyncRequest)
						.set({
							status: "complete",
							completedAt: new Date(),
							lastError: null,
						})
						.where(
							and(
								eq(canvasSyncRequest.id, input.requestId),
								eq(canvasSyncRequest.userId, session.user.id),
								eq(canvasSyncRequest.canvasIdentityId, identity.id),
							),
						);
				}
				return Response.json({ ok: true, results });
			},
		},
	},
});

const syncInput = z.object({
	canvasIdentityId: z.string().min(1),
	requestId: z.string().min(1).optional(),
	generationId: z.string().min(1).optional(),
	observedAt: z.string().datetime().optional(),
	courses: z.array(z.record(z.string(), z.unknown())),
	assignments: z.array(
		z.object({
			courseId: z.number().int(),
			records: z.array(z.record(z.string(), z.unknown())),
		}),
	),
	resources: z
		.array(
			z.object({
				courseId: z.number().int(),
				records: z.array(
					z
						.object({
							resourceType: z.enum([
								"announcement",
								"page",
								"quiz",
								"discussion",
								"discussion-entry",
								"file",
							]),
						})
						.passthrough(),
				),
			}),
		)
		.default([]),
	calendarEvents: z.array(z.record(z.string(), z.unknown())).default([]),
});
