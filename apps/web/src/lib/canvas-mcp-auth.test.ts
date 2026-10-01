import { afterEach, expect, mock, test } from "bun:test";
import { user } from "@canvas-v5/db/schema/auth";
import {
	canvasConnection,
	canvasCourseOverlay,
} from "@canvas-v5/db/schema/canvas";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const selectedRows = new Map<unknown, unknown[]>();
const predicates: unknown[][] = [];
const health = mock(async () => []);
mock.module("@canvas-v5/db", () => ({
	db: {
		select: () => ({
			from: (table: unknown) => ({
				where: async (condition: SQL) => {
					predicates.push(new PgDialect().sqlToQuery(condition).params);
					return selectedRows.get(table) ?? [];
				},
			}),
		}),
	},
	PostgresCanvasRepository: class {},
}));
mock.module("@canvas-v5/mcp-app/assignment-widget.html?raw", () => ({
	default: "<html></html>",
}));
mock.module("@canvas-v5/mcp-app/canvas-app.html?raw", () => ({
	default: "<html>Canvas workspace</html>",
}));
mock.module("@canvas-v5/env/server", () => ({
	env: {
		BETTER_AUTH_URL: "https://canvas.example",
		BETTER_AUTH_SECRET: "test-secret",
	},
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
afterEach(() => {
	health.mockClear();
	selectedRows.clear();
	predicates.length = 0;
});

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
			tools.find((t) => t.name === "canvas_open_app")?._meta?.["openai/ui"],
		).toEqual({ entrypoints: [{ type: "global" }, { type: "thread" }] });
		expect(tools.find((t) => t.name === "canvas_app_read")?._meta?.ui).toEqual({
			visibility: ["app"],
		});
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

test("workspace bootstrap is private UI data and never includes stored credentials", async () => {
	selectedRows.set(user, [
		{ id: "test-user", name: "Student", email: "student@example.com" },
	]);
	selectedRows.set(canvasConnection, [
		{
			id: "owned",
			userId: "test-user",
			label: "School",
			canvasBaseUrl: "https://school.instructure.com",
			authMode: "api-token",
			encryptedAccessToken: "secret-sentinel",
		},
	]);
	selectedRows.set(canvasCourseOverlay, []);
	const { client, close } = await connect(["canvas:read"]);
	try {
		const result = await client.callTool({
			name: "canvas_open_app",
			arguments: {},
		});
		expect(result.isError).not.toBe(true);
		expect(result.content).toEqual([]);
		expect(result.structuredContent).toBeUndefined();
		expect(result._meta?.canvasApp).toMatchObject({
			user: { id: "test-user" },
			accounts: [{ connectionId: "owned" }],
		});
		expect(JSON.stringify(result)).not.toContain("secret-sentinel");
		expect(predicates).toEqual([["test-user"], ["test-user"], ["test-user"]]);
	} finally {
		await close();
	}
});

test("workspace reads filter by authenticated owner as well as connection ID", async () => {
	const { client, close } = await connect(["canvas:read"]);
	try {
		const result = await client.callTool({
			name: "canvas_app_read",
			arguments: { connectionId: "foreign-account", path: "/api/v1/courses" },
		});
		expect(result.isError).toBe(true);
		expect(predicates).toEqual([["test-user", "foreign-account"]]);
	} finally {
		await close();
	}
});
