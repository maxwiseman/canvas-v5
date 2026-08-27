import { describe, expect, test } from "bun:test";
import {
	normalizeCanvasLatex,
	renderCanvasLatex,
} from "../src/lib/canvas-latex";

describe("normalizeCanvasLatex", () => {
	test("unescapes Canvas formulas whose control sequences are doubled", () => {
		expect(normalizeCanvasLatex(String.raw`\\mathrm{\\hat{i}}`)).toBe(
			String.raw`\mathrm{\hat{i}}`,
		);
		expect(
			normalizeCanvasLatex(
				String.raw`\\Large \\mathrm{\\frac{3 \\hat{i} + 4 \\hat{j}}{5} = 0.6 \\hat{i} + 0.8 \\hat{j}}`,
			),
		).toBe(
			String.raw`\Large \mathrm{\frac{3 \hat{i} + 4 \hat{j}}{5} = 0.6 \hat{i} + 0.8 \hat{j}}`,
		);
	});

	test("preserves already valid TeX and its row breaks", () => {
		const latex = String.raw`\begin{matrix} a \\ b \end{matrix}`;
		expect(normalizeCanvasLatex(latex)).toBe(latex);
	});

	test("unescapes one level while retaining escaped row breaks", () => {
		expect(
			normalizeCanvasLatex(String.raw`\\begin{matrix} a \\\\ b \\end{matrix}`),
		).toBe(String.raw`\begin{matrix} a \\ b \end{matrix}`);
	});

	test("renders the EF 151 equation through KaTeX after normalization", () => {
		const rendered = renderCanvasLatex(
			String.raw`\\Large \\mathrm{\\frac{3 \\hat{i} + 4 \\hat{j}}{5} = 0.6 \\hat{i} + 0.8 \\hat{j}}`,
		);

		expect(rendered).toContain('class="katex"');
		expect(rendered).toContain("<mfrac>");
		expect(rendered).toContain('<mover accent="true">');
	});
});
