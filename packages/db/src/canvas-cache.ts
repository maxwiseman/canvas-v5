import type {
	CanvasRecordMetadata,
	CanvasSyncBatch,
	CanvasSyncRepository,
	CanvasSyncResult,
	NormalizedCanvasAssignment,
	NormalizedCanvasCourse,
} from "@canvas-v5/canvas-core";
import { and, asc, eq, isNull, ne } from "drizzle-orm";

import type { CanvasDb } from "./index";
import {
	canvasCachedAssignment,
	canvasCachedCourse,
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
		} else {
			await this.applyAssignments(
				batch as unknown as CanvasSyncBatch<NormalizedCanvasAssignment>,
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

	private async applyCourses(batch: CanvasSyncBatch<NormalizedCanvasCourse>) {
		const observedAt = new Date(batch.observedAt);
		await this.database.transaction(
			async (transaction) => {
				const [currentState] = await transaction
					.select({ observedAt: canvasSyncState.observedAt })
					.from(canvasSyncState)
					.where(
						and(
							eq(canvasSyncState.canvasIdentityId, batch.account.id),
							eq(canvasSyncState.scope, batch.scope),
							eq(canvasSyncState.scopeKey, batch.scopeKey ?? ""),
						),
					);
				if (
					currentState?.observedAt &&
					currentState.observedAt.getTime() > observedAt.getTime()
				) {
					return;
				}
				if (batch.records.length > 0) {
					await transaction
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
								generationId: batch.generationId,
								observedAt,
								deletedAt: null,
							},
						});

					for (const course of batch.records) {
						await transaction
							.update(canvasCachedCourse)
							.set({
								payload: course,
								contentHash: course.contentHash,
							})
							.where(
								and(
									eq(canvasCachedCourse.canvasIdentityId, batch.account.id),
									eq(canvasCachedCourse.canvasCourseId, course.id),
								),
							);
					}
				}

				await transaction
					.update(canvasCachedCourse)
					.set({ deletedAt: observedAt })
					.where(
						and(
							eq(canvasCachedCourse.canvasIdentityId, batch.account.id),
							ne(canvasCachedCourse.generationId, batch.generationId),
							isNull(canvasCachedCourse.deletedAt),
						),
					);
				await transaction
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
					});
			},
			{ isolationLevel: "serializable" },
		);
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
		await this.database.transaction(
			async (transaction) => {
				const [currentState] = await transaction
					.select({ observedAt: canvasSyncState.observedAt })
					.from(canvasSyncState)
					.where(
						and(
							eq(canvasSyncState.canvasIdentityId, batch.account.id),
							eq(canvasSyncState.scope, batch.scope),
							eq(canvasSyncState.scopeKey, batch.scopeKey ?? ""),
						),
					);
				if (
					currentState?.observedAt &&
					currentState.observedAt.getTime() > observedAt.getTime()
				) {
					return;
				}
				if (batch.records.length > 0) {
					await transaction
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
								generationId: batch.generationId,
								observedAt,
								deletedAt: null,
							},
						});

					for (const assignment of batch.records) {
						await transaction
							.update(canvasCachedAssignment)
							.set({
								payload: assignment,
								contentHash: assignment.contentHash,
								canvasUpdatedAt: optionalDate(assignment.updated_at),
							})
							.where(
								and(
									eq(canvasCachedAssignment.canvasIdentityId, batch.account.id),
									eq(canvasCachedAssignment.canvasCourseId, courseId),
									eq(canvasCachedAssignment.canvasAssignmentId, assignment.id),
								),
							);
					}
				}

				await transaction
					.update(canvasCachedAssignment)
					.set({ deletedAt: observedAt })
					.where(
						and(
							eq(canvasCachedAssignment.canvasIdentityId, batch.account.id),
							eq(canvasCachedAssignment.canvasCourseId, courseId),
							ne(canvasCachedAssignment.generationId, batch.generationId),
							isNull(canvasCachedAssignment.deletedAt),
						),
					);
				await transaction
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
					});
			},
			{ isolationLevel: "serializable" },
		);
	}
}

function optionalDate(value: unknown) {
	if (typeof value !== "string") return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}
