import { randomUUID } from "node:crypto";
import { auth } from "@canvas-v5/auth";
import { db } from "@canvas-v5/db";
import {
	canvasConnection,
	canvasCredential,
	canvasIdentity,
} from "@canvas-v5/db/schema/canvas";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
	decryptCanvasToken,
	encryptCanvasToken,
} from "../../../lib/canvas-token";

export const Route = createFileRoute("/api/canvas/connections")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json([], { status: 401 });
				}

				const rows = await db
					.select()
					.from(canvasConnection)
					.where(eq(canvasConnection.userId, session.user.id));

				const hydratedRows = await Promise.all(
					rows.map((row) => ensureExistingConnectionIdentity(row)),
				);
				return Response.json(hydratedRows.map((row) => toApiConnection(row)));
			},
			POST: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return Response.json(
						{ error: "Authentication required" },
						{ status: 401 },
					);
				}

				const parsedInput = connectionInput.parse(await request.json());
				if (
					parsedInput.authMode !== "canvas-session" &&
					!parsedInput.accessToken?.trim()
				) {
					return Response.json(
						{ error: "Access token required" },
						{ status: 400 },
					);
				}

				const resolvedCanvasUser = await resolveCanvasUser(parsedInput);
				const input = normalizeConnectionInput(parsedInput, resolvedCanvasUser);
				const now = new Date();
				const identity = input.canvasUserId
					? await upsertCanvasIdentity({
							userId: session.user.id,
							canvasBaseUrl: input.canvasBaseUrl,
							canvasUserId: input.canvasUserId,
							label: input.label,
							displayName: input.canvasUserName,
							avatarUrl: input.canvasAvatarUrl,
						})
					: undefined;
				const existingConnection = await findExistingConnection(
					session.user.id,
					input.id,
				);
				const label =
					parsedInput.authMode === "canvas-session" &&
					parsedInput.connectionId &&
					existingConnection
						? existingConnection.label
						: input.label;
				const encryptedAccessToken = input.accessToken
					? encryptCanvasToken(input.accessToken)
					: undefined;
				const updateValues = {
					canvasBaseUrl: input.canvasBaseUrl,
					canvasUserId: input.canvasUserId ?? null,
					canvasIdentityId: identity?.id ?? null,
					label,
					authMode: input.authMode,
					updatedAt: now,
					...(encryptedAccessToken ? { encryptedAccessToken } : {}),
				};
				const [row] = await db
					.insert(canvasConnection)
					.values({
						id: input.id,
						userId: session.user.id,
						canvasBaseUrl: input.canvasBaseUrl,
						canvasUserId: input.canvasUserId ?? null,
						canvasIdentityId: identity?.id,
						label,
						authMode: input.authMode,
						encryptedAccessToken,
						updatedAt: now,
					})
					.onConflictDoUpdate({
						target: canvasConnection.id,
						set: updateValues,
					})
					.returning();

				if (!row) {
					return Response.json(
						{ error: "Connection could not be saved" },
						{ status: 500 },
					);
				}

				if (identity) {
					const kind =
						input.authMode === "canvas-session"
							? "browser-session"
							: input.authMode;
					await db
						.insert(canvasCredential)
						.values({
							id: `${identity.id}:${kind}`,
							userId: session.user.id,
							canvasIdentityId: identity.id,
							canvasConnectionId: row.id,
							kind,
							encryptedAccessToken,
							status: "active",
							lastVerifiedAt: now,
							lastError: null,
						})
						.onConflictDoUpdate({
							target: canvasCredential.id,
							set: {
								canvasConnectionId: row.id,
								...(encryptedAccessToken ? { encryptedAccessToken } : {}),
								status: "active",
								lastVerifiedAt: now,
								lastError: null,
							},
						});
				}

				return Response.json(toApiConnection(row, true, identity));
			},
		},
	},
});

const connectionInput = z.object({
	id: z.string().min(1).optional(),
	connectionId: z.string().min(1).optional(),
	label: z.string().min(1),
	canvasBaseUrl: z.string().trim().url(),
	canvasUserId: z.string().optional(),
	canvasUserName: z.string().optional(),
	canvasAvatarUrl: z.string().trim().url().optional(),
	authMode: z.enum(["canvas-session", "api-token", "oauth"]),
	accessToken: z.string().optional(),
	isActive: z.boolean().optional(),
});

function normalizeConnectionInput(
	input: z.infer<typeof connectionInput>,
	resolvedCanvasUser?: CanvasProfile,
) {
	const canvasBaseUrl = new URL(input.canvasBaseUrl).origin;
	const canvasUserId = resolvedCanvasUser?.id ?? input.canvasUserId?.trim();
	const identityKey = canvasUserId
		? createIdentityKey(canvasBaseUrl, canvasUserId)
		: undefined;
	const id =
		input.connectionId ??
		input.id ??
		(identityKey ? `${identityKey}:${input.authMode}` : randomUUID());

	return {
		id,
		label: input.label.trim() || resolvedCanvasUser?.name || canvasBaseUrl,
		canvasBaseUrl,
		canvasUserId: canvasUserId || undefined,
		canvasUserName:
			resolvedCanvasUser?.name ?? (input.canvasUserName?.trim() || undefined),
		canvasAvatarUrl:
			resolvedCanvasUser?.avatarUrl ??
			(input.canvasAvatarUrl?.trim() || undefined),
		authMode: input.authMode,
		accessToken: input.accessToken?.trim() || undefined,
		isActive: input.isActive ?? true,
	};
}

async function resolveCanvasUser(input: z.infer<typeof connectionInput>) {
	if (input.authMode === "canvas-session") {
		return input.canvasUserId
			? {
					id: input.canvasUserId.trim(),
					name: input.canvasUserName?.trim() || input.label.trim(),
					avatarUrl: input.canvasAvatarUrl?.trim() || undefined,
				}
			: undefined;
	}
	const accessToken = input.accessToken?.trim();
	if (!accessToken) return undefined;
	const canvasBaseUrl = new URL(input.canvasBaseUrl).origin;
	const response = await fetch(
		new URL("/api/v1/users/self/profile", canvasBaseUrl),
		{
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
		},
	);
	if (!response.ok) {
		throw new Error(`Canvas token validation failed (${response.status}).`);
	}
	const profile = (await response.json()) as {
		id?: unknown;
		name?: unknown;
		avatar_url?: unknown;
	};
	if (profile.id === undefined || profile.id === null) {
		throw new Error("Canvas token validation returned no user ID.");
	}
	return {
		id: String(profile.id),
		name: typeof profile.name === "string" ? profile.name : undefined,
		avatarUrl:
			typeof profile.avatar_url === "string" ? profile.avatar_url : undefined,
	};
}

interface CanvasProfile {
	id: string;
	name?: string;
	avatarUrl?: string;
}

async function upsertCanvasIdentity(input: {
	userId: string;
	canvasBaseUrl: string;
	canvasUserId: string;
	label: string;
	displayName?: string;
	avatarUrl?: string;
}) {
	const [identity] = await db
		.insert(canvasIdentity)
		.values({
			id: randomUUID(),
			...input,
		})
		.onConflictDoUpdate({
			target: [
				canvasIdentity.userId,
				canvasIdentity.canvasBaseUrl,
				canvasIdentity.canvasUserId,
			],
			set: {
				label: input.label,
				...(input.displayName !== undefined
					? { displayName: input.displayName }
					: {}),
				...(input.avatarUrl !== undefined
					? { avatarUrl: input.avatarUrl }
					: {}),
				updatedAt: new Date(),
			},
		})
		.returning();
	if (!identity) {
		throw new Error("Canvas identity could not be saved.");
	}
	return identity;
}

function createIdentityKey(canvasBaseUrl: string, canvasUserId: string) {
	return `${canvasBaseUrl}:${canvasUserId}`;
}

async function findExistingConnection(userId: string, connectionId: string) {
	const [connection] = await db
		.select()
		.from(canvasConnection)
		.where(
			and(
				eq(canvasConnection.userId, userId),
				eq(canvasConnection.id, connectionId),
			),
		);
	return connection;
}

async function ensureExistingConnectionIdentity(
	row: typeof canvasConnection.$inferSelect,
) {
	if (row.canvasIdentityId) {
		const [identity] = await db
			.select({
				displayName: canvasIdentity.displayName,
				avatarUrl: canvasIdentity.avatarUrl,
			})
			.from(canvasIdentity)
			.where(eq(canvasIdentity.id, row.canvasIdentityId));
		if (
			!identity ||
			(identity.displayName && identity.avatarUrl) ||
			!row.encryptedAccessToken
		) {
			return row;
		}

		const response = await fetch(
			new URL("/api/v1/users/self/profile", row.canvasBaseUrl),
			{
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${decryptCanvasToken(row.encryptedAccessToken)}`,
				},
			},
		);
		if (!response.ok) return row;
		const profile = (await response.json()) as {
			name?: unknown;
			avatar_url?: unknown;
		};
		await db
			.update(canvasIdentity)
			.set({
				...(typeof profile.name === "string"
					? { displayName: profile.name }
					: {}),
				...(typeof profile.avatar_url === "string"
					? { avatarUrl: profile.avatar_url }
					: {}),
				updatedAt: new Date(),
			})
			.where(eq(canvasIdentity.id, row.canvasIdentityId));
		return row;
	}
	let canvasUserId = row.canvasUserId ?? undefined;
	let profileName: string | undefined;
	let profileAvatarUrl: string | undefined;
	if (!canvasUserId && row.encryptedAccessToken) {
		const response = await fetch(
			new URL("/api/v1/users/self/profile", row.canvasBaseUrl),
			{
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${decryptCanvasToken(row.encryptedAccessToken)}`,
				},
			},
		);
		if (response.ok) {
			const profile = (await response.json()) as {
				id?: unknown;
				name?: unknown;
				avatar_url?: unknown;
			};
			if (profile.id !== undefined && profile.id !== null) {
				canvasUserId = String(profile.id);
				profileName =
					typeof profile.name === "string" ? profile.name : undefined;
				profileAvatarUrl =
					typeof profile.avatar_url === "string"
						? profile.avatar_url
						: undefined;
			}
		}
	}
	if (!canvasUserId) return row;

	const identity = await upsertCanvasIdentity({
		userId: row.userId,
		canvasBaseUrl: row.canvasBaseUrl,
		canvasUserId,
		label: row.label || profileName || row.canvasBaseUrl,
		displayName: profileName,
		avatarUrl: profileAvatarUrl,
	});
	const [updated] = await db
		.update(canvasConnection)
		.set({ canvasIdentityId: identity.id, canvasUserId })
		.where(
			and(
				eq(canvasConnection.id, row.id),
				eq(canvasConnection.userId, row.userId),
			),
		)
		.returning();
	if (!updated) return row;
	const kind =
		updated.authMode === "canvas-session"
			? "browser-session"
			: updated.authMode;
	await db
		.insert(canvasCredential)
		.values({
			id: `${identity.id}:${kind}`,
			userId: updated.userId,
			canvasIdentityId: identity.id,
			canvasConnectionId: updated.id,
			kind,
			encryptedAccessToken: updated.encryptedAccessToken,
			status: "active",
			lastVerifiedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: canvasCredential.id,
			set: {
				canvasConnectionId: updated.id,
				...(updated.encryptedAccessToken
					? { encryptedAccessToken: updated.encryptedAccessToken }
					: {}),
				status: "active",
				lastVerifiedAt: new Date(),
			},
		});
	return updated;
}

function toApiConnection(
	row: typeof canvasConnection.$inferSelect,
	isActive = false,
	identity?: typeof canvasIdentity.$inferSelect,
) {
	return {
		id: row.id,
		connectionId: row.id,
		label: row.label,
		canvasBaseUrl: row.canvasBaseUrl,
		canvasUserId: row.canvasUserId ?? undefined,
		canvasIdentityId: row.canvasIdentityId ?? undefined,
		canvasUserName: identity?.displayName ?? undefined,
		canvasAvatarUrl: identity?.avatarUrl ?? undefined,
		authMode: row.authMode,
		isActive,
	};
}
