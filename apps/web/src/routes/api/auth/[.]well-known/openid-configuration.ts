import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@canvas-v5/auth";
import { createFileRoute } from "@tanstack/react-router";

const metadataHandler = oauthProviderOpenIdConfigMetadata(auth);

export const Route = createFileRoute(
	"/api/auth/.well-known/openid-configuration",
)({
	server: {
		handlers: {
			GET: ({ request }) => metadataHandler(request),
		},
	},
});
