import { describe, expect, test } from "bun:test";
import { CanvasRuntime } from "../src/runtime";
import { CanvasIndexedDbStore, emptySnapshot } from "../src/store";
import { LocalOverlayTransport } from "../src/transports";
import type {
	CanvasAccount,
	CanvasAnnouncement,
	CanvasRuntimeSnapshot,
	CanvasTransport,
} from "../src/types";

class MemoryStore extends CanvasIndexedDbStore {
	disk = emptySnapshot("mock");
	fail = false;
	override async put(
		name: Parameters<CanvasIndexedDbStore["put"]>[0],
		record: Parameters<CanvasIndexedDbStore["put"]>[1],
	) {
		if (this.fail) throw new Error("Disk unavailable");
		if (name === "mutationQueue") {
			const mutation = record as CanvasRuntimeSnapshot["mutationQueue"][number];
			this.disk.mutationQueue = [
				...this.disk.mutationQueue.filter((item) => item.id !== mutation.id),
				structuredClone(mutation),
			];
		}
	}
	override async replaceAll(
		name: Parameters<CanvasIndexedDbStore["replaceAll"]>[0],
		records: Parameters<CanvasIndexedDbStore["replaceAll"]>[1],
	) {
		if (name === "announcements")
			this.disk.announcements = structuredClone(
				records,
			) as CanvasAnnouncement[];
	}
}

const account: CanvasAccount = {
	id: "a",
	connectionId: "a",
	canvasBaseUrl: "https://canvas.example",
	label: "A",
	authMode: "api-token",
	isActive: true,
};
const announcement: CanvasAnnouncement = {
	id: 7,
	course_id: 42,
	canvasAccountId: "a",
	title: "News",
	read_state: "unread",
	unread_count: 3,
};
function fixture(store = new MemoryStore()) {
	const state = {
		offline: false,
		pauseRead: undefined as undefined | (() => Promise<void>),
		remote: [announcement],
	};
	const writes: string[] = [];
	const transport: CanvasTransport = {
		mode: "mock",
		probeAuth: async () => ({ status: "unauthenticated", reason: "test" }),
		request: async <T>(path: string, options?: { method?: string }) => {
			expect(store.disk.mutationQueue).toHaveLength(1);
			expect(options?.method).toBe("PUT");
			writes.push(path);
			if (state.offline) throw new Error("Offline");
			return undefined as T;
		},
		paginatedRequest: async <T>() => {
			const response = structuredClone(state.remote);
			await state.pauseRead?.();
			return response as T[];
		},
	};
	const runtime = new CanvasRuntime({
		mode: "mock",
		canvasTransport: transport,
		overlayTransport: new LocalOverlayTransport(),
		store,
	});
	Object.assign(runtime.getSnapshot(), {
		activeAccount: account,
		accounts: [account],
		announcements: [announcement],
		mutationQueue: structuredClone(store.disk.mutationQueue),
	});
	return { runtime, state, writes, store };
}

describe("local-first announcement reads", () => {
	test("updates immediately, persists before PUT, and avoids duplicate opens", async () => {
		const { runtime, writes } = fixture();
		const pending = runtime.markAnnouncementRead(42, 7);
		expect(runtime.getAnnouncements()[0]?.read_state).toBe("read");
		expect(runtime.getAnnouncements()[0]?.unread_count).toBe(3);
		await Promise.all([pending, runtime.markAnnouncementRead(42, 7)]);
		expect(writes).toEqual(["/api/v1/courses/42/discussion_topics/7/read"]);
		expect(runtime.getSnapshot().mutationQueue[0]?.status).toBe("acked");
	});

	test("preserves an offline read after reload and retries it", async () => {
		const first = fixture();
		first.state.offline = true;
		await first.runtime.markAnnouncementRead(42, 7);
		expect(first.store.disk.mutationQueue[0]?.status).toBe("error");
		const second = fixture(first.store);
		expect(second.runtime.getAnnouncements()[0]?.read_state).toBe("read");
		await second.runtime.retryPendingAnnouncementReads();
		expect(second.writes).toHaveLength(1);
		expect(second.store.disk.mutationQueue[0]?.status).toBe("acked");
	});

	test("a stale fetch cannot restore New after opening; later Canvas unread is respected", async () => {
		const { runtime, state } = fixture();
		let release!: () => void;
		state.pauseRead = () =>
			new Promise<void>((resolve) => {
				release = resolve;
			});
		const sync = runtime.syncAnnouncements(42);
		await runtime.markAnnouncementRead(42, 7);
		release();
		await sync;
		expect(runtime.getAnnouncements()[0]?.read_state).toBe("read");
		state.pauseRead = undefined;
		state.remote = [{ ...announcement, read_state: "read" }];
		await runtime.syncAnnouncements(42);
		state.remote = [announcement];
		await runtime.syncAnnouncements(42);
		expect(runtime.getAnnouncements()[0]?.read_state).toBe("unread");
	});

	test("does not replay reads or display cached announcements for a different account", async () => {
		const { runtime, state, writes } = fixture();
		state.offline = true;
		await runtime.markAnnouncementRead(42, 7);
		runtime.getSnapshot().activeAccount = {
			...account,
			id: "b",
			connectionId: "b",
		};
		state.offline = false;
		await runtime.retryPendingAnnouncementReads();
		expect(writes).toHaveLength(1);
		expect(runtime.getAnnouncements()).toEqual([]);
	});

	test("never sends a write when local persistence fails", async () => {
		const { runtime, store, writes } = fixture();
		store.fail = true;
		await expect(runtime.markAnnouncementRead(42, 7)).rejects.toThrow(
			"Disk unavailable",
		);
		expect(writes).toEqual([]);
	});
});
