import { describe, expect, test } from "bun:test";
import {
	parseDeclarations,
	rehypeAdaptCanvasHtmlColors,
} from "../src/lib/adapt-canvas-html-colors";

describe("rehypeAdaptCanvasHtmlColors", () => {
	test("adapts inline foreground and background colors", () => {
		const element = {
			type: "element",
			properties: {
				className: ["teacher-callout"],
				style: "background-color: #fff4b8; color: rgb(20, 20, 20) !important",
			},
			children: [],
		};

		rehypeAdaptCanvasHtmlColors()({ type: "root", children: [element] });

		expect(element.properties.className).toEqual([
			"teacher-callout",
			"canvas-html-adaptive-background",
			"canvas-html-adaptive-foreground",
		]);
		expect(element.properties.style).toContain(
			"--canvas-html-background-light: #fff4b8",
		);
		expect(element.properties.style).toContain(
			"background-color: var(--canvas-html-background)",
		);
		expect(element.properties.style).toContain(
			"color: var(--canvas-html-foreground) !important",
		);
	});

	test("adapts legacy Canvas color attributes", () => {
		const element: {
			type: string;
			properties: Record<string, unknown>;
			children: never[];
		} = {
			type: "element",
			properties: { bgColor: "white", color: "#222" },
			children: [],
		};

		rehypeAdaptCanvasHtmlColors()({ type: "root", children: [element] });

		expect(element.properties.bgColor).toBeUndefined();
		expect(element.properties.color).toBeUndefined();
		expect(element.properties.style).toContain(
			"--canvas-html-background-light: white",
		);
		expect(element.properties.style).toContain(
			"--canvas-html-foreground-light: #222",
		);
	});

	test("adapts border shorthand colors without changing width or style", () => {
		const element = {
			type: "element",
			properties: {
				style:
					"border: 2px solid #d1d5db; border-left: 6px solid rgb(232, 174, 0)",
			},
			children: [],
		};

		rehypeAdaptCanvasHtmlColors()({ type: "root", children: [element] });

		expect(element.properties.style).toContain(
			"border: 2px solid var(--canvas-html-border)",
		);
		expect(element.properties.style).toContain(
			"border-left: 6px solid var(--canvas-html-border-left)",
		);
		expect(element.properties.style).toContain(
			"--canvas-html-border-left-light: rgb(232, 174, 0)",
		);
	});

	test("leaves gradients and background images unchanged", () => {
		const style =
			'background: linear-gradient(#fff, #ddd); background-image: url("data:image/svg+xml;charset=utf-8,<svg></svg>")';
		const element = {
			type: "element",
			properties: { style },
			children: [],
		};

		rehypeAdaptCanvasHtmlColors()({ type: "root", children: [element] });

		expect(element.properties).toEqual({ style });
	});
});

describe("parseDeclarations", () => {
	test("does not split semicolons inside CSS functions", () => {
		expect(
			parseDeclarations(
				'background-image: url("data:image/svg+xml;charset=utf-8,<svg></svg>"); color: #123',
			),
		).toHaveLength(2);
	});
});
