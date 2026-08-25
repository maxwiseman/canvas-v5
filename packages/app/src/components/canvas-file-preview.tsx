import {
	type CanvasFile,
	useCanvasRuntime,
	useCanvasSnapshot,
} from "@canvas-v5/canvas-sdk";
import { Button } from "@canvas-v5/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@canvas-v5/ui/components/dialog";
import { cn } from "@canvas-v5/ui/lib/utils";
import { Download, File, LoaderCircle, LockKeyhole } from "lucide-react";
import {
	type ComponentProps,
	type ReactNode,
	useEffect,
	useState,
} from "react";

export function CanvasFilePreview({
	file,
	loading = false,
	error,
	className,
}: {
	file?: CanvasFile;
	loading?: boolean;
	error?: string;
	className?: string;
}) {
	const snapshot = useCanvasSnapshot();
	const canvasBaseUrl =
		snapshot.activeAccount?.canvasBaseUrl ??
		(snapshot.canvasAuth.status === "authenticated"
			? snapshot.canvasAuth.baseUrl
			: undefined);
	const canvasDocumentPreviewUrl = file
		? getCanvasDocumentPreviewUrl(file, canvasBaseUrl)
		: undefined;

	return (
		<section
			className={cn(
				"relative min-h-96 overflow-hidden rounded-2xl border bg-card",
				className,
			)}
		>
			<div className="relative z-10 flex h-16 items-center gap-3 border-b bg-card px-4 py-3 pr-14">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
					<File className="size-4" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-sm">
						{file?.display_name ?? (loading ? "Loading file…" : "File preview")}
					</p>
					{file ? (
						<p className="truncate text-muted-foreground text-xs">
							{formatCanvasFileMeta(file.size, file.content_type)}
						</p>
					) : null}
				</div>
				{file?.url && !file.locked_for_user ? (
					<Button
						aria-label={`Download ${file.display_name}`}
						className="shrink-0"
						render={
							// biome-ignore lint/a11y/useAnchorContent: The Button's children provide the accessible link label.
							<a href={file.url} rel="noreferrer noopener" target="_blank" />
						}
						size="sm"
						variant="outline"
					>
						<Download data-icon="inline-start" />
						<span className="hidden sm:inline">Download</span>
					</Button>
				) : null}
			</div>

			<div className="absolute inset-x-0 top-16 bottom-0 flex min-h-0 items-center justify-center bg-muted/20">
				<FilePreviewContent
					canvasDocumentPreviewUrl={canvasDocumentPreviewUrl}
					error={error}
					file={file}
					loading={loading}
				/>
			</div>
		</section>
	);
}

export function CanvasFilePreviewDialog({
	courseId,
	fileId,
	href,
	children,
	triggerProps,
}: {
	courseId: number | string;
	fileId: number | string;
	href: string;
	children: ReactNode;
	triggerProps?: Omit<ComponentProps<"button">, "children" | "type">;
}) {
	const runtime = useCanvasRuntime();
	const snapshot = useCanvasSnapshot();
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const normalizedCourseId = Number(courseId);
	const normalizedFileId = Number(fileId);
	const file = snapshot.files.find(
		(candidate) =>
			candidate.course_id === normalizedCourseId &&
			candidate.id === normalizedFileId,
	);
	const sync = snapshot.syncScopes.find((state) => state.scope === "files");

	function handleOpenChange(nextOpen: boolean) {
		setOpen(nextOpen);
		if (!nextOpen || file || !Number.isFinite(normalizedCourseId)) return;

		setLoading(true);
		void runtime
			.syncFile(normalizedCourseId, normalizedFileId)
			.finally(() => setLoading(false));
	}

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogTrigger
				render={
					<button
						{...triggerProps}
						className={cn(
							"cursor-pointer border-0 bg-transparent p-0 text-left font-[inherit] text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary",
							triggerProps?.className,
						)}
						data-canvas-file-href={href}
						type="button"
					/>
				}
			>
				{children}
			</DialogTrigger>
			<DialogContent className="flex h-[80dvh] max-h-168 w-[88vw] grid-rows-[auto_minmax(0,1fr)] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-5xl">
				<DialogHeader className="sr-only">
					<DialogTitle>{file?.display_name ?? "File preview"}</DialogTitle>
					<DialogDescription>
						Preview this Canvas file without leaving the current page.
					</DialogDescription>
				</DialogHeader>
				<CanvasFilePreview
					className="h-full min-h-0 rounded-none border-0"
					error={
						!loading && !file && sync?.status === "error"
							? sync.error
							: undefined
					}
					file={file}
					loading={loading}
				/>
			</DialogContent>
		</Dialog>
	);
}

function FilePreviewContent({
	canvasDocumentPreviewUrl,
	file,
	loading,
	error,
}: {
	canvasDocumentPreviewUrl?: string;
	file?: CanvasFile;
	loading: boolean;
	error?: string;
}) {
	if (loading) {
		return (
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<LoaderCircle className="size-4 animate-spin" />
				Loading preview…
			</div>
		);
	}

	if (error)
		return <PreviewMessage title="Unable to load file">{error}</PreviewMessage>;

	if (!file) {
		return (
			<PreviewMessage title="File unavailable">
				Canvas did not return this file.
			</PreviewMessage>
		);
	}

	if (file.locked_for_user) {
		return (
			<PreviewMessage icon={<LockKeyhole />} title="File locked">
				{file.lock_explanation ?? "This file is not available yet."}
			</PreviewMessage>
		);
	}

	const type = file.content_type?.toLowerCase();
	const originalUrl = file.url;
	const previewUrl = file.preview_url;
	const isPdf =
		type === "application/pdf" ||
		[file.display_name, file.filename].some((name) =>
			name?.toLowerCase().endsWith(".pdf"),
		);
	const isOfficeDocument = isCanvasOfficeDocument(file);

	if (isPdf && originalUrl) {
		return (
			<AuthenticatedPdfPreview name={file.display_name} url={originalUrl} />
		);
	}

	if (type?.startsWith("image/") && originalUrl) {
		return (
			<img
				alt={file.display_name}
				className="absolute inset-0 size-full object-contain p-4"
				src={originalUrl}
			/>
		);
	}

	if (type?.startsWith("video/") && originalUrl) {
		return (
			// biome-ignore lint/a11y/useMediaCaption: Canvas file metadata does not expose a matching caption track.
			<video
				className="absolute inset-0 size-full object-contain"
				controls
				preload="metadata"
				src={originalUrl}
			/>
		);
	}

	if (type?.startsWith("audio/") && originalUrl) {
		// biome-ignore lint/a11y/useMediaCaption: Canvas file metadata does not expose a matching caption track.
		return <audio className="w-full max-w-xl" controls src={originalUrl} />;
	}

	if (isOfficeDocument && canvasDocumentPreviewUrl) {
		return (
			<iframe
				allowFullScreen
				className="size-full border-0 bg-background"
				src={canvasDocumentPreviewUrl}
				title={`${file.display_name} preview`}
			/>
		);
	}

	if (!previewUrl) {
		return (
			<PreviewMessage
				action={<FileDownloadButton file={file} />}
				title="Preview unavailable"
			>
				This file can’t be previewed here.
			</PreviewMessage>
		);
	}

	return (
		<iframe
			allowFullScreen
			className="size-full border-0 bg-background"
			src={previewUrl}
			title={`${file.display_name} preview`}
		/>
	);
}

function AuthenticatedPdfPreview({ name, url }: { name: string; url: string }) {
	const [preview, setPreview] = useState<{
		url?: string;
		error?: string;
		loading: boolean;
	}>({ loading: true });

	useEffect(() => {
		let cancelled = false;
		let objectUrl: string | undefined;

		setPreview({ loading: true });
		void fetch(url, { credentials: "include" })
			.then((response) => {
				if (!response.ok) {
					throw new Error(`Canvas returned ${response.status}.`);
				}
				return response.blob();
			})
			.then((blob) => {
				if (cancelled) return;
				objectUrl = URL.createObjectURL(blob);
				setPreview({ loading: false, url: objectUrl });
			})
			.catch((cause) => {
				if (cancelled) return;
				setPreview({
					loading: false,
					error:
						cause instanceof Error ? cause.message : "Unable to load this PDF.",
				});
			});

		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [url]);

	if (preview.loading) {
		return (
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<LoaderCircle className="size-4 animate-spin" />
				Loading PDF…
			</div>
		);
	}

	if (!preview.url) {
		return (
			<PreviewMessage title="Preview unavailable">
				{preview.error ?? "Unable to load this PDF."}
			</PreviewMessage>
		);
	}

	return (
		<iframe
			className="size-full border-0 bg-background"
			height="100%"
			src={preview.url}
			title={`${name} preview`}
			width="100%"
		/>
	);
}

function PreviewMessage({
	icon,
	title,
	children,
	action,
}: {
	icon?: ReactNode;
	title: string;
	children: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="flex max-w-sm flex-col items-center gap-2 px-6 text-center">
			{icon ? (
				<div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground [&_svg]:size-4">
					{icon}
				</div>
			) : null}
			<p className="font-medium text-sm">{title}</p>
			<p className="text-muted-foreground text-sm">{children}</p>
			{action ? <div className="mt-2">{action}</div> : null}
		</div>
	);
}

function FileDownloadButton({ file }: { file: CanvasFile }) {
	if (!file.url) return null;

	return (
		<Button
			render={
				// biome-ignore lint/a11y/useAnchorContent: The Button's children provide the accessible link label.
				<a
					download={file.filename ?? file.display_name}
					href={file.url}
					rel="noreferrer noopener"
					target="_blank"
				/>
			}
			size="sm"
		>
			<Download data-icon="inline-start" />
			Download
		</Button>
	);
}

const canvasOfficeExtensions = new Set(["docx", "pptx", "xlsx"]);
const canvasOfficeContentTypes = new Set([
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function isCanvasOfficeDocument(file: CanvasFile) {
	const contentType = file.content_type?.toLowerCase();
	if (contentType && canvasOfficeContentTypes.has(contentType)) return true;

	const name = file.filename ?? file.display_name;
	const extension = name.toLowerCase().split(".").at(-1);
	return extension ? canvasOfficeExtensions.has(extension) : false;
}

export function getCanvasDocumentPreviewUrl(
	file: CanvasFile,
	canvasBaseUrl?: string,
	currentOrigin = typeof window === "undefined"
		? undefined
		: window.location.origin,
) {
	if (!isCanvasOfficeDocument(file) || !canvasBaseUrl || !currentOrigin) {
		return undefined;
	}

	try {
		const previewUrl = new URL(
			`/courses/${file.course_id}/files/${file.id}/preview`,
			canvasBaseUrl,
		);
		if (previewUrl.origin !== currentOrigin) return undefined;

		previewUrl.searchParams.set("canvas_v5_native", "1");
		return previewUrl.toString();
	} catch {
		return undefined;
	}
}

export function formatCanvasFileMeta(size?: number, type?: string) {
	const parts = [];
	if (type) parts.push(type);
	if (size !== undefined) {
		parts.push(
			new Intl.NumberFormat(undefined, {
				style: "unit",
				unit: "byte",
				notation: "compact",
			}).format(size),
		);
	}
	return parts.join(" · ") || "Course file";
}

export function shortCanvasFileType(type: string) {
	return type.split("/").at(-1)?.toUpperCase() ?? type;
}
