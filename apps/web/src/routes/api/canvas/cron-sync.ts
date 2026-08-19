import { timingSafeEqual } from "node:crypto";
import { db } from "@canvas-v5/db";
import { canvasIdentity } from "@canvas-v5/db/schema/canvas";
import { env } from "@canvas-v5/env/server";
import { createFileRoute } from "@tanstack/react-router";

import { ensureCanvasIdentityFresh } from "../../../lib/canvas-sync";

export const Route = createFileRoute("/api/canvas/cron-sync")({
	server: {
		handlers: {
			GET: ({ request }) => runScheduledSync(request),
			POST: ({ request }) => runScheduledSync(request),
		},
	},
});

async function runScheduledSync(request: Request) {
	if (!isAuthorized(request)) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const identities = await db.select().from(canvasIdentity);
	const results: Array<Record<string, unknown>> = [];
	for (const identity of identities) {
		try {
			const acquisition = await ensureCanvasIdentityFresh({
				userId: identity.userId,
				canvasIdentityId: identity.id,
				force: true,
			});
			results.push({ identityId: identity.id, ok: true, acquisition });
		} catch (error) {
			results.push({
				identityId: identity.id,
				ok: false,
				error: error instanceof Error ? error.message : "Canvas sync failed.",
			});
		}
	}
	return Response.json({ processed: identities.length, results });
}

function isAuthorized(request: Request) {
	const secret = env.CANVAS_SYNC_CRON_SECRET;
	const authorization = request.headers.get("Authorization");
	if (!secret || !authorization?.startsWith("Bearer ")) return false;
	const provided = authorization.slice("Bearer ".length).trim();
	const expectedBytes = new TextEncoder().encode(secret);
	const providedBytes = new TextEncoder().encode(provided);
	return (
		expectedBytes.byteLength === providedBytes.byteLength &&
		timingSafeEqual(expectedBytes, providedBytes)
	);
}
