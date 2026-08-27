import { oauthProvider } from "@better-auth/oauth-provider";
import { createDb } from "@canvas-v5/db";
import * as schema from "@canvas-v5/db/schema/auth";
import { env } from "@canvas-v5/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

const applicationOrigin = new URL(env.CORS_ORIGIN).origin;

export const canvasMcpAuth = {
	issuer: `${applicationOrigin}/api/auth`,
	jwksUrl: `${applicationOrigin}/api/auth/jwks`,
	resource: `${applicationOrigin}/api/mcp`,
	scopes: [
		"openid",
		"profile",
		"email",
		"offline_access",
		"canvas:read",
		"canvas:refresh",
	] as const,
};

export function createAuth() {
	const db = createDb();

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",

			schema: schema,
		}),
		trustedOrigins: [
			env.CORS_ORIGIN,
			env.BETTER_AUTH_URL,
			"chrome-extension://*",
		],
		emailAndPassword: {
			enabled: true,
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
			},
		},
		plugins: [
			jwt({
				jwt: {
					issuer: canvasMcpAuth.issuer,
				},
			}),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/oauth/consent",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				scopes: [...canvasMcpAuth.scopes],
				advertisedMetadata: {
					scopes_supported: [...canvasMcpAuth.scopes],
				},
				validAudiences: [canvasMcpAuth.resource],
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
				clientRegistrationDefaultScopes: [
					"openid",
					"profile",
					"email",
					"offline_access",
					"canvas:read",
					"canvas:refresh",
				],
				clientRegistrationAllowedScopes: [
					"openid",
					"profile",
					"email",
					"offline_access",
					"canvas:read",
					"canvas:refresh",
				],
			}),
			tanstackStartCookies(),
		],
	});
}

export const auth = createAuth();
