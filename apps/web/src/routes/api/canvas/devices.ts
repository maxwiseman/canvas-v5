import { auth } from "@canvas-v5/auth";
import { db } from "@canvas-v5/db";
import { canvasDevice } from "@canvas-v5/db/schema/canvas";
import { env } from "@canvas-v5/env/server";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const Route = createFileRoute("/api/canvas/devices")({
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
				return Response.json({
					vapidPublicKey: env.CANVAS_SYNC_VAPID_PUBLIC_KEY ?? null,
				});
			},
			POST: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json(
						{ error: "Authentication required" },
						{ status: 401 },
					);
				}
				const input = deviceInput.parse(await request.json());
				const [existingDevice] = await db
					.select({ userId: canvasDevice.userId })
					.from(canvasDevice)
					.where(eq(canvasDevice.id, input.id));
				if (existingDevice && existingDevice.userId !== session.user.id) {
					return Response.json({ error: "Device conflict" }, { status: 409 });
				}
				if (existingDevice) {
					await db
						.update(canvasDevice)
						.set({
							label: input.label,
							pushSubscription: input.pushSubscription,
							pushEnabled: Boolean(input.pushSubscription),
							lastSeenAt: new Date(),
						})
						.where(
							and(
								eq(canvasDevice.id, input.id),
								eq(canvasDevice.userId, session.user.id),
							),
						);
				} else {
					await db
						.insert(canvasDevice)
						.values({
							id: input.id,
							userId: session.user.id,
							label: input.label,
							pushSubscription: input.pushSubscription,
							pushEnabled: Boolean(input.pushSubscription),
							lastSeenAt: new Date(),
						})
						.onConflictDoNothing();
				}
				const [device] = await db
					.select()
					.from(canvasDevice)
					.where(
						and(
							eq(canvasDevice.id, input.id),
							eq(canvasDevice.userId, session.user.id),
						),
					);
				if (!device)
					return Response.json(
						{ error: "Device save failed" },
						{ status: 500 },
					);
				return Response.json(device);
			},
		},
	},
});

const deviceInput = z.object({
	id: z.string().min(1),
	label: z.string().min(1).optional(),
	pushSubscription: z
		.object({
			endpoint: z.string().url(),
			expirationTime: z.number().nullable().optional(),
			keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
		})
		.nullable()
		.optional(),
});
