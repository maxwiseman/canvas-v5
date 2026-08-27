import { createFileRoute } from "@tanstack/react-router";

import { canvasMcpProtectedResourceMetadata } from "@/lib/mcp-oauth";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
	server: {
		handlers: {
			GET: () => Response.json(canvasMcpProtectedResourceMetadata()),
		},
	},
});
