import {
	CanvasRestTransport,
	CanvasRuntime,
	type CanvasRuntimeMode,
	CanvasRuntimeProvider,
	HttpOverlayTransport,
	LocalOverlayTransport,
	MockCanvasTransport,
	type OverlayTransport,
	WebCanvasProxyTransport,
} from "@canvas-v5/canvas-sdk";
import { RouterProvider } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";

import { createCanvasAppRouter } from "./create-app-router";

export interface CanvasAppProps {
	runtime: CanvasRuntime;
	fallback?: ReactNode;
}

export function CanvasApp({ runtime }: CanvasAppProps) {
	const router = useMemo(() => createCanvasAppRouter(), []);

	return (
		<CanvasRuntimeProvider runtime={runtime}>
			<RouterProvider router={router} />
		</CanvasRuntimeProvider>
	);
}

export function createMockCanvasRuntime() {
	return new CanvasRuntime({
		mode: "mock",
		canvasTransport: new MockCanvasTransport(),
		overlayTransport: new LocalOverlayTransport(),
		openAppLogin: () => {
			if (typeof window !== "undefined") {
				window.location.assign("/login");
			}
		},
	});
}

export function createWebCanvasRuntime() {
	return new CanvasRuntime({
		mode: "web",
		canvasTransport: new WebCanvasProxyTransport(
			globalThis.location?.origin ?? "",
		),
		overlayTransport: new HttpOverlayTransport(
			globalThis.location?.origin ?? "",
		),
		openAppLogin: () => {
			globalThis.location?.assign("/login");
		},
		checkExtensionInstalled: pingCanvasV5Extension,
		openCanvasAccount: (account) => {
			if (account) {
				globalThis.location?.assign(account.canvasBaseUrl);
			}
		},
	});
}

export function createExtensionCanvasRuntime(options: {
	canvasBaseUrl: string;
	appBaseUrl: string;
	mode?: CanvasRuntimeMode;
	openAppLogin?: () => void | Promise<void>;
	overlayTransport?: OverlayTransport;
}) {
	return new CanvasRuntime({
		mode: options.mode ?? "extension",
		canvasTransport: new CanvasRestTransport({
			mode: options.mode ?? "extension",
			baseUrl: options.canvasBaseUrl,
			credentials: "include",
		}),
		overlayTransport:
			options.overlayTransport ?? new HttpOverlayTransport(options.appBaseUrl),
		openAppLogin:
			options.openAppLogin ??
			(() => {
				globalThis.open(`${options.appBaseUrl}/login`, "_blank", "noopener");
			}),
		openCanvasAccount: (account) => {
			if (account && globalThis.location?.origin !== account.canvasBaseUrl) {
				globalThis.location?.assign(account.canvasBaseUrl);
			}
		},
	});
}

function pingCanvasV5Extension(timeoutMs = 350) {
	if (typeof window === "undefined") {
		return Promise.resolve(false);
	}

	return new Promise<boolean>((resolve) => {
		const nonce = crypto.randomUUID();
		const timeout = window.setTimeout(() => {
			window.removeEventListener("message", handleMessage);
			resolve(false);
		}, timeoutMs);

		function handleMessage(event: MessageEvent) {
			if (
				event.source === window &&
				event.data?.source === "canvas-v5-extension" &&
				event.data?.type === "canvas-v5:extension-pong" &&
				event.data?.nonce === nonce
			) {
				window.clearTimeout(timeout);
				window.removeEventListener("message", handleMessage);
				resolve(true);
			}
		}

		window.addEventListener("message", handleMessage);
		window.postMessage(
			{ source: "canvas-v5-web", type: "canvas-v5:extension-ping", nonce },
			window.location.origin,
		);
	});
}
