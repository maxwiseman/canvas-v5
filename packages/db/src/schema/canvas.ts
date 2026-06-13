import { relations } from "drizzle-orm";
import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const canvasConnection = pgTable(
	"canvas_connection",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		canvasBaseUrl: text("canvas_base_url").notNull(),
		canvasUserId: text("canvas_user_id"),
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
	(table) => [index("canvas_connection_user_id_idx").on(table.userId)],
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
		icon: text("icon"),
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
