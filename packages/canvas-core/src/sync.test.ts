import { describe, expect, test } from "bun:test";

import { CanvasRequestError } from "./errors";
import {
	fetchNormalizedCourseResources,
	fetchNormalizedCourseSearchContent,
	syncCanvasSearchCache,
	syncCoursesAndAssignments,
} from "./sync";
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

describe("search resource sync", () => {
	test("fetches searchable bodies while keeping files metadata-only", async () => {
		const source: CanvasDataSource = {
			async paginatedRequest<T>(path: string) {
				if (path.includes("/pages?")) {
					return [{ page_id: 1, url: "welcome", title: "Welcome" }] as T[];
				}
				if (path.includes("/quizzes?")) {
					return [{ id: 2, title: "Quiz one" }] as T[];
				}
				if (path.includes("discussion_topics")) {
					return [{ id: 3, title: "Introductions", message: "Say hi" }] as T[];
				}
				if (path.includes("/files?")) {
					return [{ id: 4, display_name: "Syllabus.pdf", size: 1200 }] as T[];
				}
				return [{ id: 5, title: "News", message: "Class update" }] as T[];
			},
			async request<T>(path: string) {
				if (path.includes("/pages/")) {
					return {
						page_id: 1,
						url: "welcome",
						title: "Welcome",
						body: "<p>Detailed page content</p>",
					} as T;
				}
				if (path.includes("/quizzes/")) {
					return { id: 2, title: "Quiz one", description: "Quiz details" } as T;
				}
				return {
					view: [{ id: 6, user_name: "Student", message: "My post" }],
				} as T;
			},
		};

		const resources = await fetchNormalizedCourseResources(
			source,
			{ id: "account-1", baseUrl: "https://canvas.example.edu" },
			12,
			"2026-08-25T12:00:00.000Z",
		);

		expect(resources.find((item) => item.resourceType === "page")?.body).toBe(
			"<p>Detailed page content</p>",
		);
		expect(resources.find((item) => item.resourceType === "quiz")?.body).toBe(
			"Quiz details",
		);
		expect(
			resources.find((item) => item.resourceType === "discussion-entry")?.body,
		).toBe("My post");
		expect(
			resources.find((item) => item.resourceType === "file")?.body,
		).toBeNull();
	});

	test("treats unavailable resource collections as empty enrichment", async () => {
		const source: CanvasDataSource = {
			async paginatedRequest<T>(path: string) {
				if (path.includes("/pages?")) {
					throw new CanvasRequestError(404, path);
				}
				return [] as T[];
			},
			async request<T>() {
				return {} as T;
			},
		};

		await expect(
			fetchNormalizedCourseResources(
				source,
				{ id: "account-1", baseUrl: "https://canvas.example.edu" },
				263347,
			),
		).resolves.toEqual([]);
	});

	test("discovers linked pages from the home page when the Pages tab is disabled", async () => {
		const requestedPaths: string[] = [];
		const source: CanvasDataSource = {
			async paginatedRequest<T>(path: string) {
				requestedPaths.push(path);
				if (path.includes("/pages?")) {
					throw new CanvasRequestError(404, path);
				}
				return [] as T[];
			},
			async request<T>(path: string) {
				requestedPaths.push(path);
				if (path.endsWith("/front_page")) {
					return {
						page_id: 1,
						url: "home-page",
						title: "Home Page",
						body: '<a href="/courses/263259/pages/c-dot-1-6-kinematics">Class 1.6</a>',
					} as T;
				}
				return {
					page_id: 2611316,
					url: "c-dot-1-6-kinematics",
					title: "C.1.6 - Kinematics",
					body: "<p>Class 1.6 learning objectives</p>",
					html_url:
						"https://canvas.example.edu/courses/263259/pages/c-dot-1-6-kinematics",
				} as T;
			},
		};

		const resources = await fetchNormalizedCourseResources(
			source,
			{ id: "account-1", baseUrl: "https://canvas.example.edu" },
			263259,
			"2026-08-28T12:00:00.000Z",
		);

		expect(resources).toContainEqual(
			expect.objectContaining({
				resourceType: "page",
				canvasResourceId: "c-dot-1-6-kinematics",
				title: "C.1.6 - Kinematics",
				body: "<p>Class 1.6 learning objectives</p>",
			}),
		);
		expect(requestedPaths).toContain(
			"/api/v1/courses/263259/pages/c-dot-1-6-kinematics",
		);
	});

	test("drops inaccessible links instead of indexing placeholder resources", async () => {
		const source: CanvasDataSource = {
			async paginatedRequest<T>(path: string) {
				if (path.includes("/pages?")) throw new CanvasRequestError(404, path);
				return [] as T[];
			},
			async request<T>(path: string) {
				if (path.endsWith("/front_page")) {
					return {
						page_id: 1,
						url: "home-page",
						title: "Home Page",
						body: '<a href="/courses/263259/pages/instructor-only">Hidden</a>',
					} as T;
				}
				throw new CanvasRequestError(403, path);
			},
		};

		const resources = await fetchNormalizedCourseResources(
			source,
			{ id: "account-1", baseUrl: "https://canvas.example.edu" },
			263259,
		);

		expect(resources).toHaveLength(1);
		expect(resources[0]).toMatchObject({
			resourceType: "page",
			canvasResourceId: "home-page",
		});
	});

	test("crawls linked resources through the shared normalization pipeline", async () => {
		const requestedPaths: string[] = [];
		const source: CanvasDataSource = {
			async paginatedRequest<T>(path: string) {
				requestedPaths.push(path);
				if (path.includes("/assignments?")) {
					return [
						{
							id: 17,
							name: "Practice",
							description:
								'<a href="/courses/263259/pages/c-dot-1-6-kinematics">Kinematics</a>',
						},
					] as T[];
				}
				if (path.includes("/pages?")) {
					throw new CanvasRequestError(404, path);
				}
				return [] as T[];
			},
			async request<T>(path: string) {
				requestedPaths.push(path);
				if (path.endsWith("/front_page")) {
					return {
						page_id: 1,
						url: "home-page",
						title: "Home Page",
						body: [
							'<a href="/courses/263259/pages/c-dot-1-6-kinematics">Class 1.6</a>',
							'<a href="/courses/263259/quizzes/22">Quiz</a>',
							'<a href="/courses/263259/discussion_topics/33">Discussion</a>',
							'<a href="/courses/263259/files/44">Notes</a>',
							'<a href="/courses/263259/assignments/18">Homework</a>',
						].join(""),
					} as T;
				}
				if (path.endsWith("/pages/c-dot-1-6-kinematics")) {
					return {
						page_id: 2,
						url: "c-dot-1-6-kinematics",
						title: "C.1.6 - Kinematics",
						body: '<a href="/courses/263259/pages/position">Position</a>',
					} as T;
				}
				if (path.endsWith("/pages/position")) {
					return {
						page_id: 3,
						url: "position",
						title: "Position",
						body: "Position is a vector quantity.",
					} as T;
				}
				if (path.endsWith("/quizzes/22")) {
					return { id: 22, title: "Kinematics Quiz", description: "Quiz" } as T;
				}
				if (path.endsWith("/discussion_topics/33/view")) {
					return { view: [] } as T;
				}
				if (path.endsWith("/discussion_topics/33")) {
					return { id: 33, title: "Kinematics", message: "Discuss" } as T;
				}
				if (path.endsWith("/files/44")) {
					return { id: 44, display_name: "Notes.pdf", size: 100 } as T;
				}
				if (path.endsWith("/assignments/18")) {
					return { id: 18, name: "Homework", description: "Linked work" } as T;
				}
				return {} as T;
			},
		};

		const content = await fetchNormalizedCourseSearchContent(
			source,
			{ id: "account-1", baseUrl: "https://canvas.example.edu" },
			263259,
			"2026-08-28T12:00:00.000Z",
		);

		expect(
			content.assignments.map((assignment) => assignment.id).sort(),
		).toEqual([17, 18]);
		expect(
			content.resources.map(
				(resource) => `${resource.resourceType}:${resource.canvasResourceId}`,
			),
		).toEqual(
			expect.arrayContaining([
				"page:home-page",
				"page:c-dot-1-6-kinematics",
				"page:position",
				"quiz:22",
				"discussion:33",
				"file:44",
			]),
		);
		expect(requestedPaths).toContain(
			"/api/v1/courses/263259/pages/c-dot-1-6-kinematics",
		);
		expect(requestedPaths).toContain("/api/v1/courses/263259/assignments/18");
	});

	test("reuses enumerated records when crawled links identify the same resource", async () => {
		const detailPaths: string[] = [];
		const source: CanvasDataSource = {
			async paginatedRequest<T>(path: string) {
				if (path.includes("/pages?")) {
					throw new CanvasRequestError(404, path);
				}
				if (path.includes("/quizzes?")) {
					return [
						{ id: 22, title: "Kinematics Quiz", description: "Ready" },
					] as T[];
				}
				return [] as T[];
			},
			async request<T>(path: string) {
				detailPaths.push(path);
				if (path.endsWith("/front_page")) {
					return {
						page_id: 1,
						url: "home-page",
						title: "Home Page",
						body: '<a href="/courses/263259/quizzes/22">Quiz</a>',
					} as T;
				}
				return {} as T;
			},
		};

		const resources = await fetchNormalizedCourseResources(
			source,
			{ id: "account-1", baseUrl: "https://canvas.example.edu" },
			263259,
		);

		expect(
			resources.filter(
				(resource) =>
					resource.resourceType === "quiz" &&
					resource.canvasResourceId === "22",
			),
		).toHaveLength(1);
		expect(detailPaths).not.toContain("/api/v1/courses/263259/quizzes/22");
	});

	test("does not hide resource collection server failures", async () => {
		const source: CanvasDataSource = {
			async paginatedRequest<T>(path: string) {
				if (path.includes("/pages?")) {
					throw new CanvasRequestError(500, path);
				}
				return [] as T[];
			},
			async request<T>() {
				return {} as T;
			},
		};

		await expect(
			fetchNormalizedCourseResources(
				source,
				{ id: "account-1", baseUrl: "https://canvas.example.edu" },
				263347,
			),
		).rejects.toMatchObject({ status: 500 });
	});

	test("commits assignments when a course Pages collection returns 404", async () => {
		const batches: CanvasSyncBatch<CanvasRecordMetadata>[] = [];
		const source: CanvasDataSource = {
			async paginatedRequest<T>(path: string) {
				if (path.startsWith("/api/v1/courses?")) {
					return [{ id: 263347, name: "COSC 101" }] as T[];
				}
				if (path.includes("/assignments?")) {
					return [{ id: 17, name: "Practice" }] as T[];
				}
				if (path.includes("/pages?")) {
					throw new CanvasRequestError(404, path);
				}
				return [] as T[];
			},
			async request<T>() {
				return {} as T;
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

		await syncCanvasSearchCache({
			source,
			repository,
			account: {
				id: "account-1",
				baseUrl: "https://canvas.example.edu",
			},
			observedAt: "2026-08-26T12:00:00.000Z",
			generationId: "generation-1",
		});

		expect(batches.map((batch) => batch.scope)).toEqual([
			"courses",
			"assignments",
			"resources",
		]);
		expect(batches[1]?.records).toHaveLength(1);
		expect(batches[1]?.records[0]).toMatchObject({
			id: 17,
			course_id: 263347,
		});
	});
});
