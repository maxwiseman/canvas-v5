import { canvasAppRequestUrl } from "./canvas-app-cache";

export async function readCanvasApi(
	initialUrl: URL,
	accessToken: string,
	paginated: boolean,
) {
	let url: URL | undefined = initialUrl;
	const records: unknown[] = [];
	const visited = new Set<string>();
	while (url) {
		if (visited.has(url.href) || visited.size >= 100)
			throw new Error(
				"Canvas pagination limit reached. Narrow this view and try again.",
			);
		visited.add(url.href);
		const response: Response = await fetch(url, {
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			redirect: "error",
			signal: AbortSignal.timeout(30_000),
		});
		if (!response.ok)
			throw new Error(`Canvas request failed (${response.status}).`);
		const value = await response.json();
		if (!paginated) return value;
		if (!Array.isArray(value))
			throw new Error("Canvas returned an unexpected collection.");
		records.push(...value);
		const next: string | undefined = response.headers
			.get("Link")
			?.split(",")
			.find((part) => /rel="next"/.test(part))
			?.match(/<([^>]+)>/)?.[1];
		url = next ? canvasAppRequestUrl(next, initialUrl.origin) : undefined;
	}
	return records;
}
