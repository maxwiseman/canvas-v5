const OAUTH_AUTHORIZE_PATH = "/api/auth/oauth2/authorize";

type RedirectPayload = {
	redirect?: unknown;
	url?: unknown;
};

/**
 * Better Auth returns a JSON redirect instruction when an authorization request
 * looks like a browser fetch. OAuth clients need the authorization endpoint to
 * remain navigable, so normalize that one response into an HTTP redirect.
 */
export async function normalizeOAuthAuthorizationResponse(
	request: Request,
	response: Response,
): Promise<Response> {
	const requestUrl = new URL(request.url);
	if (
		request.method !== "GET" ||
		requestUrl.pathname !== OAUTH_AUTHORIZE_PATH ||
		!response.headers.get("content-type")?.includes("application/json")
	) {
		return response;
	}

	let payload: RedirectPayload;
	try {
		payload = (await response.clone().json()) as RedirectPayload;
	} catch {
		return response;
	}

	if (payload.redirect !== true || typeof payload.url !== "string") {
		return response;
	}

	const headers = new Headers(response.headers);
	headers.delete("content-length");
	headers.delete("content-type");
	headers.set("location", new URL(payload.url, requestUrl.origin).toString());

	return new Response(null, {
		status: 302,
		headers,
	});
}
