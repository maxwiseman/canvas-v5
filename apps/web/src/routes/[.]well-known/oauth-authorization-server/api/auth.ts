import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@canvas-v5/auth";
import { createFileRoute } from "@tanstack/react-router";

const metadataHandler = oauthProviderAuthServerMetadata(auth);

export const Route = createFileRoute(
	"/.well-known/oauth-authorization-server/api/auth",
)({
	server: {
		handlers: {
			GET: ({ request }) => metadataHandler(request),
		},
	},
});
