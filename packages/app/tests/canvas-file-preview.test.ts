import { describe, expect, test } from "bun:test";
import type { CanvasFile } from "@canvas-v5/canvas-sdk";
import {
	getCanvasDocumentPreviewUrl,
	isCanvasOfficeDocument,
} from "../src/components/canvas-file-preview";

const baseFile: CanvasFile = {
	id: 99,
	course_id: 42,
	display_name: "Course resource.docx",
};

describe("Canvas Office file previews", () => {
	test("recognizes DOCX, PPTX, and XLSX files", () => {
		expect(isCanvasOfficeDocument(baseFile)).toBe(true);
		expect(
			isCanvasOfficeDocument({
				...baseFile,
				display_name: "Slides",
				content_type:
					"application/vnd.openxmlformats-officedocument.presentationml.presentation",
			}),
		).toBe(true);
		expect(
			isCanvasOfficeDocument({
				...baseFile,
				display_name: "Grades.XLSX",
			}),
		).toBe(true);
		expect(
			isCanvasOfficeDocument({
				...baseFile,
				display_name: "Reference.pdf",
			}),
		).toBe(false);
	});

	test("uses Canvas's native preview only on the active Canvas origin", () => {
		expect(
			getCanvasDocumentPreviewUrl(
				baseFile,
				"https://school.instructure.com",
				"https://school.instructure.com",
			),
		).toBe(
			"https://school.instructure.com/courses/42/files/99/preview?canvas_v5_native=1",
		);

		expect(
			getCanvasDocumentPreviewUrl(
				baseFile,
				"https://school.instructure.com",
				"https://canvas-v5.example.com",
			),
		).toBeUndefined();
	});
});
