import { expect, test } from "bun:test";
import {
	type CanvasAppCache,
	canvasAppRequestUrl,
	readCanvasAppCache,
} from "./canvas-app-cache";

const metadata = {
	canvasAccountId: "a",
	observedAt: "2026-09-29T00:00:00Z",
	contentHash: "h",
};
const cache: CanvasAppCache = {
	courses: [{ ...metadata, id: 10, name: "Physics" }],
	assignments: [
		{
			...metadata,
			id: 3,
			course_id: 10,
			name: "Lab",
			submission: {
				workflow_state: "submitted",
				submitted_at: "2026-09-28T00:00:00Z",
			},
		},
	],
	resources: [
		{
			...metadata,
			id: "10:page:intro",
			course_id: 10,
			resourceType: "page",
			canvasResourceId: "intro",
			title: "Introduction",
			body: "<p>Course notes</p>",
			metadata: { page_id: 42, front_page: true },
		},
	],
	calendar: [
		{ ...metadata, id: "1", title: "Exam", context_code: "course_10" },
		{ ...metadata, id: "2", title: "Other exam", context_code: "course_20" },
	],
};

test("Canvas request paths and pagination cannot escape the API origin", () => {
	for (const path of [
		"https://evil.example/api/v1/courses",
		"//evil.example/api/v1/courses",
		"/api/v1/../../login",
		"/api/v1/%2e%2e/login",
		"/api/v1/courses%2f..%2f..",
		"/api/v1/courses#fragment",
		"/api/v1/\\evil",
	]) {
		expect(() =>
			canvasAppRequestUrl(path, "https://school.instructure.com"),
		).toThrow();
	}
	expect(
		canvasAppRequestUrl(
			"/api/v1/courses?per_page=100",
			"https://school.instructure.com",
		).origin,
	).toBe("https://school.instructure.com");
});

test("session cache exposes assignment submissions and full page bodies", () => {
	expect(
		readCanvasAppCache(
			"/api/v1/courses/10/assignments/3/submissions/self",
			cache,
		),
	).toMatchObject({ assignment_id: 3, workflow_state: "submitted" });
	expect(
		readCanvasAppCache("/api/v1/courses/10/pages/intro", cache),
	).toMatchObject({ page_id: 42, body: "<p>Course notes</p>", url: "intro" });
	expect(
		readCanvasAppCache("/api/v1/courses/10/front_page", cache),
	).toMatchObject({ title: "Introduction" });
});

test("calendar respects requested courses and unavailable views are not empty successes", () => {
	expect(
		readCanvasAppCache(
			"/api/v1/calendar_events?context_codes[]=course_10",
			cache,
		),
	).toHaveLength(1);
	expect(() => readCanvasAppCache("/api/v1/courses/10/modules", cache)).toThrow(
		"API-token connection",
	);
	expect(() =>
		readCanvasAppCache("/api/v1/courses/20/assignments/3", cache),
	).toThrow("not in the Canvas cache");
});
