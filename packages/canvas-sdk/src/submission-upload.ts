import type { CanvasTransport } from "./types";

/** Canvas authorizes the upload; only its signed form is sent to file storage. */
export async function uploadSubmissionFile(
	transport: CanvasTransport,
	courseId: number,
	assignmentId: number,
	file: File,
	canvasBaseUrl: string,
): Promise<number> {
	return uploadCanvasFile(
		transport,
		`/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/self/files`,
		file,
		canvasBaseUrl,
	);
}

export async function uploadCanvasFile(
	transport: CanvasTransport,
	path: string,
	file: File,
	canvasBaseUrl: string,
): Promise<number> {
	const upload = await transport.request<{
		upload_url: string;
		upload_params: Record<string, string>;
	}>(path, {
		method: "POST",
		body: {
			name: file.name,
			size: file.size,
			content_type: file.type || "application/octet-stream",
			on_duplicate: "rename",
		},
	});
	if (!upload?.upload_url || !upload.upload_params) {
		throw new Error("Canvas did not authorize this file upload.");
	}
	const destination = new URL(upload.upload_url);
	if (destination.protocol !== "https:")
		throw new Error("Canvas returned an insecure upload URL.");
	const form = new FormData();
	for (const [key, value] of Object.entries(upload.upload_params))
		form.append(key, value);
	// Canvas requires the file to be the last part of the signed multipart form.
	form.append("file", file, file.name);
	const response = await fetch(destination, {
		method: "POST",
		body: form,
		credentials: "same-origin",
	});
	// Fetch follows 3xx automatically. A 201 may instead expose a confirmation
	// Location; authenticate that final Canvas API read through the same transport.
	const confirmationLocation =
		response.headers.get("Location") ??
		(response.redirected ? response.url : undefined);
	let saved: { id?: number };
	if (confirmationLocation) {
		const confirmation = new URL(
			confirmationLocation,
			response.url || destination,
		);
		if (
			confirmation.origin !== new URL(canvasBaseUrl).origin ||
			!confirmation.pathname.startsWith("/api/v1/")
		) {
			throw new Error("Canvas returned an unexpected upload confirmation URL.");
		}
		saved = await transport.request<{ id?: number }>(
			`${confirmation.pathname}${confirmation.search}`,
		);
	} else {
		if (!response.ok)
			throw new Error(`Unable to upload ${file.name} (${response.status}).`);
		saved = (await response.json()) as { id?: number };
	}
	if (!Number.isSafeInteger(saved.id) || (saved.id ?? 0) <= 0) {
		throw new Error(`Canvas did not confirm the upload of ${file.name}.`);
	}
	return saved.id as number;
}
