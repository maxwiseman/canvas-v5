import { randomBytes, randomUUID } from "node:crypto";
import { auth } from "@canvas-v5/auth";
import { db } from "@canvas-v5/db";
import { canvasMcpToken } from "@canvas-v5/db/schema/canvas";
import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { hashMcpToken } from "../../../lib/mcp-token";

export const Route = createFileRoute("/api/canvas/mcp-tokens")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) return unauthorized();
				const tokens = await db
					.select({
						id: canvasMcpToken.id,
						name: canvasMcpToken.name,
						createdAt: canvasMcpToken.createdAt,
						lastUsedAt: canvasMcpToken.lastUsedAt,
					})
					.from(canvasMcpToken)
					.where(
						and(
							eq(canvasMcpToken.userId, session.user.id),
							isNull(canvasMcpToken.revokedAt),
						),
					)
					.orderBy(desc(canvasMcpToken.createdAt));
				return Response.json(tokens);
			},
			POST: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) return unauthorized();
				if (!isSameOrigin(request)) return forbidden();
				const input = tokenInput.parse(await request.json());
				const token = `cv5_${randomBytes(32).toString("base64url")}`;
				const [record] = await db
					.insert(canvasMcpToken)
					.values({
						id: randomUUID(),
						userId: session.user.id,
						name: input.name,
						tokenHash: hashMcpToken(token),
					})
					.returning({
						id: canvasMcpToken.id,
						name: canvasMcpToken.name,
						createdAt: canvasMcpToken.createdAt,
					});
				return Response.json({ ...record, token }, { status: 201 });
			},
			DELETE: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) return unauthorized();
				if (!isSameOrigin(request)) return forbidden();
				const tokenId = new URL(request.url).searchParams.get("id");
				if (!tokenId) {
					return Response.json({ error: "id is required" }, { status: 400 });
				}
				await db
					.update(canvasMcpToken)
					.set({ revokedAt: new Date() })
					.where(
						and(
							eq(canvasMcpToken.id, tokenId),
							eq(canvasMcpToken.userId, session.user.id),
						),
					);
				return new Response(null, { status: 204 });
			},
		},
	},
});

const tokenInput = z.object({ name: z.string().trim().min(1).max(100) });

function unauthorized() {
	return Response.json({ error: "Authentication required" }, { status: 401 });
}

function forbidden() {
	return Response.json({ error: "Invalid request origin" }, { status: 403 });
}

function isSameOrigin(request: Request) {
	return request.headers.get("Origin") === new URL(request.url).origin;
}
