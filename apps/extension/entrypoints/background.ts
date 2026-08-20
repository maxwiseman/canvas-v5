import {
	fetchNormalizedAssignments,
	fetchNormalizedCourses,
} from "@canvas-v5/canvas-core";
import { CanvasRestTransport } from "@canvas-v5/canvas-sdk/transports";

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

		if (message.type === "canvas-v5:sync-now") {
			return runOpportunisticSync();
		}

		return undefined;
	});

	browser.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === SYNC_ALARM_NAME) void runScheduledSync();
	});
	browser.runtime.onInstalled.addListener(() => {
		void initializeBackgroundSync();
	});
	browser.runtime.onStartup.addListener(() => {
		void initializeBackgroundSync();
	});
	self.addEventListener("push", (event) => {
		(event as ExtendablePushEvent).waitUntil(runPendingSyncJobs());
	});
	void initializeBackgroundSync();
});

const SYNC_ALARM_NAME = "canvas-v5:scheduled-sync";
const SYNC_PERIOD_MINUTES = 120;
const OPPORTUNISTIC_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const LAST_OPPORTUNISTIC_SYNC_KEY = "canvas-v5-last-opportunistic-sync";

type CanvasV5Message =
	| { type: "canvas-v5:get-app-session" }
	| { type: "canvas-v5:open-app-login" }
	| { type: "canvas-v5:sync-now" }
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
		const session = response.body as { user?: unknown } | null;
		return session?.user
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

async function initializeBackgroundSync() {
	await browser.alarms.create(SYNC_ALARM_NAME, {
		delayInMinutes: SYNC_PERIOD_MINUTES,
		periodInMinutes: SYNC_PERIOD_MINUTES,
	});
	await registerDevice();
	await runPendingSyncJobs();
}

async function runScheduledSync() {
	const response = await appFetch("/api/canvas/connections");
	if (!response.ok || !Array.isArray(response.body)) return 0;
	let synced = 0;
	for (const connection of response.body as CanvasConnectionResponse[]) {
		if (
			connection.authMode !== "canvas-session" ||
			!connection.canvasIdentityId
		) {
			continue;
		}
		try {
			await syncCanvasTarget({
				id: connection.canvasIdentityId,
				canvasBaseUrl: connection.canvasBaseUrl,
				canvasUserId: connection.canvasUserId ?? "unknown",
			});
			synced += 1;
		} catch (error) {
			console.warn("[canvas-v5] Scheduled Canvas sync failed", error);
		}
	}
	return synced;
}

async function runOpportunisticSync() {
	const stored = await browser.storage.local.get(LAST_OPPORTUNISTIC_SYNC_KEY);
	const lastSync = stored[LAST_OPPORTUNISTIC_SYNC_KEY];
	if (
		typeof lastSync === "number" &&
		Date.now() - lastSync < OPPORTUNISTIC_SYNC_INTERVAL_MS
	) {
		return { ok: true, synced: 0, skipped: "recently-synced" };
	}

	await registerDevice().catch((error) => {
		console.warn("[canvas-v5] Device registration failed", error);
	});
	const synced = await runScheduledSync();
	if (synced > 0) {
		await browser.storage.local.set({
			[LAST_OPPORTUNISTIC_SYNC_KEY]: Date.now(),
		});
	}
	await runPendingSyncJobs();
	return { ok: true, synced };
}

async function runPendingSyncJobs() {
	const deviceId = await getDeviceId();
	for (let index = 0; index < 10; index += 1) {
		const response = await appFetch(
			`/api/canvas/sync-jobs?deviceId=${encodeURIComponent(deviceId)}`,
		);
		const job = response.ok
			? (response.body as { job?: CanvasSyncJob | null }).job
			: null;
		if (!job) return;
		try {
			await syncCanvasTarget(
				{
					id: job.identity.id,
					canvasBaseUrl: job.identity.canvasBaseUrl,
					canvasUserId: job.identity.canvasUserId,
				},
				job.id,
			);
		} catch (error) {
			await appFetch("/api/canvas/sync-jobs", {
				method: "POST",
				body: {
					jobId: job.id,
					deviceId,
					status: "error",
					error: error instanceof Error ? error.message : "Canvas sync failed.",
				},
			});
		}
	}
}

async function syncCanvasTarget(
	identity: CanvasSyncIdentity,
	requestId?: string,
) {
	const source = new CanvasRestTransport({
		mode: "extension",
		baseUrl: identity.canvasBaseUrl,
		credentials: "include",
	});
	const authState = await source.probeAuth();
	if (authState.status !== "authenticated") {
		throw new Error(
			"reason" in authState
				? authState.reason
				: "Canvas session is not authenticated.",
		);
	}
	const observedAt = new Date().toISOString();
	const generationId = crypto.randomUUID();
	const account = {
		id: identity.id,
		baseUrl: identity.canvasBaseUrl,
		canvasUserId: identity.canvasUserId,
	};
	const courses = await fetchNormalizedCourses(source, account, observedAt);
	const assignments: Array<{ courseId: number; records: unknown[] }> = [];
	for (const course of courses) {
		assignments.push({
			courseId: course.id,
			records: await fetchNormalizedAssignments(
				source,
				account,
				course.id,
				observedAt,
			),
		});
	}
	const upload = await appFetch("/api/canvas/sync", {
		method: "POST",
		body: {
			canvasIdentityId: identity.id,
			requestId,
			generationId,
			observedAt,
			courses,
			assignments,
		},
	});
	if (!upload.ok) {
		throw new Error(`Canvas cache upload failed (${upload.status}).`);
	}
}

async function registerDevice() {
	const deviceId = await getDeviceId();
	const config = await appFetch("/api/canvas/devices");
	if (!config.ok) return;
	const publicKey = (config.body as { vapidPublicKey?: string | null })
		.vapidPublicKey;
	let pushSubscription: PushSubscriptionJSON | null = null;
	if (publicKey) {
		const registration = getServiceWorkerRegistration();
		const existing = await registration.pushManager.getSubscription();
		const subscription =
			existing ??
			(await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: decodeBase64Url(publicKey),
			}));
		pushSubscription = subscription.toJSON();
	}
	await appFetch("/api/canvas/devices", {
		method: "POST",
		body: {
			id: deviceId,
			label: navigator.userAgent,
			pushSubscription,
		},
	});
}

async function getDeviceId() {
	const key = "canvas-v5-device-id";
	const stored = await browser.storage.local.get(key);
	if (typeof stored[key] === "string") return stored[key];
	const deviceId = crypto.randomUUID();
	await browser.storage.local.set({ [key]: deviceId });
	return deviceId;
}

function decodeBase64Url(value: string) {
	const padding = "=".repeat((4 - (value.length % 4)) % 4);
	const binary = atob(
		(value + padding).replaceAll("-", "+").replaceAll("_", "/"),
	);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

interface CanvasConnectionResponse {
	authMode: "canvas-session" | "api-token" | "oauth";
	canvasIdentityId?: string;
	canvasBaseUrl: string;
	canvasUserId?: string;
}

interface CanvasSyncIdentity {
	id: string;
	canvasBaseUrl: string;
	canvasUserId: string;
}

interface CanvasSyncJob {
	id: string;
	identity: CanvasSyncIdentity;
}

interface ExtendablePushEvent extends Event {
	waitUntil(promise: Promise<unknown>): void;
}

function getServiceWorkerRegistration() {
	return (self as unknown as { registration: ServiceWorkerRegistration })
		.registration;
}
