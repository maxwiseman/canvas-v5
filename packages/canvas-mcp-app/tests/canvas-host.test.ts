import { expect, test } from "bun:test";
import { appRelativePath, unwrapAppResult } from "../src/canvas-host";

test("deep links keep the app in its own router", () => {
	expect(appRelativePath("/courses/10/assignments/3?tab=submission")).toBe(
		"/courses/10/assignments/3?tab=submission",
	);
	for (const path of [
		"//evil.example",
		"https://evil.example",
		"/\\evil.example",
		"/courses#fragment",
		null,
	])
		expect(appRelativePath(path)).toBeUndefined();
});
test("tool errors are surfaced and private metadata is required", () => {
	expect(
		unwrapAppResult({ content: [], _meta: { canvasApp: { accounts: [] } } }),
	).toEqual({ accounts: [] });
	expect(() =>
		unwrapAppResult({
			isError: true,
			content: [{ type: "text", text: "Reconnect Canvas" }],
		}),
	).toThrow("Reconnect Canvas");
	expect(() => unwrapAppResult({})).toThrow("no workspace data");
});
