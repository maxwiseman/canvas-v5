import { expect, mock, test } from "bun:test";
import { ChatGPTCanvasTransport } from "../src/chatgpt";
import type { CanvasAccount } from "../src/types";

const account: CanvasAccount = {
	id: "a",
	connectionId: "a",
	label: "School",
	canvasBaseUrl: "https://school.instructure.com",
	authMode: "canvas-session",
	isActive: true,
};

test("ChatGPT transport uses the selected connection and preserves errors", async () => {
	const call = mock(async () => [{ id: 1 }]);
	const transport = new ChatGPTCanvasTransport(call);
	await expect(transport.request("/api/v1/courses")).rejects.toThrow(
		"Select a Canvas account",
	);
	transport.setActiveAccount(account);
	expect(await transport.paginatedRequest("/api/v1/courses")).toEqual([
		{ id: 1 },
	]);
	expect(call).toHaveBeenLastCalledWith("canvas_app_read", {
		connectionId: "a",
		path: "/api/v1/courses",
		paginated: true,
	});
	transport.setActiveAccount({ ...account, id: "b", connectionId: "b" });
	await transport.request("/api/v1/courses/1");
	expect(call).toHaveBeenLastCalledWith("canvas_app_read", {
		connectionId: "b",
		path: "/api/v1/courses/1",
		paginated: false,
	});
});

test("writes and cancelled requests never reach MCP", async () => {
	const call = mock(async () => null);
	const transport = new ChatGPTCanvasTransport(call);
	transport.setActiveAccount(account);
	for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
		await expect(
			transport.request("/api/v1/conversations", { method }),
		).rejects.toThrow("read access");
	}
	await expect(
		transport.request("/api/v1/courses", { signal: AbortSignal.abort() }),
	).rejects.toThrow();
	expect(call).not.toHaveBeenCalled();
});
