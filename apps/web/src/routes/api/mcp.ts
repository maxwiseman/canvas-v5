import { db } from "@canvas-v5/db";
import { canvasMcpToken } from "@canvas-v5/db/schema/canvas";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, isNull } from "drizzle-orm";

import { createCanvasMcpServer } from "../../lib/canvas-mcp";
import { hashMcpToken } from "../../lib/mcp-token";

export const Route = createFileRoute("/api/mcp")({
	server: {
		handlers: {
			GET: ({ request }) => handleMcpRequest(request),
			POST: ({ request }) => handleMcpRequest(request),
			DELETE: ({ request }) => handleMcpRequest(request),
		},
	},
});

async function handleMcpRequest(request: Request) {
	const userId = await authenticateMcpRequest(request);
	if (!userId) {
		return Response.json(
			{ error: "A valid Canvas V5 MCP bearer token is required." },
			{ status: 401, headers: { "WWW-Authenticate": "Bearer" } },
		);
	}
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	const server = createCanvasMcpServer(userId);
	await server.connect(transport);
	return transport.handleRequest(request, {
		authInfo: { token: "redacted", clientId: userId, scopes: ["canvas:read"] },
	});
}

async function authenticateMcpRequest(request: Request) {
	const authorization = request.headers.get("Authorization");
	if (!authorization?.startsWith("Bearer ")) return undefined;
	const token = authorization.slice("Bearer ".length).trim();
	if (!token.startsWith("cv5_")) return undefined;
	const [record] = await db
		.select()
		.from(canvasMcpToken)
		.where(
			and(
				eq(canvasMcpToken.tokenHash, hashMcpToken(token)),
				isNull(canvasMcpToken.revokedAt),
			),
		);
	if (!record) return undefined;
	await db
		.update(canvasMcpToken)
		.set({ lastUsedAt: new Date() })
		.where(eq(canvasMcpToken.id, record.id));
	return record.userId;
}
