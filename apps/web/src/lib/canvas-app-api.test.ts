import { afterEach, expect, mock, test } from "bun:test";
import { readCanvasApi } from "./canvas-app-api";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
test("API reads follow safe pagination and send credentials only to Canvas", async () => {
	const fetcher = mock(async () =>
		Response.json([{ id: 1 }], {
			headers: {
				Link: '<https://school.instructure.com/api/v1/courses?page=2>; rel="next"',
			},
		}),
	);
	fetcher.mockImplementationOnce(async () =>
		Response.json([{ id: 1 }], {
			headers: {
				Link: '<https://school.instructure.com/api/v1/courses?page=2>; rel="next"',
			},
		}),
	);
	fetcher.mockImplementationOnce(async () => Response.json([{ id: 2 }]));
	globalThis.fetch = fetcher as unknown as typeof fetch;
	expect(
		await readCanvasApi(
			new URL("https://school.instructure.com/api/v1/courses"),
			"test-token",
			true,
		),
	).toEqual([{ id: 1 }, { id: 2 }]);
	expect(fetcher).toHaveBeenCalledTimes(2);
});
test("foreign pagination links are rejected before credentials can leave Canvas", async () => {
	const fetcher = mock(async () =>
		Response.json([], {
			headers: { Link: '<https://evil.example/api/v1/courses>; rel="next"' },
		}),
	);
	globalThis.fetch = fetcher as unknown as typeof fetch;
	await expect(
		readCanvasApi(
			new URL("https://school.instructure.com/api/v1/courses"),
			"test-token",
			true,
		),
	).rejects.toThrow("Invalid Canvas API path");
	expect(fetcher).toHaveBeenCalledTimes(1);
});
test("Canvas errors remain errors rather than successful empty views", async () => {
	globalThis.fetch = mock(
		async () => new Response("", { status: 403 }),
	) as unknown as typeof fetch;
	await expect(
		readCanvasApi(
			new URL("https://school.instructure.com/api/v1/courses"),
			"test-token",
			false,
		),
	).rejects.toThrow("403");
});
