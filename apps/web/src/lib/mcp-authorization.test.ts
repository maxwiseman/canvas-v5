import { describe, expect, test } from "bun:test";
import {
	assertRefreshScope,
	CanvasRefreshPermissionError,
	canvasAuthorizationChallenge,
	canvasRefreshPermissionResult,
} from "./mcp-authorization";

const metadataUrl =
	"https://canvas.example/.well-known/oauth-protected-resource/api/mcp";

describe("Canvas OAuth scope recovery", () => {
	test("initial linking requests read and refresh access", () => {
		expect(canvasAuthorizationChallenge(metadataUrl)).toContain(
			'scope="canvas:read canvas:refresh"',
		);
	});

	test("old read-only grants can read cached data but cannot refresh", () => {
		expect(() => assertRefreshScope(["canvas:read"], false)).not.toThrow();
		expect(() => assertRefreshScope(["canvas:read"], true)).toThrow(
			CanvasRefreshPermissionError,
		);
		expect(() =>
			assertRefreshScope(["canvas:read", "canvas:refresh"], true),
		).not.toThrow();
	});

	test("missing scope requests reauthorization instead of a retryable sync error", () => {
		const result = canvasRefreshPermissionResult(metadataUrl);
		expect(result.isError).toBe(true);
		expect(result.structuredContent.error).toMatchObject({
			code: "INSUFFICIENT_SCOPE",
			retryable: false,
		});
		const challenge = result._meta["mcp/www_authenticate"][0];
		expect(challenge).toContain(`resource_metadata="${metadataUrl}"`);
		expect(challenge).toContain('error="insufficient_scope"');
		expect(challenge).toContain('scope="canvas:read canvas:refresh"');
		expect(challenge).toContain('error_description="');
	});
});
