import katex from "katex";

export function normalizeCanvasLatex(latex: string) {
	const controlSequenceRuns = latex.match(/\\+(?=[A-Za-z])/g) ?? [];
	const isConsistentlyEscaped =
		controlSequenceRuns.length > 0 &&
		controlSequenceRuns.every((run) => run.length % 2 === 0);

	return isConsistentlyEscaped ? latex.replace(/\\\\/g, "\\") : latex;
}

export function renderCanvasLatex(latex: string) {
	return katex.renderToString(normalizeCanvasLatex(latex), {
		throwOnError: true,
	});
}
