import type { Value } from "platejs";

const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(character) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				character
			] ?? character,
	);

export function submissionText(value: Value): string {
	const text = (
		node: Value[number] | Value[number]["children"][number],
	): string =>
		"text" in node
			? String(node.text)
			: (node.children as Value)
					.map(text)
					.join(node.type === "code_block" ? "\n" : "");
	return value.map(text).join("\n");
}

export function submissionHasContent(value: Value): boolean {
	const hasImage = (node: Record<string, unknown>): boolean =>
		(node.type === "img" &&
			typeof node.url === "string" &&
			/^https?:\/\//i.test(node.url)) ||
		(Array.isArray(node.children) && node.children.some(hasImage));
	return submissionText(value).trim().length > 0 || value.some(hasImage);
}

/** Portable Canvas HTML: semantic tags and supported inline marks, without editor attributes/CSS. */
export function submissionHtml(value: Value): string {
	function render(node: Record<string, unknown>): string {
		if (typeof node.text === "string") {
			let html = escapeHtml(node.text).replaceAll("\n", "<br />");
			for (const [mark, tag] of [
				["bold", "strong"],
				["italic", "em"],
				["underline", "u"],
				["strikethrough", "s"],
				["code", "code"],
			] as const) {
				if (node[mark]) html = `<${tag}>${html}</${tag}>`;
			}
			const styles: string[] = [];
			for (const [key, property] of [
				["color", "color"],
				["backgroundColor", "background-color"],
			] as const) {
				const color = node[key];
				if (
					typeof color === "string" &&
					/^(#[\da-f]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\))$/i.test(
						color,
					)
				)
					styles.push(`${property}:${color}`);
			}
			if (styles.length)
				html = `<span style="${escapeHtml(styles.join(";"))}">${html}</span>`;
			return html;
		}
		if (node.type === "img") {
			if (typeof node.url !== "string" || !/^https?:\/\//i.test(node.url))
				return "";
			const endpoint =
				typeof node.apiEndpoint === "string" &&
				/^https?:\/\//i.test(node.apiEndpoint)
					? ` data-api-endpoint="${escapeHtml(node.apiEndpoint)}" data-api-returntype="File"`
					: "";
			return `<img src="${escapeHtml(node.url)}" alt="${escapeHtml(typeof node.alt === "string" ? node.alt : "")}" style="max-width:100%;height:auto"${endpoint} />`;
		}
		if (node.type === "code_block") {
			const lines = Array.isArray(node.children) ? node.children : [];
			const plain = (entry: Record<string, unknown>): string =>
				typeof entry.text === "string"
					? entry.text
					: Array.isArray(entry.children)
						? entry.children.map(plain).join("")
						: "";
			return `<pre><code>${escapeHtml(lines.map(plain).join("\n"))}</code></pre>`;
		}
		const children = Array.isArray(node.children)
			? node.children.map(render).join("")
			: "";
		if (node.type === "a") {
			const href = typeof node.url === "string" ? node.url : "";
			if (/^https?:\/\//i.test(href))
				return `<a href="${escapeHtml(href)}">${children}</a>`;
			return children;
		}
		const tags: Record<string, string> = {
			p: "p",
			h1: "h1",
			h2: "h2",
			h3: "h3",
			blockquote: "blockquote",
			ul: "ul",
			ol: "ol",
			li: "li",
			lic: "div",
		};
		const tag = tags[String(node.type)] ?? "p";
		return `<${tag}>${children || "<br />"}</${tag}>`;
	}
	return value.map(render).join("");
}
