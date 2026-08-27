import { canvasMcpAuth } from "@canvas-v5/auth";

export function canvasMcpProtectedResourceMetadata() {
	return {
		resource: canvasMcpAuth.resource,
		resource_name: "Canvas V5",
		authorization_servers: [canvasMcpAuth.issuer],
		scopes_supported: ["canvas:read", "canvas:refresh"],
		bearer_methods_supported: ["header"],
	};
}

export function canvasMcpProtectedResourceMetadataUrl() {
	const resource = new URL(canvasMcpAuth.resource);
	return `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`;
}
