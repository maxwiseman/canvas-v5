import { describe, expect, test } from "bun:test";
import { inferCourseIconId, resolveCourseIconId } from "../src/lib/course-icon";

describe("course icons", () => {
	test("infers common subjects from course codes", () => {
		expect(inferCourseIconId("BIO-101")).toBe("microscope");
		expect(inferCourseIconId("MATH 141 - Calculus I")).toBe("calculator");
		expect(inferCourseIconId("2026-SPRING-COSC101")).toBe("code");
		expect(inferCourseIconId("EF 151")).toBe("wrench");
		expect(inferCourseIconId("SPAN-201")).toBe("languages");
	});

	test("falls back to a book for unknown or missing codes", () => {
		expect(inferCourseIconId("UH-207")).toBe("book");
		expect(inferCourseIconId()).toBe("book");
	});

	test("always prefers an explicitly saved icon", () => {
		expect(resolveCourseIconId("star", "BIO-101")).toBe("star");
		expect(resolveCourseIconId(undefined, "BIO-101")).toBe("microscope");
	});
});
