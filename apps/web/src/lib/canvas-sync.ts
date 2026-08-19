import {
	type CanvasAccountRef,
	syncCoursesAndAssignments,
} from "@canvas-v5/canvas-core";
import { CanvasRestTransport } from "@canvas-v5/canvas-sdk/transports";
import { db, PostgresCanvasRepository } from "@canvas-v5/db";
import {
	canvasConnection,
	canvasCredential,
	canvasDevice,
	canvasIdentity,
	canvasSyncRequest,
	canvasSyncState,
} from "@canvas-v5/db/schema/canvas";
import { env } from "@canvas-v5/env/server";
import { and, desc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import webPush from "web-push";

import { decryptCanvasToken } from "./canvas-token";

const DEFAULT_FRESHNESS_MS = 2 * 60 * 1000;

export async function syncCanvasIdentityDirect(
	userId: string,
	canvasIdentityId: string,
) {
	const identity = await getOwnedCanvasIdentity(userId, canvasIdentityId);
	const credential = await findServerCredential(userId, canvasIdentityId);
	if (!credential?.encryptedAccessToken) {
		throw new CanvasSessionRequiredError(canvasIdentityId);
	}
	const accessToken = decryptCanvasToken(credential.encryptedAccessToken);
	const source = new CanvasRestTransport({
		mode: "web",
		baseUrl: identity.canvasBaseUrl,
		accessToken,
		credentials: "omit",
	});
	const account: CanvasAccountRef = {
		id: identity.id,
		baseUrl: identity.canvasBaseUrl,
		canvasUserId: identity.canvasUserId,
	};

	try {
		const results = await syncCoursesAndAssignments({
			source,
			repository: new PostgresCanvasRepository(db, userId),
			account,
		});
		await db
			.update(canvasCredential)
			.set({ status: "active", lastVerifiedAt: new Date(), lastError: null })
			.where(eq(canvasCredential.id, credential.id));
		return results;
	} catch (error) {
		await db
			.update(canvasCredential)
			.set({
				status: "error",
				lastError:
					error instanceof Error
						? error.message
						: "Canvas synchronization failed.",
			})
			.where(eq(canvasCredential.id, credential.id));
		throw error;
	}
}

export async function ensureCanvasIdentityFresh(options: {
	userId: string;
	canvasIdentityId: string;
	maxAgeMs?: number;
	force?: boolean;
}) {
	const maxAgeMs = options.maxAgeMs ?? DEFAULT_FRESHNESS_MS;
	const freshness = await getCanvasFreshness(
		options.userId,
		options.canvasIdentityId,
	);
	const isFresh =
		freshness?.observedAt &&
		freshness.observedAt.getTime() >= Date.now() - maxAgeMs;
	if (!options.force && isFresh) {
		return { mode: "cache" as const, freshness };
	}

	const credential = await findServerCredential(
		options.userId,
		options.canvasIdentityId,
	);
	if (credential?.encryptedAccessToken) {
		await syncCanvasIdentityDirect(options.userId, options.canvasIdentityId);
		return {
			mode: "direct" as const,
			freshness: await getCanvasFreshness(
				options.userId,
				options.canvasIdentityId,
			),
		};
	}

	const request = await requestExtensionSync(
		options.userId,
		options.canvasIdentityId,
		"mcp-access",
	);
	return { mode: "extension-requested" as const, freshness, request };
}

export async function getOwnedCanvasIdentity(
	userId: string,
	canvasIdentityId: string,
) {
	const [identity] = await db
		.select()
		.from(canvasIdentity)
		.where(
			and(
				eq(canvasIdentity.id, canvasIdentityId),
				eq(canvasIdentity.userId, userId),
			),
		);
	if (!identity) throw new Error("Canvas account not found.");
	return identity;
}

export async function listOwnedCanvasIdentities(userId: string) {
	return db
		.select()
		.from(canvasIdentity)
		.where(eq(canvasIdentity.userId, userId));
}

export async function getCanvasFreshness(
	userId: string,
	canvasIdentityId: string,
) {
	await getOwnedCanvasIdentity(userId, canvasIdentityId);
	const [state] = await db
		.select()
		.from(canvasSyncState)
		.where(
			and(
				eq(canvasSyncState.canvasIdentityId, canvasIdentityId),
				eq(canvasSyncState.scope, "courses"),
			),
		)
		.orderBy(desc(canvasSyncState.observedAt));
	return state;
}

export async function requestExtensionSync(
	userId: string,
	canvasIdentityId: string,
	reason: string,
) {
	await getOwnedCanvasIdentity(userId, canvasIdentityId);
	const recentThreshold = new Date(Date.now() - 5 * 60 * 1000);
	const [existing] = await db
		.select()
		.from(canvasSyncRequest)
		.where(
			and(
				eq(canvasSyncRequest.userId, userId),
				eq(canvasSyncRequest.canvasIdentityId, canvasIdentityId),
				inArray(canvasSyncRequest.status, ["pending", "claimed"]),
				gt(canvasSyncRequest.requestedAt, recentThreshold),
			),
		)
		.orderBy(desc(canvasSyncRequest.requestedAt));
	if (existing) return existing;

	const [request] = await db
		.insert(canvasSyncRequest)
		.values({
			id: crypto.randomUUID(),
			userId,
			canvasIdentityId,
			scope: "assignments",
			reason,
			status: "pending",
		})
		.returning();
	if (!request) throw new Error("Canvas sync request could not be created.");
	await sendCanvasSyncPush(userId, request.id);
	return request;
}

async function findServerCredential(userId: string, canvasIdentityId: string) {
	const [credential] = await db
		.select()
		.from(canvasCredential)
		.where(
			and(
				eq(canvasCredential.userId, userId),
				eq(canvasCredential.canvasIdentityId, canvasIdentityId),
				inArray(canvasCredential.kind, ["oauth", "api-token"]),
				eq(canvasCredential.status, "active"),
			),
		)
		.orderBy(desc(canvasCredential.kind));
	if (credential?.encryptedAccessToken) return credential;

	const [legacyConnection] = await db
		.select()
		.from(canvasConnection)
		.where(
			and(
				eq(canvasConnection.userId, userId),
				eq(canvasConnection.canvasIdentityId, canvasIdentityId),
				isNotNull(canvasConnection.encryptedAccessToken),
			),
		);
	return legacyConnection?.encryptedAccessToken
		? {
				id: `legacy:${legacyConnection.id}`,
				encryptedAccessToken: legacyConnection.encryptedAccessToken,
			}
		: undefined;
}

async function sendCanvasSyncPush(userId: string, requestId: string) {
	if (
		!env.CANVAS_SYNC_VAPID_PUBLIC_KEY ||
		!env.CANVAS_SYNC_VAPID_PRIVATE_KEY ||
		!env.CANVAS_SYNC_VAPID_SUBJECT
	) {
		return;
	}
	webPush.setVapidDetails(
		env.CANVAS_SYNC_VAPID_SUBJECT,
		env.CANVAS_SYNC_VAPID_PUBLIC_KEY,
		env.CANVAS_SYNC_VAPID_PRIVATE_KEY,
	);
	const devices = await db
		.select()
		.from(canvasDevice)
		.where(
			and(eq(canvasDevice.userId, userId), eq(canvasDevice.pushEnabled, true)),
		);
	await Promise.allSettled(
		devices.flatMap((device) =>
			device.pushSubscription
				? [
						webPush.sendNotification(
							device.pushSubscription,
							JSON.stringify({ type: "canvas-v5:sync", requestId }),
						),
					]
				: [],
		),
	);
}

export class CanvasSessionRequiredError extends Error {
	constructor(readonly canvasIdentityId: string) {
		super("This Canvas account requires an authenticated extension session.");
	}
}
