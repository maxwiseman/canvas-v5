import type { ComponentProps } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import rehypeParse from "rehype-parse";
import rehypeReact from "rehype-react";
import { unified } from "unified";
// import { CanvasFileModal } from "@/components/canvas-file-modal";
import "katex/dist/katex.min.css";
import { cn } from "@canvas-v5/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { InlineMath } from "react-katex";

export function CanvasHTML({
	children,
	className,
	...props
}: Omit<ComponentProps<"div">, "children"> & { children?: string }) {
	if (!children) return null;

	const processor = unified()
		.use(rehypeParse, { fragment: true })
		.use(rehypeReact, {
			jsx: jsx,
			jsxs: jsxs,
			Fragment: Fragment,
			components: {
				a: ({ href, children, ...props }: ComponentProps<"a">) => {
					// Detect Canvas file links and open them as modals
					// const fileMatch = href?.match(/\/courses\/(\d+)\/files\/(\d+)/);
					// if (fileMatch) {
					// 	const [, courseId, fileId] = fileMatch;
					// 	return (
					// 		<CanvasFileModal courseId={courseId} fileId={fileId}>
					// 			{children}
					// 		</CanvasFileModal>
					// 	);
					// }

					if (/instructure\.com/.test(href ?? "")) {
						return (
							<Link
								{...props}
								to={href?.replace(
									/https?:\/\/(?:[^/]+\.)?instructure\.com/,
									"",
								)}
								target="_blank"
							>
								{children}
							</Link>
						);
					}

					return (
						<a {...props} href={href} target="_blank" rel="noopener">
							{children}
							<ExternalLink className="mx-1 inline-block aspect-square w-[1.25ch]" />
						</a>
					);
				},

				img: ({
					"data-equation-content": latex,
					...props
				}: ComponentProps<"img"> & { "data-equation-content"?: string }) =>
					latex ? <InlineMath math={latex} /> : <CanvasImage {...props} />,
			},
		});

	// Process to React nodes
	const result = processor.processSync(children).result;

	return (
		<div
			className={cn(
				"prose dark:prose-invert prose-neutral **:wrap-anywhere w-full max-w-full [&_img.equation\\_image]:invert [&_img]:inline-block",
				className,
			)}
			{...props}
		>
			{result}
		</div>
	);
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
				{/* @ts-expect-error */}
				<Image
					alt=""
					src=""
					{...props}
					width={width}
					ref={undefined}
					height={height}
					fill={height === undefined && width === undefined}
					loading="eager"
					className="relative! inset-0"
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
