import type {
	IconId,
	NormalizedCanvasAssignment,
	NormalizedCanvasCourse,
} from "@canvas-v5/canvas-core";
import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const canvasIdentity = pgTable(
	"canvas_identity",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		canvasBaseUrl: text("canvas_base_url").notNull(),
		canvasUserId: text("canvas_user_id").notNull(),
		label: text("label").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("canvas_identity_user_id_idx").on(table.userId),
		uniqueIndex("canvas_identity_user_canvas_unique_idx").on(
			table.userId,
			table.canvasBaseUrl,
			table.canvasUserId,
		),
	],
);

export const canvasConnection = pgTable(
	"canvas_connection",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		canvasBaseUrl: text("canvas_base_url").notNull(),
		canvasUserId: text("canvas_user_id"),
		canvasIdentityId: text("canvas_identity_id").references(
			() => canvasIdentity.id,
			{ onDelete: "set null" },
		),
		label: text("label").notNull(),
		encryptedAccessToken: text("encrypted_access_token"),
		authMode: text("auth_mode", {
			enum: ["canvas-session", "api-token", "oauth"],
		}).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("canvas_connection_user_id_idx").on(table.userId),
		index("canvas_connection_identity_id_idx").on(table.canvasIdentityId),
	],
);

export const canvasCredential = pgTable(
	"canvas_credential",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		canvasIdentityId: text("canvas_identity_id")
			.notNull()
			.references(() => canvasIdentity.id, { onDelete: "cascade" }),
		canvasConnectionId: text("canvas_connection_id").references(
			() => canvasConnection.id,
			{ onDelete: "set null" },
		),
		kind: text("kind", {
			enum: ["browser-session", "api-token", "oauth"],
		}).notNull(),
		encryptedAccessToken: text("encrypted_access_token"),
		encryptedRefreshToken: text("encrypted_refresh_token"),
		scopes: jsonb("scopes").$type<string[]>(),
		status: text("status", {
			enum: ["active", "error", "revoked"],
		})
			.default("active")
			.notNull(),
		expiresAt: timestamp("expires_at"),
		lastVerifiedAt: timestamp("last_verified_at"),
		lastError: text("last_error"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("canvas_credential_identity_id_idx").on(table.canvasIdentityId),
		index("canvas_credential_user_id_idx").on(table.userId),
		uniqueIndex("canvas_credential_connection_kind_unique_idx").on(
			table.canvasConnectionId,
			table.kind,
		),
	],
);

export const canvasCachedCourse = pgTable(
	"canvas_cached_course",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		canvasIdentityId: text("canvas_identity_id")
			.notNull()
			.references(() => canvasIdentity.id, { onDelete: "cascade" }),
		canvasCourseId: integer("canvas_course_id").notNull(),
		payload: jsonb("payload").$type<NormalizedCanvasCourse>().notNull(),
		contentHash: text("content_hash").notNull(),
		generationId: text("generation_id").notNull(),
		observedAt: timestamp("observed_at").notNull(),
		deletedAt: timestamp("deleted_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("canvas_cached_course_identity_course_unique_idx").on(
			table.canvasIdentityId,
			table.canvasCourseId,
		),
		index("canvas_cached_course_user_id_idx").on(table.userId),
	],
);

export const canvasCachedAssignment = pgTable(
	"canvas_cached_assignment",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		canvasIdentityId: text("canvas_identity_id")
			.notNull()
			.references(() => canvasIdentity.id, { onDelete: "cascade" }),
		canvasCourseId: integer("canvas_course_id").notNull(),
		canvasAssignmentId: integer("canvas_assignment_id").notNull(),
		payload: jsonb("payload").$type<NormalizedCanvasAssignment>().notNull(),
		contentHash: text("content_hash").notNull(),
		canvasUpdatedAt: timestamp("canvas_updated_at"),
		generationId: text("generation_id").notNull(),
		observedAt: timestamp("observed_at").notNull(),
		deletedAt: timestamp("deleted_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("canvas_cached_assignment_identity_assignment_unique_idx").on(
			table.canvasIdentityId,
			table.canvasCourseId,
			table.canvasAssignmentId,
		),
		index("canvas_cached_assignment_course_idx").on(
			table.canvasIdentityId,
			table.canvasCourseId,
		),
		index("canvas_cached_assignment_user_id_idx").on(table.userId),
	],
);

export const canvasSyncState = pgTable(
	"canvas_sync_state",
	{
		canvasIdentityId: text("canvas_identity_id")
			.notNull()
			.references(() => canvasIdentity.id, { onDelete: "cascade" }),
		scope: text("scope").notNull(),
		scopeKey: text("scope_key").default("").notNull(),
		generationId: text("generation_id").notNull(),
		status: text("status", {
			enum: ["syncing", "current", "error"],
		}).notNull(),
		observedAt: timestamp("observed_at"),
		lastError: text("last_error"),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.canvasIdentityId, table.scope, table.scopeKey],
		}),
	],
);

export const canvasDevice = pgTable(
	"canvas_device",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		label: text("label"),
		pushSubscription: jsonb("push_subscription").$type<{
			endpoint: string;
			expirationTime?: number | null;
			keys: { p256dh: string; auth: string };
		}>(),
		pushEnabled: boolean("push_enabled").default(false).notNull(),
		lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("canvas_device_user_id_idx").on(table.userId)],
);

export const canvasSyncRequest = pgTable(
	"canvas_sync_request",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		canvasIdentityId: text("canvas_identity_id")
			.notNull()
			.references(() => canvasIdentity.id, { onDelete: "cascade" }),
		scope: text("scope").default("assignments").notNull(),
		reason: text("reason").notNull(),
		status: text("status", {
			enum: ["pending", "claimed", "complete", "error"],
		})
			.default("pending")
			.notNull(),
		claimedByDeviceId: text("claimed_by_device_id").references(
			() => canvasDevice.id,
			{ onDelete: "set null" },
		),
		leaseExpiresAt: timestamp("lease_expires_at"),
		requestedAt: timestamp("requested_at").defaultNow().notNull(),
		completedAt: timestamp("completed_at"),
		lastError: text("last_error"),
	},
	(table) => [
		index("canvas_sync_request_identity_status_idx").on(
			table.canvasIdentityId,
			table.status,
		),
		index("canvas_sync_request_user_id_idx").on(table.userId),
	],
);

export const canvasMcpToken = pgTable(
	"canvas_mcp_token",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		tokenHash: text("token_hash").notNull().unique(),
		lastUsedAt: timestamp("last_used_at"),
		revokedAt: timestamp("revoked_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("canvas_mcp_token_user_id_idx").on(table.userId)],
);

export const canvasCourseOverlay = pgTable(
	"canvas_course_overlay",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		canvasConnectionId: text("canvas_connection_id")
			.notNull()
			.references(() => canvasConnection.id, { onDelete: "cascade" }),
		canvasCourseId: integer("canvas_course_id").notNull(),
		icon: text("icon").$type<IconId | null>(),
		hiddenTabIds: jsonb("hidden_tab_ids")
			.$type<string[]>()
			.default([])
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("canvas_course_overlay_user_id_idx").on(table.userId),
		index("canvas_course_overlay_connection_id_idx").on(
			table.canvasConnectionId,
		),
		uniqueIndex("canvas_course_overlay_target_unique_idx").on(
			table.userId,
			table.canvasConnectionId,
			table.canvasCourseId,
		),
	],
);

export const canvasAssignmentComment = pgTable(
	"canvas_assignment_comment",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		canvasDomain: text("canvas_domain").notNull(),
		canvasCourseId: integer("canvas_course_id").notNull(),
		canvasAssignmentId: integer("canvas_assignment_id").notNull(),
		content: text("content").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("canvas_assignment_comment_target_idx").on(
			table.userId,
			table.canvasDomain,
			table.canvasCourseId,
			table.canvasAssignmentId,
			table.createdAt,
		),
	],
);

export const canvasConnectionRelations = relations(
	canvasConnection,
	({ one }) => ({
		user: one(user, {
			fields: [canvasConnection.userId],
			references: [user.id],
		}),
	}),
);

export const canvasCourseOverlayRelations = relations(
	canvasCourseOverlay,
	({ one }) => ({
		user: one(user, {
			fields: [canvasCourseOverlay.userId],
			references: [user.id],
		}),
		connection: one(canvasConnection, {
			fields: [canvasCourseOverlay.canvasConnectionId],
			references: [canvasConnection.id],
		}),
	}),
);

export const canvasAssignmentCommentRelations = relations(
	canvasAssignmentComment,
	({ one }) => ({
		user: one(user, {
			fields: [canvasAssignmentComment.userId],
			references: [user.id],
		}),
	}),
);
