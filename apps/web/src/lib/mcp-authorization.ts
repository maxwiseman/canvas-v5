export const canvasReadScopes = ["canvas:read"];
export const canvasRefreshScopes = ["canvas:read", "canvas:refresh"];

// SDK 1.x publishes custom tool auth declarations through _meta.
export function canvasToolSecurity(refresh = false) {
	return {
		securitySchemes: [
			{
				type: "oauth2",
				scopes: refresh ? canvasRefreshScopes : canvasReadScopes,
			},
		],
	};
}

export function canvasAuthorizationChallenge(
	metadataUrl: string,
	insufficientScope = false,
) {
	return `Bearer resource_metadata="${metadataUrl}" scope="${canvasRefreshScopes.join(" ")}"${
		insufficientScope
			? ', error="insufficient_scope", error_description="Reconnect Canvas V5 to grant canvas:refresh permission"'
			: ""
	}`;
}

export class CanvasRefreshPermissionError extends Error {
	constructor() {
		super(
			"Reconnect Canvas V5 and allow refresh access. The canvas:refresh permission is required to refresh Canvas data.",
		);
	}
}

export function assertRefreshScope(scopes: string[], refresh: boolean) {
	if (refresh && !scopes.includes("canvas:refresh")) {
		throw new CanvasRefreshPermissionError();
	}
}

export function canvasRefreshPermissionResult(metadataUrl: string) {
	const error = {
		code: "INSUFFICIENT_SCOPE",
		message: new CanvasRefreshPermissionError().message,
		retryable: false,
	};
	return {
		isError: true,
		content: [{ type: "text" as const, text: error.message }],
		structuredContent: { ok: false, error },
		_meta: {
			"mcp/www_authenticate": [canvasAuthorizationChallenge(metadataUrl, true)],
		},
	};
}
