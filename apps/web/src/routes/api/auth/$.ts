import { auth } from "@canvas-v5/auth";
import { createFileRoute } from "@tanstack/react-router";

import { normalizeOAuthAuthorizationResponse } from "@/lib/oauth-authorization-response";

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const response = await auth.handler(request);
				return normalizeOAuthAuthorizationResponse(request, response);
			},
			POST: ({ request }) => {
				return auth.handler(request);
			},
		},
	},
});
