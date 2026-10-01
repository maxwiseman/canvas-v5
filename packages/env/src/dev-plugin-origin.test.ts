import { expect, test } from "bun:test";
import { devPluginOrigin } from "./dev-plugin-origin";
test("production and ordinary previews retain configured origins", () => {
	expect(
		devPluginOrigin({ VERCEL_URL: "canvas-example.vercel.app" }),
	).toBeUndefined();
});
test("dev plugin uses only the verified Vercel hostname", () => {
	expect(
		devPluginOrigin({
			CANVAS_DEV_PLUGIN: "1",
			VERCEL_URL: "canvas-example.vercel.app",
		}),
	).toBe("https://canvas-example.vercel.app");
	for (const host of [
		undefined,
		"example.com",
		"evil.vercel.app/redirect",
		"evil.vercel.app@example.com",
	]) {
		expect(() =>
			devPluginOrigin({ CANVAS_DEV_PLUGIN: "1", VERCEL_URL: host }),
		).toThrow();
	}
});

test("only the dev branch preview opts in automatically", () => {
	const environment = {
		VERCEL_ENV: "preview",
		VERCEL_GIT_COMMIT_REF: "codex/chatgpt-plugin-dev",
		VERCEL_URL: "canvas-example.vercel.app",
	};
	expect(devPluginOrigin(environment)).toBe(
		"https://canvas-example.vercel.app",
	);
	expect(
		devPluginOrigin({ ...environment, VERCEL_ENV: "production" }),
	).toBeUndefined();
	expect(
		devPluginOrigin({ ...environment, VERCEL_GIT_COMMIT_REF: "main" }),
	).toBeUndefined();
});
