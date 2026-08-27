import { canvasMcpAuth } from "@canvas-v5/auth";
import { db } from "@canvas-v5/db";
import { canvasMcpToken } from "@canvas-v5/db/schema/canvas";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createFileRoute } from "@tanstack/react-router";
import { verifyAccessToken } from "better-auth/oauth2";
import { and, eq, isNull } from "drizzle-orm";

import { createCanvasMcpServer } from "../../lib/canvas-mcp";
import { canvasMcpProtectedResourceMetadataUrl } from "../../lib/mcp-oauth";
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
	const authorization = await authenticateMcpRequest(request);
	if (!authorization) {
		return Response.json(
			{
				error:
					"A valid Canvas V5 OAuth access token or MCP bearer token is required.",
			},
			{
				status: 401,
				headers: {
					"WWW-Authenticate": `Bearer resource_metadata="${canvasMcpProtectedResourceMetadataUrl()}" scope="canvas:read"`,
				},
			},
		);
	}
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	const server = createCanvasMcpServer(authorization);
	await server.connect(transport);
	return transport.handleRequest(request, {
		authInfo: {
			token: "redacted",
			clientId: authorization.clientId,
			scopes: authorization.scopes,
		},
	});
}

async function authenticateMcpRequest(request: Request) {
	const authorization = request.headers.get("Authorization");
	if (!authorization?.startsWith("Bearer ")) return undefined;
	const token = authorization.slice("Bearer ".length).trim();
	if (!token.startsWith("cv5_")) return authenticateOAuthToken(token);
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
	return {
		userId: record.userId,
		clientId: `legacy:${record.id}`,
		scopes: ["canvas:read", "canvas:refresh"],
	};
}

async function authenticateOAuthToken(token: string) {
	try {
		const payload = await verifyAccessToken(token, {
			jwksUrl: canvasMcpAuth.jwksUrl,
			verifyOptions: {
				issuer: canvasMcpAuth.issuer,
				audience: canvasMcpAuth.resource,
			},
			scopes: ["canvas:read"],
		});
		if (typeof payload.sub !== "string") return undefined;
		const scopes = Array.isArray(payload.scope)
			? payload.scope.filter(
					(scope): scope is string => typeof scope === "string",
				)
			: typeof payload.scope === "string"
				? payload.scope.split(" ").filter(Boolean)
				: ["canvas:read"];
		return {
			userId: payload.sub,
			clientId:
				typeof payload.azp === "string" ? payload.azp : `oauth:${payload.sub}`,
			scopes,
		};
	} catch {
		return undefined;
	}
}
