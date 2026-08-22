import { useCanvasSnapshot } from "@canvas-v5/canvas-sdk";
import { type ComponentProps, createContext, useContext } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import rehypeParse from "rehype-parse";
import rehypeReact from "rehype-react";
import { unified } from "unified";
import "katex/dist/katex.min.css";
import { cn } from "@canvas-v5/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import * as ReactKatex from "react-katex";
import { rehypeAdaptCanvasHtmlColors } from "../lib/adapt-canvas-html-colors";
import { CanvasFilePreviewDialog } from "./canvas-file-preview";

const CanvasHtmlLinkContext = createContext<string | undefined>(undefined);
const canvasHtmlComponents = {
	a: CanvasHtmlAnchor,
	img: CanvasHtmlImage,
};

export function CanvasHTML({
	children,
	className,
	...props
}: Omit<ComponentProps<"div">, "children"> & { children?: string }) {
	const snapshot = useCanvasSnapshot();
	const canvasBaseUrl =
		snapshot.activeAccount?.canvasBaseUrl ??
		(snapshot.canvasAuth.status === "authenticated"
			? snapshot.canvasAuth.baseUrl
			: undefined);

	if (!children) return null;

	const processor = unified()
		.use(rehypeParse, { fragment: true })
		.use(rehypeAdaptCanvasHtmlColors)
		.use(rehypeReact, {
			jsx: jsx,
			jsxs: jsxs,
			Fragment: Fragment,
			components: canvasHtmlComponents,
		});

	// Process to React nodes
	const result = processor.processSync(children).result;

	return (
		<CanvasHtmlLinkContext.Provider value={canvasBaseUrl}>
			<div
				className={cn(
					"prose dark:prose-invert prose-neutral **:wrap-anywhere w-full max-w-full [&_img.equation\\_image]:invert [&_img]:inline-block",
					className,
				)}
				{...props}
			>
				{result}
			</div>
		</CanvasHtmlLinkContext.Provider>
	);
}

function CanvasHtmlAnchor({
	href,
	children,
	target: _target,
	rel: _rel,
	...props
}: ComponentProps<"a">) {
	const canvasBaseUrl = useContext(CanvasHtmlLinkContext);
	const link = resolveCanvasHtmlLink(href, canvasBaseUrl);

	if (link?.kind === "file") {
		return (
			<CanvasFilePreviewDialog
				courseId={link.courseId}
				fileId={link.fileId}
				href={link.href}
				triggerProps={{
					"aria-label": props["aria-label"],
					className: props.className,
					id: props.id,
					style: props.style,
					title: props.title,
				}}
			>
				{children}
			</CanvasFilePreviewDialog>
		);
	}

	if (link?.kind === "internal") {
		return (
			<Link {...props} to={link.href as never}>
				{children}
			</Link>
		);
	}

	if (link?.kind === "fragment") {
		return (
			<a {...props} href={link.href}>
				{children}
			</a>
		);
	}

	return (
		<a
			{...props}
			href={link?.href ?? href}
			target="_blank"
			rel="noopener noreferrer"
		>
			{children}
			<ExternalLink className="mx-1 inline-block aspect-square w-[1.25ch]" />
		</a>
	);
}

function CanvasHtmlImage({
	"data-equation-content": latex,
	...props
}: ComponentProps<"img"> & { "data-equation-content"?: string }) {
	return latex ? (
		<ReactKatex.InlineMath math={latex} />
	) : (
		<CanvasImage {...props} />
	);
}

type ResolvedCanvasHtmlLink =
	| { kind: "file"; href: string; courseId: number; fileId: number }
	| { kind: "internal"; href: string }
	| { kind: "fragment"; href: string }
	| { kind: "external"; href: string };

export function resolveCanvasHtmlLink(
	href: string | undefined,
	canvasBaseUrl?: string,
): ResolvedCanvasHtmlLink | undefined {
	if (!href) return undefined;
	if (href.startsWith("#")) return { kind: "fragment", href };

	const baseUrl = parseHttpUrl(canvasBaseUrl);
	const isRootRelative = href.startsWith("/");
	const resolvedUrl = parseHttpUrl(
		isRootRelative && !baseUrl ? `https://canvas.invalid${href}` : href,
		baseUrl,
	);

	if (!resolvedUrl) return { kind: "external", href };

	const isCanvasUrl = isRootRelative
		? true
		: baseUrl
			? resolvedUrl.origin === baseUrl.origin
			: resolvedUrl.hostname === "instructure.com" ||
				resolvedUrl.hostname.endsWith(".instructure.com");

	if (!isCanvasUrl) return { kind: "external", href };

	const fileMatch = resolvedUrl.pathname.match(
		/^\/courses\/(\d+)\/files\/(\d+)(?:\/preview)?\/?$/,
	);
	if (fileMatch) {
		return {
			kind: "file",
			href,
			courseId: Number(fileMatch[1]),
			fileId: Number(fileMatch[2]),
		};
	}

	const appPathname = canvasPathToAppPath(resolvedUrl.pathname);
	if (appPathname) {
		return {
			kind: "internal",
			href: `${appPathname}${resolvedUrl.search}${resolvedUrl.hash}`,
		};
	}

	if (resolvedUrl.hostname === "canvas.invalid") {
		return { kind: "external", href };
	}

	resolvedUrl.searchParams.set("canvas_v5_native", "1");
	return { kind: "external", href: resolvedUrl.toString() };
}

function canvasPathToAppPath(pathname: string) {
	const courseMatch = pathname.match(/^\/courses\/([^/]+)\/?$/);
	if (courseMatch) return `/courses/${courseMatch[1]}`;

	const syllabusMatch = pathname.match(
		/^\/courses\/([^/]+)\/assignments\/syllabus\/?$/,
	);
	if (syllabusMatch) return `/courses/${syllabusMatch[1]}/syllabus`;

	const detailRoutes = [
		["assignments", "assignments"],
		["discussion_topics", "discussions"],
		["pages", "pages"],
		["quizzes", "quizzes"],
	] as const;
	for (const [canvasSegment, appSegment] of detailRoutes) {
		const match = pathname.match(
			new RegExp(`^/courses/([^/]+)/${canvasSegment}/([^/]+)/?$`),
		);
		if (match) return `/courses/${match[1]}/${appSegment}/${match[2]}`;
	}

	const indexRoutes = new Map([
		["announcements", "announcements"],
		["assignments", "assignments"],
		["discussion_topics", "discussions"],
		["discussions", "discussions"],
		["files", "files"],
		["grades", "grades"],
		["modules", "modules"],
		["pages", "pages"],
		["people", "people"],
		["quizzes", "quizzes"],
		["syllabus", "syllabus"],
		["users", "people"],
	]);
	const indexMatch = pathname.match(/^\/courses\/([^/]+)\/([^/]+)\/?$/);
	if (!indexMatch) return undefined;

	const appSegment = indexRoutes.get(indexMatch[2] ?? "");
	return appSegment ? `/courses/${indexMatch[1]}/${appSegment}` : undefined;
}

function parseHttpUrl(value: string | undefined, baseUrl?: URL) {
	if (!value) return undefined;

	try {
		const url = new URL(value, baseUrl);
		return url.protocol === "http:" || url.protocol === "https:"
			? url
			: undefined;
	} catch {
		return undefined;
	}
}

function CanvasImage(props: ComponentProps<"img">) {
	const width = Number.isNaN(Number(props.width))
		? undefined
		: Number(props.width);
	const height = Number.isNaN(Number(props.height))
		? undefined
		: Number(props.height);

	if (
		typeof props.src === "string" &&
		/https:\/\/.*\.instructure\.com.*/.test(props.src ?? "")
	) {
		return (
			<span className="mx-auto block size-max max-w-lg">
				<img
					{...props}
					alt={props.alt ?? ""}
					width={width}
					height={height}
					loading="eager"
					className={cn("relative! inset-0", props.className)}
				/>
			</span>
		);
	}

	return (
		<span className="mx-auto block size-max max-w-lg">
			<img {...props} alt={props.alt ?? ""} width={width} height={height} />
		</span>
	);
}
