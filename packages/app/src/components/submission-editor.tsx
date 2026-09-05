import { Button } from "@canvas-v5/ui/components/button";
import { Input } from "@canvas-v5/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "@canvas-v5/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@canvas-v5/ui/components/select";
import { Separator } from "@canvas-v5/ui/components/separator";
import {
	BlockquotePlugin,
	BoldPlugin,
	CodePlugin,
	H1Plugin,
	H2Plugin,
	H3Plugin,
	ItalicPlugin,
	StrikethroughPlugin,
	UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import {
	FontBackgroundColorPlugin,
	FontColorPlugin,
} from "@platejs/basic-styles/react";
import { toggleCodeBlock, unwrapCodeBlock } from "@platejs/code-block";
import { CodeBlockPlugin, CodeLinePlugin } from "@platejs/code-block/react";
import { upsertLink } from "@platejs/link";
import { LinkPlugin } from "@platejs/link/react";
import { ListPlugin } from "@platejs/list-classic/react";
import { ImagePlugin } from "@platejs/media/react";
import {
	Bold,
	Code,
	ImagePlus,
	Italic,
	Link as LinkIcon,
	List,
	ListOrdered,
	LoaderCircle,
	Quote,
	Redo2,
	SquareCode,
	Strikethrough,
	Underline,
	Undo2,
} from "lucide-react";
import type { TRange, Value } from "platejs";
import {
	Plate,
	PlateContent,
	PlateElement,
	type PlateElementProps,
	PlateLeaf,
	type PlateLeafProps,
	useEditorRef,
	useEditorSelector,
	usePlateEditor,
} from "platejs/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { SubmissionColorButton } from "./submission-color-button";

function Element(props: PlateElementProps) {
	const tags = {
		p: "p",
		h1: "h1",
		h2: "h2",
		h3: "h3",
		blockquote: "blockquote",
		ul: "ul",
		ol: "ol",
		li: "li",
		lic: "div",
	} as const;
	const tag = tags[props.element.type as keyof typeof tags] ?? "p";
	return <PlateElement {...props} as={tag} />;
}
function LinkElement(props: PlateElementProps) {
	return (
		<PlateElement
			{...props}
			as="a"
			attributes={{
				...props.attributes,
				href: String(props.element.url),
				onClick: (event) => event.preventDefault(),
			}}
		/>
	);
}
function CodeLeaf(props: PlateLeafProps) {
	return (
		<PlateLeaf
			{...props}
			as="code"
			className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] before:content-none after:content-none"
		/>
	);
}
function CodeBlockElement(props: PlateElementProps) {
	return (
		<PlateElement
			{...props}
			as="pre"
			className="my-4 overflow-x-auto rounded-xl bg-muted p-4 font-mono text-sm leading-6"
		>
			<code>{props.children}</code>
		</PlateElement>
	);
}
function CodeLineElement(props: PlateElementProps) {
	return <PlateElement {...props} as="div" />;
}
function ImageElement(props: PlateElementProps) {
	return (
		<PlateElement {...props} className="my-6">
			<div contentEditable={false}>
				<img
					alt={String(props.element.alt ?? "")}
					className="m-0 max-h-[32rem] max-w-full object-contain"
					draggable={false}
					src={String(props.element.url)}
				/>
			</div>
			{props.children}
		</PlateElement>
	);
}
export type SubmissionImage = {
	url: string;
	fileId?: number;
	apiEndpoint?: string;
};
const blockStyles = [
	{ value: "p", label: "Text" },
	{ value: "h1", label: "Heading 1" },
	{ value: "h2", label: "Heading 2" },
	{ value: "h3", label: "Heading 3" },
	{ value: "blockquote", label: "Quote" },
	{ value: "code_block", label: "Code block" },
];

function Leaf(props: PlateLeafProps) {
	const { leaf } = props;
	return (
		<PlateLeaf
			{...props}
			style={{
				fontWeight: leaf.bold ? "bold" : undefined,
				fontStyle: leaf.italic ? "italic" : undefined,
				textDecoration:
					[leaf.underline && "underline", leaf.strikethrough && "line-through"]
						.filter(Boolean)
						.join(" ") || undefined,
			}}
		/>
	);
}

export default function SubmissionEditor({
	value,
	canvasBaseUrl,
	onChange,
	disabled,
	onUploadImage,
	onUploadingChange,
}: {
	value: Value | string;
	canvasBaseUrl?: string;
	onChange: (value: Value, edited?: boolean) => void;
	disabled: boolean;
	onUploadImage: (file: File) => Promise<SubmissionImage>;
	onUploadingChange: (uploading: boolean) => void;
}) {
	const editor = usePlateEditor({
		plugins: [
			BoldPlugin.withComponent(Leaf),
			CodePlugin.withComponent(CodeLeaf),
			CodeBlockPlugin.withComponent(CodeBlockElement),
			CodeLinePlugin.withComponent(CodeLineElement),
			ImagePlugin.configure({
				options: { disableUploadInsert: true, disableEmbedInsert: true },
				parsers: {
					html: {
						deserializer: {
							parse: ({ element, type }) => ({
								type,
								url: element.getAttribute("src"),
								alt: element.getAttribute("alt") ?? "",
								apiEndpoint:
									element.getAttribute("data-api-endpoint") ?? undefined,
							}),
						},
					},
				},
			}).withComponent(ImageElement),
			ItalicPlugin.withComponent(Leaf),
			UnderlinePlugin.withComponent(Leaf),
			StrikethroughPlugin.withComponent(Leaf),
			H1Plugin.withComponent(Element),
			H2Plugin.withComponent(Element),
			H3Plugin.withComponent(Element),
			BlockquotePlugin.withComponent(Element),
			FontColorPlugin,
			FontBackgroundColorPlugin,
			ListPlugin,
			LinkPlugin.withComponent(LinkElement),
		],
		components: {
			p: Element,
			ul: Element,
			ol: Element,
			li: Element,
			lic: Element,
		},
		value:
			typeof value === "string"
				? (editor) => {
						const document = new DOMParser().parseFromString(
							value,
							"text/html",
						);
						// Canvas HTML may contain instance-relative attachment and link URLs.
						if (canvasBaseUrl)
							for (const element of document.querySelectorAll(
								"[src], [href]",
							)) {
								for (const attribute of ["src", "href"]) {
									const url = element.getAttribute(attribute);
									if (url) {
										try {
											element.setAttribute(
												attribute,
												new URL(url, canvasBaseUrl).toString(),
											);
										} catch {
											element.removeAttribute(attribute);
										}
									}
								}
							}
						const nodes = editor.api.html.deserialize({
							element: document.body,
						});
						return (
							nodes.length
								? nodes.map((node) =>
										"children" in node ? node : { type: "p", children: [node] },
									)
								: [{ type: "p", children: [{ text: "" }] }]
						) as Value;
					}
				: value,
	});
	const reportInitialValue = useEffectEvent((initial: Value) =>
		onChange(initial, false),
	);
	useEffect(() => {
		reportInitialValue(editor.children);
	}, [editor]);
	return (
		<Plate
			editor={editor}
			onValueChange={({ value }) => onChange(value)}
			readOnly={disabled}
		>
			<EditorToolbar
				disabled={disabled}
				onUploadImage={onUploadImage}
				onUploadingChange={onUploadingChange}
			/>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-background">
				<PlateContent
					aria-label="Submission text"
					className="prose dark:prose-invert w-full max-w-none flex-1 px-6 py-10 text-base leading-8 outline-none sm:px-16 lg:px-24 [&_a]:text-primary [&_a]:underline [&_li]:my-1 [&_ol]:list-decimal [&_pre]:text-foreground [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc"
					placeholder="Start writing your submission…"
				/>
			</div>
		</Plate>
	);
}

function EditorToolbar({
	disabled,
	onUploadImage,
	onUploadingChange,
}: {
	disabled: boolean;
	onUploadImage: (file: File) => Promise<SubmissionImage>;
	onUploadingChange: (uploading: boolean) => void;
}) {
	const editor = useEditorRef();
	const marks = useEditorSelector((editor) => editor.api.marks(), []);
	const blockType = useEditorSelector(
		(editor) => editor.api.block()?.[0].type ?? "p",
		[],
	);
	const savedSelection = useRef<TRange | null>(null);
	const [linkOpen, setLinkOpen] = useState(false);
	const [href, setHref] = useState("");
	function act(action: () => void) {
		action();
		editor.tf.focus();
	}
	return (
		<div className="shrink-0 border-y bg-background px-4 py-2">
			<fieldset
				aria-label="Text formatting"
				className="flex flex-wrap items-center gap-1"
			>
				<Select
					items={blockStyles}
					value={
						blockType === "code_line"
							? "code_block"
							: blockStyles.some((item) => item.value === blockType)
								? blockType
								: "p"
					}
					disabled={disabled}
					onOpenChange={(open) => {
						if (open) savedSelection.current = editor.selection;
					}}
					onValueChange={(value) => {
						if (!value) return;
						if (savedSelection.current)
							editor.tf.select(savedSelection.current);
						if (value === "code_block") {
							if (blockType !== "code_line" && blockType !== "code_block")
								toggleCodeBlock(editor);
						} else {
							if (blockType === "code_line" || blockType === "code_block")
								unwrapCodeBlock(editor);
							editor.tf.setNodes({ type: value });
						}
					}}
				>
					<SelectTrigger aria-label="Text style" className="w-36" size="sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent
						align="start"
						alignItemWithTrigger={false}
						finalFocus={() => {
							editor.tf.focus();
							return false;
						}}
					>
						<SelectGroup>
							{blockStyles.map(({ value, label }) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				<Separator orientation="vertical" className="mx-1 min-h-6" />
				{(
					[
						["bold", "Bold", Bold],
						["italic", "Italic", Italic],
						["underline", "Underline", Underline],
						["strikethrough", "Strikethrough", Strikethrough],
						["code", "Inline code", Code],
					] as const
				).map(([key, label, Icon]) => (
					<Button
						aria-label={label}
						aria-pressed={!!marks?.[key]}
						disabled={disabled}
						key={key}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => act(() => editor.tf.toggleMark(key))}
						size="icon-sm"
						title={label}
						variant={marks?.[key] ? "secondary" : "ghost"}
					>
						<Icon />
					</Button>
				))}
				<SubmissionColorButton mark="color" disabled={disabled} />
				<SubmissionColorButton mark="backgroundColor" disabled={disabled} />
				<Separator orientation="vertical" className="mx-1 min-h-6" />
				{[
					{
						label: "Bulleted list",
						Icon: List,
						action: () =>
							editor.getTransforms(ListPlugin).toggle.bulletedList(),
					},
					{
						label: "Numbered list",
						Icon: ListOrdered,
						action: () =>
							editor.getTransforms(ListPlugin).toggle.numberedList(),
					},
					{
						label: "Block quote",
						Icon: Quote,
						action: () => editor.tf.setNodes({ type: "blockquote" }),
					},
					{
						label: "Code block",
						Icon: SquareCode,
						action: () => toggleCodeBlock(editor),
					},
					{ label: "Undo", Icon: Undo2, action: () => editor.tf.undo() },
					{ label: "Redo", Icon: Redo2, action: () => editor.tf.redo() },
				].map(({ label, Icon, action }) => (
					<Button
						aria-label={label}
						disabled={disabled}
						key={label}
						onClick={() => act(action)}
						onMouseDown={(event) => event.preventDefault()}
						size="icon-sm"
						title={label}
						variant="ghost"
					>
						<Icon />
					</Button>
				))}
				<Button
					aria-label="Add link"
					disabled={disabled}
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => setLinkOpen(!linkOpen)}
					size="icon-sm"
					title="Add link"
					variant="ghost"
				>
					<LinkIcon />
				</Button>
				<EditorImageButton
					disabled={disabled}
					onUploadImage={onUploadImage}
					onUploadingChange={onUploadingChange}
				/>
			</fieldset>
			{linkOpen ? (
				<form
					className="mt-2 flex gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (!/^https?:\/\//i.test(href)) return;
						act(() => upsertLink(editor, { url: href }));
						setLinkOpen(false);
						setHref("");
					}}
				>
					<input
						aria-label="Link URL"
						className="min-w-0 flex-1 rounded-md border bg-background px-2"
						onChange={(event) => setHref(event.target.value)}
						placeholder="https://…"
						type="url"
						value={href}
					/>
					<Button size="sm" type="submit">
						Insert link
					</Button>
				</form>
			) : null}
		</div>
	);
}

function EditorImageButton({
	disabled,
	onUploadImage,
	onUploadingChange,
}: {
	disabled: boolean;
	onUploadImage: (file: File) => Promise<SubmissionImage>;
	onUploadingChange: (uploading: boolean) => void;
}) {
	const editor = useEditorRef();
	const selection = useRef<TRange | null>(null);
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	const [alt, setAlt] = useState("");
	const [error, setError] = useState<string>();
	const [uploading, setUploading] = useState(false);
	function insert(image: SubmissionImage) {
		if (!/^https?:\/\//i.test(image.url))
			throw new Error("Enter an HTTP or HTTPS image URL.");
		if (selection.current) editor.tf.select(selection.current);
		editor.tf.insertNodes(
			[
				{ type: "img", ...image, alt, children: [{ text: "" }] },
				{ type: "p", children: [{ text: "" }] },
			],
			{ select: true },
		);
		setOpen(false);
		setUrl("");
		setAlt("");
	}
	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (uploading) return;
				if (next) {
					selection.current = editor.selection;
					setError(undefined);
				}
				setOpen(next);
			}}
		>
			<PopoverTrigger
				render={
					<Button
						aria-label="Insert image"
						disabled={disabled}
						size="icon-sm"
						title="Insert image"
						variant="ghost"
					/>
				}
			>
				<ImagePlus />
			</PopoverTrigger>
			<PopoverContent
				align="end"
				finalFocus={() => {
					editor.tf.focus();
					return false;
				}}
			>
				<PopoverTitle>Insert image</PopoverTitle>
				<Input
					aria-label="Image description"
					placeholder="Description (alt text)"
					disabled={uploading}
					onChange={(event) => setAlt(event.target.value)}
					value={alt}
				/>
				<Input
					aria-label="Upload image"
					type="file"
					accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
					disabled={uploading}
					onChange={async (event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						if (!file) return;
						setUploading(true);
						onUploadingChange(true);
						setError(undefined);
						try {
							insert(await onUploadImage(file));
						} catch (error) {
							setError(
								error instanceof Error
									? error.message
									: "Unable to upload this image.",
							);
						} finally {
							setUploading(false);
							onUploadingChange(false);
						}
					}}
				/>
				<p className="text-muted-foreground text-xs">
					Or insert an image from the web.
				</p>
				<form
					className="flex flex-col gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						try {
							insert({ url });
						} catch (error) {
							setError(
								error instanceof Error
									? error.message
									: "Unable to insert image.",
							);
						}
					}}
				>
					<Input
						aria-label="Image URL"
						type="url"
						placeholder="https://…"
						required
						disabled={uploading}
						value={url}
						onChange={(event) => setUrl(event.target.value)}
					/>
					<Button
						type="submit"
						disabled={uploading || !/^https?:\/\//i.test(url)}
					>
						Insert image
					</Button>
				</form>
				{uploading ? (
					<p
						className="flex items-center gap-2 text-muted-foreground text-sm"
						role="status"
					>
						<LoaderCircle className="size-4 animate-spin" />
						Uploading image…
					</p>
				) : null}
				{error ? (
					<p className="text-destructive text-sm" role="alert">
						{error}
					</p>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
