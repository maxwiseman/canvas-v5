import { describe, expect, it } from "vitest";

import { normalizeOAuthAuthorizationResponse } from "./oauth-authorization-response";

describe("normalizeOAuthAuthorizationResponse", () => {
	it("turns Better Auth's JSON authorization instruction into a redirect", async () => {
		const request = new Request(
			"https://canvas.maxw.app/api/auth/oauth2/authorize?client_id=test",
		);
		const response = Response.json(
			{ redirect: true, url: "/login?sig=signed" },
			{ headers: { "set-cookie": "oauth=value; Path=/; HttpOnly" } },
		);

		const normalized = await normalizeOAuthAuthorizationResponse(
			request,
			response,
		);

		expect(normalized.status).toBe(302);
		expect(normalized.headers.get("location")).toBe(
			"https://canvas.maxw.app/login?sig=signed",
		);
		expect(normalized.headers.get("set-cookie")).toBe(
			"oauth=value; Path=/; HttpOnly",
		);
	});

	it("leaves non-authorization responses unchanged", async () => {
		const request = new Request("https://canvas.maxw.app/api/auth/get-session");
		const response = Response.json({ redirect: true, url: "/login" });

		expect(await normalizeOAuthAuthorizationResponse(request, response)).toBe(
			response,
		);
	});

	it("leaves normal authorization JSON unchanged", async () => {
		const request = new Request(
			"https://canvas.maxw.app/api/auth/oauth2/authorize?client_id=test",
		);
		const response = Response.json({ error: "invalid_request" });

		expect(await normalizeOAuthAuthorizationResponse(request, response)).toBe(
			response,
		);
	});
});
