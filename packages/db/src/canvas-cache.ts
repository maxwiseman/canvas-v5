import type {
	CanvasRecordMetadata,
	CanvasSyncBatch,
	CanvasSyncRepository,
	CanvasSyncResult,
	NormalizedCanvasAssignment,
	NormalizedCanvasCourse,
	NormalizedCanvasResource,
} from "@canvas-v5/canvas-core";
import { and, asc, eq, isNull, lte, ne, or, sql } from "drizzle-orm";

import type { CanvasDb } from "./index";
import {
	canvasCachedAssignment,
	canvasCachedCourse,
	canvasCachedResource,
	canvasSyncState,
} from "./schema/canvas";

export class PostgresCanvasRepository implements CanvasSyncRepository {
	constructor(
		private readonly database: CanvasDb,
		private readonly userId: string,
	) {}

	async applySnapshot<T extends CanvasRecordMetadata>(
		batch: CanvasSyncBatch<T>,
	): Promise<CanvasSyncResult> {
		if (batch.scope === "courses") {
			await this.applyCourses(
				batch as unknown as CanvasSyncBatch<NormalizedCanvasCourse>,
			);
		} else if (batch.scope === "assignments") {
			await this.applyAssignments(
				batch as unknown as CanvasSyncBatch<NormalizedCanvasAssignment>,
			);
		} else {
			await this.applyResources(
				batch as unknown as CanvasSyncBatch<NormalizedCanvasResource>,
			);
		}

		return {
			scope: batch.scope,
			scopeKey: batch.scopeKey,
			generationId: batch.generationId,
			observedAt: batch.observedAt,
			recordCount: batch.records.length,
		};
	}

	async listCourses(canvasIdentityId: string) {
		const rows = await this.database
			.select({ payload: canvasCachedCourse.payload })
			.from(canvasCachedCourse)
			.where(
				and(
					eq(canvasCachedCourse.userId, this.userId),
					eq(canvasCachedCourse.canvasIdentityId, canvasIdentityId),
					isNull(canvasCachedCourse.deletedAt),
				),
			)
			.orderBy(asc(canvasCachedCourse.canvasCourseId));
		return rows.map((row) => row.payload);
	}

	async listAssignments(canvasIdentityId: string, courseId?: number) {
		const conditions = [
			eq(canvasCachedAssignment.userId, this.userId),
			eq(canvasCachedAssignment.canvasIdentityId, canvasIdentityId),
			isNull(canvasCachedAssignment.deletedAt),
		];
		if (courseId !== undefined) {
			conditions.push(eq(canvasCachedAssignment.canvasCourseId, courseId));
		}
		const rows = await this.database
			.select({ payload: canvasCachedAssignment.payload })
			.from(canvasCachedAssignment)
			.where(and(...conditions))
			.orderBy(
				asc(canvasCachedAssignment.canvasCourseId),
				asc(canvasCachedAssignment.canvasAssignmentId),
			);
		return rows.map((row) => row.payload);
	}

	async getAssignment(
		canvasIdentityId: string,
		courseId: number,
		assignmentId: number,
	) {
		const [row] = await this.database
			.select({ payload: canvasCachedAssignment.payload })
			.from(canvasCachedAssignment)
			.where(
				and(
					eq(canvasCachedAssignment.userId, this.userId),
					eq(canvasCachedAssignment.canvasIdentityId, canvasIdentityId),
					eq(canvasCachedAssignment.canvasCourseId, courseId),
					eq(canvasCachedAssignment.canvasAssignmentId, assignmentId),
					isNull(canvasCachedAssignment.deletedAt),
				),
			);
		return row?.payload;
	}

	async listResources(canvasIdentityId: string, courseId?: number) {
		const conditions = [
			eq(canvasCachedResource.userId, this.userId),
			eq(canvasCachedResource.canvasIdentityId, canvasIdentityId),
			isNull(canvasCachedResource.deletedAt),
		];
		if (courseId !== undefined) {
			conditions.push(eq(canvasCachedResource.canvasCourseId, courseId));
		}
		const rows = await this.database
			.select({ payload: canvasCachedResource.payload })
			.from(canvasCachedResource)
			.where(and(...conditions))
			.orderBy(
				asc(canvasCachedResource.canvasCourseId),
				asc(canvasCachedResource.resourceType),
				asc(canvasCachedResource.canvasResourceId),
			);
		return rows.map((row) => row.payload);
	}

	private async applyCourses(batch: CanvasSyncBatch<NormalizedCanvasCourse>) {
		const observedAt = new Date(batch.observedAt);
		const expireMissing = this.database
			.update(canvasCachedCourse)
			.set({ deletedAt: observedAt })
			.where(
				and(
					eq(canvasCachedCourse.canvasIdentityId, batch.account.id),
					ne(canvasCachedCourse.generationId, batch.generationId),
					lte(canvasCachedCourse.observedAt, observedAt),
					isNull(canvasCachedCourse.deletedAt),
				),
			);
		const updateState = this.syncStateQuery(batch, observedAt);

		if (batch.records.length === 0) {
			await this.database.batch([expireMissing, updateState]);
			return;
		}

		const upsertCourses = this.database
			.insert(canvasCachedCourse)
			.values(
				batch.records.map((course) => ({
					id: `${batch.account.id}:${course.id}`,
					userId: this.userId,
					canvasIdentityId: batch.account.id,
					canvasCourseId: course.id,
					payload: course,
					contentHash: course.contentHash,
					generationId: batch.generationId,
					observedAt,
					deletedAt: null,
				})),
			)
			.onConflictDoUpdate({
				target: [
					canvasCachedCourse.canvasIdentityId,
					canvasCachedCourse.canvasCourseId,
				],
				set: {
					payload: sql`excluded.payload`,
					contentHash: sql`excluded.content_hash`,
					generationId: batch.generationId,
					observedAt,
					deletedAt: null,
				},
				setWhere: lte(canvasCachedCourse.observedAt, observedAt),
			});
		await this.database.batch([upsertCourses, expireMissing, updateState]);
	}

	private async applyAssignments(
		batch: CanvasSyncBatch<NormalizedCanvasAssignment>,
	) {
		const courseId = Number(batch.scopeKey);
		if (!Number.isFinite(courseId)) {
			throw new Error(
				"Assignment snapshots require a numeric course scope key.",
			);
		}
		const observedAt = new Date(batch.observedAt);
		const expireMissing = this.database
			.update(canvasCachedAssignment)
			.set({ deletedAt: observedAt })
			.where(
				and(
					eq(canvasCachedAssignment.canvasIdentityId, batch.account.id),
					eq(canvasCachedAssignment.canvasCourseId, courseId),
					ne(canvasCachedAssignment.generationId, batch.generationId),
					lte(canvasCachedAssignment.observedAt, observedAt),
					isNull(canvasCachedAssignment.deletedAt),
				),
			);
		const updateState = this.syncStateQuery(batch, observedAt);

		if (batch.records.length === 0) {
			await this.database.batch([expireMissing, updateState]);
			return;
		}

		const upsertAssignments = this.database
			.insert(canvasCachedAssignment)
			.values(
				batch.records.map((assignment) => ({
					id: `${batch.account.id}:${courseId}:${assignment.id}`,
					userId: this.userId,
					canvasIdentityId: batch.account.id,
					canvasCourseId: courseId,
					canvasAssignmentId: assignment.id,
					payload: assignment,
					contentHash: assignment.contentHash,
					canvasUpdatedAt: optionalDate(assignment.updated_at),
					generationId: batch.generationId,
					observedAt,
					deletedAt: null,
				})),
			)
			.onConflictDoUpdate({
				target: [
					canvasCachedAssignment.canvasIdentityId,
					canvasCachedAssignment.canvasCourseId,
					canvasCachedAssignment.canvasAssignmentId,
				],
				set: {
					payload: sql`excluded.payload`,
					contentHash: sql`excluded.content_hash`,
					canvasUpdatedAt: sql`excluded.canvas_updated_at`,
					generationId: batch.generationId,
					observedAt,
					deletedAt: null,
				},
				setWhere: lte(canvasCachedAssignment.observedAt, observedAt),
			});
		await this.database.batch([upsertAssignments, expireMissing, updateState]);
	}

	private async applyResources(
		batch: CanvasSyncBatch<NormalizedCanvasResource>,
	) {
		const courseId = Number(batch.scopeKey);
		if (!Number.isFinite(courseId)) {
			throw new Error("Resource snapshots require a numeric course scope key.");
		}
		const observedAt = new Date(batch.observedAt);
		const expireMissing = this.database
			.update(canvasCachedResource)
			.set({ deletedAt: observedAt })
			.where(
				and(
					eq(canvasCachedResource.canvasIdentityId, batch.account.id),
					eq(canvasCachedResource.canvasCourseId, courseId),
					ne(canvasCachedResource.generationId, batch.generationId),
					lte(canvasCachedResource.observedAt, observedAt),
					isNull(canvasCachedResource.deletedAt),
				),
			);
		const updateState = this.syncStateQuery(batch, observedAt);
		if (batch.records.length === 0) {
			await this.database.batch([expireMissing, updateState]);
			return;
		}
		const upsertResources = this.database
			.insert(canvasCachedResource)
			.values(
				batch.records.map((resource) => ({
					id: `${batch.account.id}:${resource.id}`,
					userId: this.userId,
					canvasIdentityId: batch.account.id,
					canvasCourseId: courseId,
					resourceType: resource.resourceType,
					canvasResourceId: resource.canvasResourceId,
					payload: resource,
					contentHash: resource.contentHash,
					canvasUpdatedAt: optionalDate(resource.updated_at),
					generationId: batch.generationId,
					observedAt,
					deletedAt: null,
				})),
			)
			.onConflictDoUpdate({
				target: [
					canvasCachedResource.canvasIdentityId,
					canvasCachedResource.canvasCourseId,
					canvasCachedResource.resourceType,
					canvasCachedResource.canvasResourceId,
				],
				set: {
					payload: sql`excluded.payload`,
					contentHash: sql`excluded.content_hash`,
					canvasUpdatedAt: sql`excluded.canvas_updated_at`,
					generationId: batch.generationId,
					observedAt,
					deletedAt: null,
				},
				setWhere: lte(canvasCachedResource.observedAt, observedAt),
			});
		await this.database.batch([upsertResources, expireMissing, updateState]);
	}

	private syncStateQuery(
		batch: CanvasSyncBatch<CanvasRecordMetadata>,
		observedAt: Date,
	) {
		return this.database
			.insert(canvasSyncState)
			.values({
				canvasIdentityId: batch.account.id,
				scope: batch.scope,
				scopeKey: batch.scopeKey ?? "",
				generationId: batch.generationId,
				status: "current",
				observedAt,
				lastError: null,
			})
			.onConflictDoUpdate({
				target: [
					canvasSyncState.canvasIdentityId,
					canvasSyncState.scope,
					canvasSyncState.scopeKey,
				],
				set: {
					generationId: batch.generationId,
					status: "current",
					observedAt,
					lastError: null,
				},
				setWhere: or(
					isNull(canvasSyncState.observedAt),
					lte(canvasSyncState.observedAt, observedAt),
				),
			});
	}
}

function optionalDate(value: unknown) {
	if (typeof value !== "string") return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}
