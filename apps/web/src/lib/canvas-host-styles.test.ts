import { afterEach, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { applyCanvasHostStyles } from "../../../../packages/canvas-mcp-app/src/canvas-host-styles";

const originalDocument = globalThis.document;
afterEach(() => {
	globalThis.document = originalDocument;
});

test("host tokens adapt shared theme and partial updates preserve prior tokens", () => {
	globalThis.document = new JSDOM(
		"<!doctype html><html><head></head><body></body></html>",
	).window.document;
	applyCanvasHostStyles({
		theme: "dark",
		styles: {
			variables: {
				"--color-background-primary": "#212121",
				"--font-sans": "Arial, sans-serif",
				"--border-radius-md": "8px",
			},
		},
	});
	const root = document.documentElement;
	expect(root.dataset.uiHost).toBe("chatgpt");
	expect(root.dataset.theme).toBe("dark");
	expect(root.style.getPropertyValue("--background")).toBe(
		"var(--color-background-primary)",
	);
	expect(root.style.getPropertyValue("--canvas-font-sans")).toBe(
		"var(--font-sans)",
	);
	expect(root.style.getPropertyValue("--primary")).toBe("");
	applyCanvasHostStyles({
		styles: { variables: { "--color-background-primary": "#ffffff" } },
	});
	expect(root.style.getPropertyValue("--color-background-primary")).toBe(
		"#ffffff",
	);
	expect(root.style.getPropertyValue("--border-radius-md")).toBe("8px");
	applyCanvasHostStyles({ theme: "light" });
	expect(root.style.getPropertyValue("--background")).toBe(
		"var(--color-background-primary)",
	);
});

test("missing host styles leave native semantic values alone", () => {
	globalThis.document = new JSDOM(
		"<!doctype html><html><head></head><body></body></html>",
	).window.document;
	applyCanvasHostStyles(undefined);
	expect(document.documentElement.style.length).toBe(0);
});

test("host hook defaults to native UI and follows the explicit provider", async () => {
	const { createElement } = await import("react");
	const { renderToStaticMarkup } = await import("react-dom/server");
	const { UIHostContext, useIsChatGPT } = await import(
		"@canvas-v5/ui/hooks/use-ui-host"
	);
	function Probe() {
		return createElement("span", null, String(useIsChatGPT()));
	}
	expect(renderToStaticMarkup(createElement(Probe))).toBe("<span>false</span>");
	expect(
		renderToStaticMarkup(
			createElement(UIHostContext, { value: "chatgpt" }, createElement(Probe)),
		),
	).toBe("<span>true</span>");
});
