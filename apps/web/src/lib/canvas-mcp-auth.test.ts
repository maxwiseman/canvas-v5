import { afterEach, expect, mock, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const health = mock(async () => []);
mock.module("@canvas-v5/db", () => ({
	db: {},
	PostgresCanvasRepository: class {},
}));
mock.module("@canvas-v5/mcp-app/assignment-widget.html?raw", () => ({
	default: "<html></html>",
}));
mock.module("./mcp-oauth", () => ({
	canvasMcpProtectedResourceMetadataUrl: () =>
		"https://canvas.example/.well-known/oauth-protected-resource/api/mcp",
}));
mock.module("./canvas-sync", () => ({
	CanvasSessionRequiredError: class extends Error {},
	ensureCanvasIdentityFresh: mock(async () => {
		throw new Error("Unexpected sync");
	}),
	getCanvasFreshness: mock(async () => null),
	listCanvasAccountHealth: health,
	listOwnedCanvasIdentities: mock(async () => []),
}));
const { createCanvasMcpServer } = await import("./canvas-mcp");
afterEach(() => health.mockClear());

async function connect(scopes: string[]) {
	const server = createCanvasMcpServer({ userId: "test-user", scopes });
	const client = new Client({ name: "auth-test", version: "1.0.0" });
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return {
		client,
		close: async () => {
			await client.close();
			await server.close();
		},
	};
}

test("tools publish auth requirements without dropping widget metadata", async () => {
	const { client, close } = await connect(["canvas:read"]);
	try {
		const { tools } = await client.listTools();
		for (const tool of tools) {
			expect(tool._meta?.securitySchemes).toEqual([
				{
					type: "oauth2",
					scopes:
						tool.name === "canvas_refresh"
							? ["canvas:read", "canvas:refresh"]
							: ["canvas:read"],
				},
			]);
		}
		expect(
			tools.find((t) => t.name === "canvas_show_upcoming_assignments")?._meta?.[
				"openai/outputTemplate"
			],
		).toBe("ui://canvas-v5/upcoming-assignments-v4.html");
	} finally {
		await close();
	}
});

test("read-only grant gets OAuth challenge before any refresh or account lookup", async () => {
	const { client, close } = await connect(["canvas:read"]);
	try {
		for (const [name, args] of [
			["canvas_refresh", {}],
			["canvas_list_courses", { refresh: true }],
		] as const) {
			const result = await client.callTool({ name, arguments: args });
			expect(result.isError).toBe(true);
			expect(result._meta?.["mcp/www_authenticate"]).toEqual([
				expect.stringContaining('error="insufficient_scope"'),
			]);
			expect(result.structuredContent).toMatchObject({
				error: { code: "INSUFFICIENT_SCOPE", retryable: false },
			});
		}
		expect(health).not.toHaveBeenCalled();
		const read = await client.callTool({
			name: "canvas_list_accounts",
			arguments: {},
		});
		expect(read.isError).not.toBe(true);
		expect(health).toHaveBeenCalledTimes(1);
	} finally {
		await close();
	}
});

test("new grant with refresh permission passes authorization", async () => {
	const { client, close } = await connect(["canvas:read", "canvas:refresh"]);
	try {
		const result = await client.callTool({
			name: "canvas_refresh",
			arguments: {},
		});
		expect(result.isError).not.toBe(true);
		expect(result._meta?.["mcp/www_authenticate"]).toBeUndefined();
		expect(health).toHaveBeenCalled();
	} finally {
		await close();
	}
});
