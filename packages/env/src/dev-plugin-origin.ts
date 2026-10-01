/** Explicit opt-in: keep dev OAuth redirects on this deployment, not production. */
export function devPluginOrigin(
	environment: Record<string, string | undefined>,
) {
	const isDevBranchPreview =
		environment.VERCEL_ENV === "preview" &&
		environment.VERCEL_GIT_COMMIT_REF === "codex/chatgpt-plugin-dev";
	if (environment.CANVAS_DEV_PLUGIN !== "1" && !isDevBranchPreview)
		return undefined;
	const host = environment.VERCEL_URL;
	if (!host || !/^[a-z0-9-]+\.vercel\.app$/i.test(host)) {
		throw new Error("CANVAS_DEV_PLUGIN requires a Vercel deployment hostname.");
	}
	return `https://${host}`;
}
