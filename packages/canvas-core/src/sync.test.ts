import { describe, expect, test } from "bun:test";

import { syncCoursesAndAssignments } from "./sync";
import type {
	CanvasDataSource,
	CanvasRecordMetadata,
	CanvasSyncBatch,
	CanvasSyncRepository,
} from "./types";

describe("headless Canvas sync", () => {
	test("uses one source and repository contract for courses and assignments", async () => {
		const batches: CanvasSyncBatch<CanvasRecordMetadata>[] = [];
		const requestedPaths: string[] = [];
		const source: CanvasDataSource = {
			async request<T>() {
				return {} as T;
			},
			async paginatedRequest<T>(path: string) {
				requestedPaths.push(path);
				if (path.startsWith("/api/v1/courses?")) {
					return [{ id: 12, name: "Biology" }] as T[];
				}
				return [{ id: 34, name: "Lab report", description: "Write it" }] as T[];
			},
		};
		const repository: CanvasSyncRepository = {
			async applySnapshot<T extends CanvasRecordMetadata>(
				batch: CanvasSyncBatch<T>,
			) {
				batches.push(batch);
				return {
					scope: batch.scope,
					scopeKey: batch.scopeKey,
					generationId: batch.generationId,
					observedAt: batch.observedAt,
					recordCount: batch.records.length,
				};
			},
		};

		await syncCoursesAndAssignments({
			source,
			repository,
			account: {
				id: "account-1",
				baseUrl: "https://canvas.example.edu",
			},
			observedAt: "2026-08-19T12:00:00.000Z",
			generationId: "generation-1",
		});

		expect(batches.map((batch) => batch.scope)).toEqual([
			"courses",
			"assignments",
		]);
		expect(batches[1]?.scopeKey).toBe("12");
		expect(batches[1]?.records[0]?.canvasAccountId).toBe("account-1");
		expect(requestedPaths[1]).toContain("include[]=submission");
		expect(requestedPaths[1]).toContain("override_assignment_dates=true");
	});
});
