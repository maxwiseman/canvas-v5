import { auth } from "@canvas-v5/auth";
import { db } from "@canvas-v5/db";
import {
	canvasDevice,
	canvasIdentity,
	canvasSyncRequest,
} from "@canvas-v5/db/schema/canvas";
import { createFileRoute } from "@tanstack/react-router";
import { and, asc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";

export const Route = createFileRoute("/api/canvas/sync-jobs")({
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
				const input = jobUpdateInput.parse(await request.json());
				const [updated] = await db
					.update(canvasSyncRequest)
					.set({
						status: input.status,
						lastError: input.error ?? null,
						completedAt: input.status === "error" ? new Date() : null,
						leaseExpiresAt: null,
					})
					.where(
						and(
							eq(canvasSyncRequest.id, input.jobId),
							eq(canvasSyncRequest.userId, session.user.id),
							eq(canvasSyncRequest.claimedByDeviceId, input.deviceId),
						),
					)
					.returning();
				return updated
					? Response.json(updated)
					: Response.json({ error: "Sync job not found" }, { status: 404 });
			},
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json(
						{ error: "Authentication required" },
						{ status: 401 },
					);
				}
				const deviceId = new URL(request.url).searchParams.get("deviceId");
				if (!deviceId) {
					return Response.json(
						{ error: "deviceId is required" },
						{ status: 400 },
					);
				}
				const [device] = await db
					.select()
					.from(canvasDevice)
					.where(
						and(
							eq(canvasDevice.id, deviceId),
							eq(canvasDevice.userId, session.user.id),
						),
					);
				if (!device) {
					return Response.json({ error: "Device not found" }, { status: 404 });
				}
				const [pending] = await db
					.select()
					.from(canvasSyncRequest)
					.where(
						and(
							eq(canvasSyncRequest.userId, session.user.id),
							or(
								eq(canvasSyncRequest.status, "pending"),
								and(
									eq(canvasSyncRequest.status, "claimed"),
									lt(canvasSyncRequest.leaseExpiresAt, new Date()),
								),
							),
						),
					)
					.orderBy(asc(canvasSyncRequest.requestedAt));
				if (!pending) return Response.json({ job: null });

				const [claimed] = await db
					.update(canvasSyncRequest)
					.set({
						status: "claimed",
						claimedByDeviceId: deviceId,
						leaseExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
					})
					.where(
						and(
							eq(canvasSyncRequest.id, pending.id),
							or(
								eq(canvasSyncRequest.status, "pending"),
								and(
									eq(canvasSyncRequest.status, "claimed"),
									lt(canvasSyncRequest.leaseExpiresAt, new Date()),
								),
							),
						),
					)
					.returning();
				if (!claimed) return Response.json({ job: null });
				const [identity] = await db
					.select()
					.from(canvasIdentity)
					.where(
						and(
							eq(canvasIdentity.id, claimed.canvasIdentityId),
							eq(canvasIdentity.userId, session.user.id),
						),
					);
				return Response.json({
					job: identity ? { ...claimed, identity } : null,
				});
			},
		},
	},
});

const jobUpdateInput = z.object({
	jobId: z.string().min(1),
	deviceId: z.string().min(1),
	status: z.enum(["pending", "error"]),
	error: z.string().max(2_000).optional(),
});
