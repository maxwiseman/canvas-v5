import { z } from "zod";

import type {
	CanvasAccountRef,
	NormalizedCanvasAssignment,
	NormalizedCanvasCourse,
} from "./types";

const courseDefaultViewSchema = z.enum([
	"feed",
	"wiki",
	"modules",
	"assignments",
	"syllabus",
]);

const canvasCourseSchema = z
	.object({
		id: z.coerce.number().int(),
		name: z.string().optional(),
		course_code: z.string().optional(),
		default_view: courseDefaultViewSchema.optional(),
		syllabus_body: z.string().nullable().optional(),
		workflow_state: z.string().optional(),
		start_at: z.string().nullable().optional(),
		end_at: z.string().nullable().optional(),
		enrollment_term_id: z.coerce.number().int().optional(),
	})
	.passthrough();

const canvasAssignmentSchema = z
	.object({
		id: z.coerce.number().int(),
		name: z.string(),
		description: z.string().nullable().optional(),
		created_at: z.string().optional(),
		updated_at: z.string().optional(),
		due_at: z.string().nullable().optional(),
		lock_at: z.string().nullable().optional(),
		unlock_at: z.string().nullable().optional(),
	})
	.passthrough();

export async function normalizeCanvasCourse(
	payload: unknown,
	account: CanvasAccountRef,
	observedAt: string,
): Promise<NormalizedCanvasCourse> {
	const course = canvasCourseSchema.parse(payload);
	const normalized = {
		id: course.id,
		name: course.name ?? "Untitled course",
		course_code: course.course_code,
		default_view: course.default_view,
		syllabus_body: course.syllabus_body ?? null,
		workflow_state: course.workflow_state,
		start_at: course.start_at ?? null,
		end_at: course.end_at ?? null,
		enrollment_term_id: course.enrollment_term_id,
	};

	return {
		...normalized,
		canvasAccountId: account.id,
		observedAt,
		contentHash: await hashCanvasRecord(normalized),
	};
}

export async function normalizeCanvasAssignment(
	payload: unknown,
	account: CanvasAccountRef,
	courseId: number,
	observedAt: string,
): Promise<NormalizedCanvasAssignment> {
	const assignment = canvasAssignmentSchema.parse(payload);
	const normalized = {
		...assignment,
		id: assignment.id,
		course_id: courseId,
		name: assignment.name,
	};

	return {
		...normalized,
		canvasAccountId: account.id,
		observedAt,
		contentHash: await hashCanvasRecord(normalized),
	};
}

export async function hashCanvasRecord(value: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(stableStringify(value));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

export function stableStringify(value: unknown): string {
	return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortJsonValue);
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([, child]) => child !== undefined)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, sortJsonValue(child)]),
		);
	}
	return value;
}
