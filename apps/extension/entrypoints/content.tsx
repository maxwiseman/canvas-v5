import { CanvasApp, createExtensionCanvasRuntime } from "@canvas-v5/app";
import appStyles from "@canvas-v5/app/styles.css?inline";
import type {
	AppAuthState,
	AppUser,
	CanvasAccount,
	CanvasConnectionInput,
	CourseOverlay,
	OverlayTransport,
} from "@canvas-v5/canvas-sdk";
import React from "react";
import { createRoot } from "react-dom/client";

const APP_BASE_URL =
	import.meta.env.VITE_CANVAS_V5_APP_ORIGIN?.replace(/\/$/, "") ??
	"http://localhost:3000";

export default defineContentScript({
	matches: [
		"*://*.instructure.com/*",
		"http://localhost:3000/*",
		"http://localhost:3001/*",
	],
	runAt: "document_idle",
	async main() {
		if (!window.location.hostname.endsWith(".instructure.com")) {
			installWebAppBridge();
			return;
		}

		const canvasBaseUrl = window.location.origin;
		const canvasProbe = await probeCanvas(canvasBaseUrl);
		if (!canvasProbe.ok) {
			showCanvasV5Banner({
				status: "Canvas auth missing",
				detail:
					"Canvas V5 is installed, but this Canvas page is not authenticated.",
			});
			return;
		}

		const host = document.createElement("div");
		host.id = "canvas-v5-root";
		const shadowRoot = host.attachShadow({ mode: "open" });
		const shadowStyle = document.createElement("style");
		shadowStyle.textContent = `
			:host {
				all: initial;
				display: block;
				min-height: 100vh;
				color-scheme: light;
			}

			#canvas-v5-shadow-mount {
				display: block;
				min-height: 100vh;
				font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
				line-height: 1.5;
				text-rendering: optimizeLegibility;
				-webkit-font-smoothing: antialiased;
			}

			*, *::before, *::after {
				box-sizing: border-box;
			}

			:where(h1, h2, h3, h4, h5, h6, p, figure, blockquote, dl, dd) {
				margin: 0;
			}

			:where(ul, ol) {
				margin: 0;
				padding: 0;
				list-style: none;
			}

			:where(button, input, select, textarea) {
				color: inherit;
				font: inherit;
			}

			:where(button) {
				appearance: none;
				border: 0;
				background: none;
				margin: 0;
				padding: 0;
				text-align: inherit;
			}

			:where(a) {
				color: inherit;
				text-decoration: none;
			}

			:where(img, picture, video, canvas, svg) {
				display: block;
				max-width: 100%;
			}

			:where(table) {
				border-collapse: collapse;
			}

			${appStyles}
		`;
		const mount = document.createElement("div");
		mount.id = "canvas-v5-shadow-mount";
		shadowRoot.append(shadowStyle, mount);

		document.documentElement.classList.add("canvas-v5-mounted");
		document.body.append(host);

		const style = document.createElement("style");
		style.id = "canvas-v5-host-style";
		style.textContent = `
      html.canvas-v5-mounted body > :not(#canvas-v5-root):not(script):not(style) {
        display: none !important;
      }
      #canvas-v5-root {
				all: initial !important;
				display: block !important;
        min-height: 100vh;
				isolation: isolate;
      }
    `;
		document.head.append(style);

		try {
			const runtime = createExtensionCanvasRuntime({
				canvasBaseUrl,
				appBaseUrl: APP_BASE_URL,
				overlayTransport: new ExtensionOverlayTransport(),
				openAppLogin: () =>
					browser.runtime.sendMessage({
						type: "canvas-v5:open-app-login",
					}),
			});
			createRoot(mount).render(
				<React.StrictMode>
					<CanvasApp runtime={runtime} />
				</React.StrictMode>,
			);
		} catch (error) {
			document.documentElement.classList.remove("canvas-v5-mounted");
			host.remove();
			style.remove();
			console.error("[canvas-v5] Failed to mount extension app", error);
		}
	},
});

function installWebAppBridge() {
	window.addEventListener("message", (event) => {
		if (
			event.source !== window ||
			event.data?.source !== "canvas-v5-web" ||
			event.data?.type !== "canvas-v5:extension-ping"
		) {
			return;
		}
		window.postMessage(
			{
				source: "canvas-v5-extension",
				type: "canvas-v5:extension-pong",
				nonce: event.data.nonce,
			},
			window.location.origin,
		);
	});
}

class ExtensionOverlayTransport implements OverlayTransport {
	async probeAuth(): Promise<AppAuthState> {
		const response = await this.appFetch<{ user?: AppUser }>(
			"/api/auth/get-session",
		);
		if (!response.ok || !response.body.user) {
			return { status: "unauthenticated", reason: "No app session." };
		}
		return { status: "authenticated", user: response.body.user };
	}

	async listConnections(): Promise<CanvasAccount[]> {
		const response = await this.appFetch<CanvasAccount[]>(
			"/api/canvas/connections",
		);
		return response.ok ? response.body : [];
	}

	async ensureConnection(connection: CanvasAccount): Promise<CanvasAccount> {
		return this.saveConnection(connection);
	}

	async createConnection(input: CanvasConnectionInput): Promise<CanvasAccount> {
		return this.saveConnection(input);
	}

	async listCourseOverlays(): Promise<CourseOverlay[]> {
		const response = await this.appFetch<CourseOverlay[]>(
			"/api/canvas/course-overlays",
		);
		return response.ok ? response.body : [];
	}

	async updateCourseOverlay(input: {
		canvasConnectionId: string;
		canvasCourseId: number;
		icon?: string | null;
	}): Promise<CourseOverlay> {
		const response = await this.appFetch<CourseOverlay>(
			"/api/canvas/course-overlays",
			{ method: "POST", body: input },
		);
		if (!response.ok) {
			throw new Error(`Overlay update failed (${response.status})`);
		}
		return response.body;
	}

	private async saveConnection(
		connection: CanvasAccount | CanvasConnectionInput,
	) {
		const response = await this.appFetch<CanvasAccount>(
			"/api/canvas/connections",
			{ method: "POST", body: connection },
		);
		if (!response.ok) {
			throw new Error(`Connection save failed (${response.status})`);
		}
		return response.body;
	}

	private async appFetch<T>(
		path: string,
		init?: { method?: string; body?: unknown },
	) {
		const response = (await browser.runtime.sendMessage({
			type: "canvas-v5:app-fetch",
			path,
			init,
		})) as { ok: boolean; status: number; body: T };
		return response;
	}
}

async function probeCanvas(canvasBaseUrl: string) {
	try {
		const response = await fetch(
			new URL("/api/v1/users/self/profile", canvasBaseUrl),
			{
				credentials: "include",
				headers: { Accept: "application/json" },
			},
		);
		return { ok: response.ok };
	} catch {
		return { ok: false };
	}
}

function showCanvasV5Banner(options: {
	status: string;
	detail: string;
	action?: { label: string; onClick: () => void };
}) {
	if (document.getElementById("canvas-v5-status-banner")) {
		return;
	}

	const banner = document.createElement("div");
	banner.id = "canvas-v5-status-banner";
	banner.style.cssText = `
		all: initial;
		position: fixed;
		right: 16px;
		bottom: 16px;
		z-index: 2147483647;
		width: min(360px, calc(100vw - 32px));
		border: 1px solid rgba(15, 23, 42, 0.16);
		border-radius: 8px;
		background: white;
		color: #0f172a;
		box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22);
		font: 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		padding: 14px;
	`;

	const title = document.createElement("strong");
	title.textContent = options.status;
	title.style.display = "block";
	title.style.marginBottom = "4px";
	banner.append(title);

	const detail = document.createElement("div");
	detail.textContent = options.detail;
	detail.style.color = "#475569";
	banner.append(detail);

	if (options.action) {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = options.action.label;
		button.style.cssText = `
			margin-top: 10px;
			min-height: 30px;
			border: 0;
			border-radius: 6px;
			background: #0f172a;
			color: white;
			padding: 0 10px;
			cursor: pointer;
		`;
		button.addEventListener("click", options.action.onClick);
		banner.append(button);
	}

	document.body.append(banner);
}
