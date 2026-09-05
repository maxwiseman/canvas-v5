import { describe, expect, test } from "bun:test";
import {
	submissionHasContent,
	submissionHtml,
	submissionText,
} from "../src/components/submission-rich-text";

describe("Canvas rich text submissions", () => {
	test("keeps formatting, colors, links, and nested lists as portable HTML", () => {
		const value = [
			{ type: "h2", children: [{ text: "An argument", bold: true }] },
			{
				type: "p",
				children: [
					{
						text: "Evidence",
						italic: true,
						underline: true,
						color: "#2563eb",
						backgroundColor: "rgb(254, 240, 138)",
					},
					{
						type: "a",
						url: "https://example.com/?a=1&b=2",
						children: [{ text: "Source" }],
					},
				],
			},
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [{ type: "lic", children: [{ text: "First point" }] }],
					},
				],
			},
		];
		expect(submissionHtml(value)).toBe(
			'<h2><strong>An argument</strong></h2><p><span style="color:#2563eb;background-color:rgb(254, 240, 138)"><u><em>Evidence</em></u></span><a href="https://example.com/?a=1&amp;b=2">Source</a></p><ul><li><div>First point</div></li></ul>',
		);
		expect(submissionText(value)).toBe(
			"An argument\nEvidenceSource\nFirst point",
		);
	});
	test("escapes authored text and rejects unsafe pasted links and styles", () => {
		expect(
			submissionHtml([
				{
					type: "p",
					children: [
						{
							text: '<script>alert("x")</script>',
							color: "red;position:fixed",
						},
						{
							type: "a",
							url: "javascript:alert(1)",
							children: [{ text: "Link" }],
						},
					],
				},
			]),
		).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;Link</p>");
	});
	test("preserves code indentation, blank lines, and escaped markup", () => {
		const value = [
			{
				type: "code_block",
				children: [
					{ type: "code_line", children: [{ text: "if (x < 10) {" }] },
					{ type: "code_line", children: [{ text: '  print("<tag>");' }] },
					{ type: "code_line", children: [{ text: "" }] },
					{ type: "code_line", children: [{ text: "}" }] },
				],
			},
		];
		expect(submissionHtml(value)).toBe(
			"<pre><code>if (x &lt; 10) {\n  print(&quot;&lt;tag&gt;&quot;);\n\n}</code></pre>",
		);
		expect(submissionText(value)).toBe('if (x < 10) {\n  print("<tag>");\n\n}');
		expect(
			submissionHtml([
				{ type: "p", children: [{ text: "a < b", code: true }] },
			]),
		).toBe("<p><code>a &lt; b</code></p>");
	});
	test("supports image-only submissions and preserves Canvas file references and alt text", () => {
		const value = [
			{
				type: "img",
				url: "https://canvas.example.edu/files/42/download?verifier=signed",
				alt: 'A "figure"',
				apiEndpoint: "https://canvas.example.edu/api/v1/files/42",
				children: [{ text: "" }],
			},
		];
		expect(submissionHasContent(value)).toBe(true);
		expect(submissionText(value)).toBe("");
		expect(submissionHtml(value)).toContain('alt="A &quot;figure&quot;"');
		expect(submissionHtml(value)).toContain(
			'data-api-endpoint="https://canvas.example.edu/api/v1/files/42" data-api-returntype="File"',
		);
		for (const url of [
			"javascript:alert(1)",
			"blob:https://canvas.example.edu/temporary",
			"data:image/png;base64,temporary",
		]) {
			expect(submissionHasContent([{ ...value[0], url }])).toBe(false);
			expect(submissionHtml([{ ...value[0], url }])).toBe("");
		}
	});

	test("empty blocks and whitespace do not create a nonempty submission", () => {
		expect(
			submissionText([{ type: "p", children: [{ text: "  \n " }] }]).trim(),
		).toBe("");
	});
});

test("image-only Canvas drafts inside paragraphs remain submittable", () => {
	expect(
		submissionHasContent([
			{
				type: "p",
				children: [
					{
						type: "img",
						url: "https://canvas.example.edu/image.png",
						children: [{ text: "" }],
					},
				],
			},
		]),
	).toBe(true);
});
