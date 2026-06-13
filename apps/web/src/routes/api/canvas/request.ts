import { auth } from "@canvas-v5/auth";
import { db } from "@canvas-v5/db";
import { canvasConnection } from "@canvas-v5/db/schema/canvas";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { decryptCanvasToken } from "../../../lib/canvas-token";

export const Route = createFileRoute("/api/canvas/request")({
	server: {
		handlers: {
			GET: ({ request }) => proxyCanvasRequest(request),
			POST: ({ request }) => proxyCanvasRequest(request),
			PATCH: ({ request }) => proxyCanvasRequest(request),
			PUT: ({ request }) => proxyCanvasRequest(request),
			DELETE: ({ request }) => proxyCanvasRequest(request),
		},
	},
});

async function proxyCanvasRequest(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return Response.json({ error: "Authentication required" }, { status: 401 });
	}

	const requestUrl = new URL(request.url);
	const connectionId = requestUrl.searchParams.get("connectionId");
	const path = requestUrl.searchParams.get("path");
	const paginated = requestUrl.searchParams.get("paginated") === "true";

	if (!connectionId || !path?.startsWith("/api/v1/")) {
		return Response.json({ error: "Invalid Canvas request" }, { status: 400 });
	}

	const [connection] = await db
		.select()
		.from(canvasConnection)
		.where(
			and(
				eq(canvasConnection.userId, session.user.id),
				eq(canvasConnection.id, connectionId),
			),
		);
	if (!connection) {
		return Response.json(
			{ error: "Canvas connection not found" },
			{ status: 404 },
		);
	}
	if (connection.authMode === "canvas-session") {
		return Response.json(
			{
				error: "Canvas session connections are only available in the extension",
			},
			{ status: 400 },
		);
	}
	if (!connection.encryptedAccessToken) {
		return Response.json(
			{ error: "Canvas connection is missing an access token" },
			{ status: 400 },
		);
	}

	const accessToken = decryptCanvasToken(connection.encryptedAccessToken);
	const body =
		request.method === "GET" || request.method === "HEAD"
			? undefined
			: await request.text();
	const canvasUrl = new URL(path, connection.canvasBaseUrl);

	if (paginated) {
		const records = await fetchPaginatedCanvasRecords(canvasUrl, accessToken);
		return Response.json(records);
	}

	const canvasResponse = await fetch(canvasUrl, {
		method: request.method,
		headers: createCanvasHeaders(accessToken, body !== undefined),
		body,
	});
	return createCanvasJsonResponse(canvasResponse);
}

async function fetchPaginatedCanvasRecords(url: URL, accessToken: string) {
	const records: unknown[] = [];
	let nextUrl: URL | undefined = url;

	while (nextUrl) {
		const response = await fetch(nextUrl, {
			headers: createCanvasHeaders(accessToken, false),
		});
		if (!response.ok) {
			throw new Error(`Canvas request failed (${response.status})`);
		}
		const page = (await response.json()) as unknown[];
		records.push(...page);
		nextUrl = parseNextLink(response.headers.get("Link"));
	}

	return records;
}

function createCanvasHeaders(accessToken: string, hasBody: boolean) {
	return {
		Accept: "application/json",
		Authorization: `Bearer ${accessToken}`,
		...(hasBody ? { "Content-Type": "application/json" } : {}),
	};
}

async function createCanvasJsonResponse(canvasResponse: Response) {
	const contentType = canvasResponse.headers.get("Content-Type") ?? "";
	if (!contentType.includes("application/json")) {
		return new Response(await canvasResponse.text(), {
			status: canvasResponse.status,
		});
	}
	return Response.json(await canvasResponse.json(), {
		status: canvasResponse.status,
	});
}

function parseNextLink(linkHeader: string | null) {
	if (!linkHeader) {
		return undefined;
	}
	for (const part of linkHeader.split(",")) {
		const [urlPart, relPart] = part.split(";").map((value) => value.trim());
		if (
			relPart === 'rel="next"' &&
			urlPart?.startsWith("<") &&
			urlPart.endsWith(">")
		) {
			return new URL(urlPart.slice(1, -1));
		}
	}
	return undefined;
}
