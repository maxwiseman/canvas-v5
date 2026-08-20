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

const optionalCanvasBooleanSchema = z.preprocess((value) => {
	if (value === null || value === undefined || value === "") return undefined;
	if (value === true || value === 1 || value === "1" || value === "true") {
		return true;
	}
	if (value === false || value === 0 || value === "0" || value === "false") {
		return false;
	}
	return value;
}, z.boolean().optional());

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
		html_url: z.string().optional(),
		points_possible: z.number().nullable().optional(),
		published: z.boolean().optional(),
		workflow_state: z.string().optional(),
		omit_from_final_grade: z.boolean().optional(),
		submission_types: z.array(z.string()).optional(),
		allowed_extensions: z.array(z.string()).optional(),
		allowed_attempts: z.number().int().optional(),
		due_date_required: z.boolean().optional(),
		only_visible_to_overrides: z.boolean().optional(),
		locked_for_user: z.boolean().optional(),
		can_submit: z.boolean().optional(),
		has_overrides: z.boolean().optional(),
		all_dates: z
			.array(
				z.object({
					id: z.number().int().optional(),
					base: z.boolean().optional(),
					title: z.string().optional(),
					due_at: z.string().nullable().optional(),
					unlock_at: z.string().nullable().optional(),
					lock_at: z.string().nullable().optional(),
				}),
			)
			.nullable()
			.optional(),
		rubric_settings: z.record(z.string(), z.unknown()).optional(),
		rubric: z.unknown().optional(),
		submission: z
			.object({
				workflow_state: z.string().optional(),
				submitted_at: z.string().nullable().optional(),
				missing: optionalCanvasBooleanSchema,
				late: optionalCanvasBooleanSchema,
				excused: optionalCanvasBooleanSchema,
				graded: optionalCanvasBooleanSchema,
				score: z.number().nullable().optional(),
				grade: z.string().nullable().optional(),
			})
			.nullable()
			.optional(),
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
		id: assignment.id,
		course_id: courseId,
		name: assignment.name,
		description: assignment.description ?? null,
		created_at: assignment.created_at,
		updated_at: assignment.updated_at,
		due_at: assignment.due_at ?? null,
		lock_at: assignment.lock_at ?? null,
		unlock_at: assignment.unlock_at ?? null,
		html_url: assignment.html_url,
		points_possible: assignment.points_possible,
		published: assignment.published,
		workflow_state: assignment.workflow_state,
		omit_from_final_grade: assignment.omit_from_final_grade,
		submission_types: assignment.submission_types,
		allowed_extensions: assignment.allowed_extensions,
		allowed_attempts: assignment.allowed_attempts,
		due_date_required: assignment.due_date_required,
		only_visible_to_overrides: assignment.only_visible_to_overrides,
		locked_for_user: assignment.locked_for_user,
		can_submit: assignment.can_submit,
		has_overrides: assignment.has_overrides,
		all_dates: assignment.all_dates,
		rubric_settings: assignment.rubric_settings,
		rubric: assignment.rubric,
		submission: assignment.submission,
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
