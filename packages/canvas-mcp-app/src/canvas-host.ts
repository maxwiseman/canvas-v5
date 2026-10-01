export function appRelativePath(value: unknown): string | undefined {
	if (
		typeof value !== "string" ||
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.includes("\\") ||
		value.includes("#")
	)
		return undefined;
	const parsed = new URL(value, "https://canvas.invalid");
	return parsed.origin === "https://canvas.invalid"
		? parsed.pathname + parsed.search
		: undefined;
}

export function unwrapAppResult(result: {
	isError?: boolean;
	_meta?: Record<string, unknown>;
	content?: { type: string; text?: string }[];
}): unknown {
	if (result.isError)
		throw new Error(
			result.content?.find((item) => item.type === "text")?.text ??
				"Unable to load Canvas.",
		);
	if (!result._meta || !("canvasApp" in result._meta))
		throw new Error(
			"Canvas returned no workspace data. Refresh the plugin connection.",
		);
	return result._meta.canvasApp;
}
