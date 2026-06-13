const APP_BASE_URL =
	import.meta.env.VITE_CANVAS_V5_APP_ORIGIN?.replace(/\/$/, "") ??
	"http://localhost:3000";

export default defineBackground(() => {
	browser.runtime.onMessage.addListener((message) => {
		if (!isCanvasV5Message(message)) {
			return undefined;
		}

		if (message.type === "canvas-v5:get-app-session") {
			return getAppSession();
		}

		if (message.type === "canvas-v5:open-app-login") {
			void browser.tabs.create({ url: `${APP_BASE_URL}/login` });
			return Promise.resolve({ ok: true });
		}

		if (message.type === "canvas-v5:app-fetch") {
			return appFetch(message.path, message.init);
		}

		return undefined;
	});
});

type CanvasV5Message =
	| { type: "canvas-v5:get-app-session" }
	| { type: "canvas-v5:open-app-login" }
	| {
			type: "canvas-v5:app-fetch";
			path: string;
			init?: { method?: string; body?: unknown };
	  };

function isCanvasV5Message(message: unknown): message is CanvasV5Message {
	return (
		typeof message === "object" &&
		message !== null &&
		"type" in message &&
		typeof message.type === "string" &&
		message.type.startsWith("canvas-v5:")
	);
}

async function getAppSession() {
	try {
		const response = await appFetch("/api/auth/get-session");
		if (!response.ok) {
			return { ok: false, reason: "No web app session." };
		}
		const session = response.body as { user?: unknown };
		return session.user
			? { ok: true, user: session.user }
			: { ok: false, reason: "No web app session." };
	} catch (error) {
		return {
			ok: false,
			reason:
				error instanceof Error ? error.message : "Unable to check app session.",
		};
	}
}

async function appFetch(
	path: string,
	init: { method?: string; body?: unknown } = {},
) {
	try {
		const response = await fetch(new URL(path, APP_BASE_URL), {
			method: init.method ?? "GET",
			credentials: "include",
			headers: {
				Accept: "application/json",
				...(init.body === undefined
					? {}
					: { "Content-Type": "application/json" }),
			},
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
		});
		const contentType = response.headers.get("Content-Type") ?? "";
		const body = contentType.includes("application/json")
			? await response.json()
			: await response.text();
		return { ok: response.ok, status: response.status, body };
	} catch (error) {
		return {
			ok: false,
			status: 0,
			body: {
				error:
					error instanceof Error
						? error.message
						: "Unable to reach the Canvas V5 app.",
			},
		};
	}
}
