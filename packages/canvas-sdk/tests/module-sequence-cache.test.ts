import { describe, expect, test } from "bun:test";
import {
	CanvasRuntime,
	LocalOverlayTransport,
	MockCanvasTransport,
} from "../src";

class CountingCanvasTransport extends MockCanvasTransport {
	requests: string[] = [];

	override async request<T>(path: string): Promise<T> {
		this.requests.push(path);
		return super.request<T>(path);
	}
}

describe("module item sequence cache", () => {
	test("coalesces duplicate requests and reuses the result", async () => {
		const transport = new CountingCanvasTransport();
		const runtime = new CanvasRuntime({
			mode: "mock",
			canvasTransport: transport,
			overlayTransport: new LocalOverlayTransport(),
		});

		await Promise.all([
			runtime.getModuleItemSequence(42, "Page", "1"),
			runtime.getModuleItemSequence(42, "Page", "1"),
		]);
		await runtime.getModuleItemSequence(42, "Page", "1");

		expect(transport.requests).toHaveLength(1);
		expect(runtime.getCachedModuleItemSequence(42, "Page", "1")).toBeDefined();
	});

	test("refreshes a cached sequence while coalescing forced requests", async () => {
		const transport = new CountingCanvasTransport();
		const runtime = new CanvasRuntime({
			mode: "mock",
			canvasTransport: transport,
			overlayTransport: new LocalOverlayTransport(),
		});

		await runtime.getModuleItemSequence(42, "Page", "1");
		await Promise.all([
			runtime.getModuleItemSequence(42, "Page", "1", {
				forceRefresh: true,
			}),
			runtime.getModuleItemSequence(42, "Page", "1", {
				forceRefresh: true,
			}),
		]);

		expect(transport.requests).toHaveLength(2);
	});

	test("prefetches adjacent items for uninterrupted navigation", async () => {
		const transport = new CountingCanvasTransport();
		const runtime = new CanvasRuntime({
			mode: "mock",
			canvasTransport: transport,
			overlayTransport: new LocalOverlayTransport(),
		});
		const sequence = await runtime.getModuleItemSequence(42, "Page", "1");

		runtime.prefetchAdjacentModuleItemSequences(42, "Page", sequence);
		await Promise.all([
			runtime.getModuleItemSequence(42, "Page", "0"),
			runtime.getModuleItemSequence(42, "Page", "2"),
		]);

		expect(transport.requests).toHaveLength(3);
		expect(runtime.getCachedModuleItemSequence(42, "Page", "0")).toBeDefined();
		expect(runtime.getCachedModuleItemSequence(42, "Page", "2")).toBeDefined();
	});
});
