import { afterEach, describe, expect, test } from "bun:test";
import {
	uploadCanvasFile,
	uploadSubmissionFile,
} from "../src/submission-upload";
import type { CanvasTransport } from "../src/types";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
function transport(result: unknown, requests: unknown[] = []): CanvasTransport {
	return {
		mode: "mock",
		probeAuth: async () => ({ status: "unauthenticated" }),
		paginatedRequest: async () => [],
		request: async <T>(path: string, options: unknown) => {
			requests.push({ path, options });
			return result as T;
		},
	};
}
describe("Canvas submission file upload", () => {
	test("authorizes with the submission endpoint, sends signed fields before file without app credentials, and returns the confirmed ID", async () => {
		const requests: unknown[] = [];
		const file = new File(["essay"], "essay.pdf", { type: "application/pdf" });
		globalThis.fetch = (async (url, options) => {
			expect(String(url)).toBe("https://storage.example.com/upload");
			expect(options?.credentials).toBe("same-origin");
			expect(options?.headers).toBeUndefined();
			expect([...(options?.body as FormData).keys()]).toEqual([
				"key",
				"signature",
				"file",
			]);
			return Response.json({ id: 42 });
		}) as typeof fetch;
		expect(
			await uploadSubmissionFile(
				transport(
					{
						upload_url: "https://storage.example.com/upload",
						upload_params: { key: "submission", signature: "signed" },
					},
					requests,
				),
				1,
				2,
				file,
				"https://canvas.example.edu",
			),
		).toBe(42);
		expect(requests).toEqual([
			{
				path: "/api/v1/courses/1/assignments/2/submissions/self/files",
				options: {
					method: "POST",
					body: {
						name: "essay.pdf",
						size: 5,
						content_type: "application/pdf",
						on_duplicate: "rename",
					},
				},
			},
		]);
	});
	test("confirms a 201 through the authenticated Canvas transport", async () => {
		const requests: unknown[] = [];
		const base = transport(
			{ upload_url: "https://storage.example.com/upload", upload_params: {} },
			requests,
		);
		const request = base.request.bind(base);
		base.request = async <T>(path: string, options: unknown) => {
			if (path === "/api/v1/files/42/create_success?uuid=signed")
				return { id: 42 } as T;
			return request<T>(path, options as never);
		};
		globalThis.fetch = (async () =>
			new Response(null, {
				status: 201,
				headers: {
					Location:
						"https://canvas.example.edu/api/v1/files/42/create_success?uuid=signed",
				},
			})) as typeof fetch;
		expect(
			await uploadSubmissionFile(
				base,
				1,
				2,
				new File(["x"], "essay.pdf"),
				"https://canvas.example.edu",
			),
		).toBe(42);
	});
	test("never authenticates a confirmation URL on another origin", async () => {
		const requests: unknown[] = [];
		globalThis.fetch = (async () =>
			new Response(null, {
				status: 201,
				headers: { Location: "https://other.example.com/api/v1/files/42" },
			})) as typeof fetch;
		await expect(
			uploadSubmissionFile(
				transport(
					{
						upload_url: "https://storage.example.com/upload",
						upload_params: {},
					},
					requests,
				),
				1,
				2,
				new File(["x"], "essay.pdf"),
				"https://canvas.example.edu",
			),
		).rejects.toThrow("unexpected upload confirmation");
		expect(requests.length).toBe(1);
	});

	test("uploads editor images into user files independently of assignment extension restrictions", async () => {
		const requests: unknown[] = [];
		globalThis.fetch = (async () => Response.json({ id: 73 })) as typeof fetch;
		await expect(
			uploadCanvasFile(
				transport(
					{
						upload_url: "https://storage.example.com/upload",
						upload_params: {},
					},
					requests,
				),
				"/api/v1/users/self/files",
				new File(["image"], "image.png", { type: "image/png" }),
				"https://canvas.example.edu",
			),
		).resolves.toBe(73);
		expect(requests[0]).toEqual({
			path: "/api/v1/users/self/files",
			options: {
				method: "POST",
				body: {
					name: "image.png",
					size: 5,
					content_type: "image/png",
					on_duplicate: "rename",
				},
			},
		});
	});

	test("does not accept an unconfirmed upload", async () => {
		globalThis.fetch = (async () => Response.json({})) as typeof fetch;
		await expect(
			uploadSubmissionFile(
				transport({
					upload_url: "https://storage.example.com/upload",
					upload_params: {},
				}),
				1,
				2,
				new File(["x"], "essay.pdf"),
				"https://canvas.example.edu",
			),
		).rejects.toThrow("did not confirm");
	});
	test("reports storage failure and rejects insecure upload endpoints", async () => {
		globalThis.fetch = (async () =>
			new Response(null, { status: 403 })) as typeof fetch;
		await expect(
			uploadSubmissionFile(
				transport({
					upload_url: "https://storage.example.com/upload",
					upload_params: {},
				}),
				1,
				2,
				new File(["x"], "essay.pdf"),
				"https://canvas.example.edu",
			),
		).rejects.toThrow("403");
		await expect(
			uploadSubmissionFile(
				transport({
					upload_url: "http://storage.example.com/upload",
					upload_params: {},
				}),
				1,
				2,
				new File(["x"], "essay.pdf"),
				"https://canvas.example.edu",
			),
		).rejects.toThrow("insecure");
	});
});
