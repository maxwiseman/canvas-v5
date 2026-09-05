import {
	type CanvasAssignment,
	type CanvasSubmissionInput,
	useCanvasRuntime,
	useTextSubmissionDraft,
} from "@canvas-v5/canvas-sdk";
import { Button } from "@canvas-v5/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@canvas-v5/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@canvas-v5/ui/components/dialog";
import { Input } from "@canvas-v5/ui/components/input";
import { Tabs, TabsContent } from "@canvas-v5/ui/components/tabs";
import {
	CheckCircle2,
	ExternalLink,
	FileUp,
	LoaderCircle,
	PenLine,
	Send,
	X,
} from "lucide-react";
import type { Value } from "platejs";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import {
	submissionHasContent,
	submissionHtml,
	submissionText,
} from "./submission-rich-text";
import { SubmissionTypeTabs } from "./submission-type-tabs";

const SubmissionEditor = lazy(() => import("./submission-editor"));
const nativeInstructions: Record<string, [string, string]> = {
	media_recording: [
		"Record or upload audio and video using Canvas’s media tools.",
		"Open Canvas media tools",
	],
	student_annotation: [
		"Annotate the document provided by your instructor in Canvas.",
		"Annotate in Canvas",
	],
	online_quiz: ["Complete this quiz in Canvas.", "Open quiz in Canvas"],
	discussion_topic: [
		"Post your response in the assignment’s Canvas discussion.",
		"Open discussion in Canvas",
	],
	external_tool: [
		"Complete this assignment in its connected submission tool.",
		"Open submission tool",
	],
	basic_lti_launch: [
		"Complete this assignment in its connected submission tool.",
		"Open submission tool",
	],
};

export function isValidSubmissionUrl(value: string) {
	try {
		return ["http:", "https:"].includes(new URL(value).protocol);
	} catch {
		return false;
	}
}
export function acceptsSubmissionFile(fileName: string, extensions?: string[]) {
	return (
		!extensions?.length ||
		extensions.some((extension) =>
			fileName
				.toLowerCase()
				.endsWith(`.${extension.replace(/^\./, "").toLowerCase()}`),
		)
	);
}

export function AssignmentSubmission({
	assignment,
}: {
	assignment: CanvasAssignment;
}) {
	const runtime = useCanvasRuntime();
	const fieldId = useId();
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const types = [...new Set(assignment.submission_types ?? [])];
	const [selectedType, setSelectedType] = useState(types[0] ?? "none");
	const type = types.includes(selectedType)
		? selectedType
		: (types[0] ?? "none");
	const [value, setValue] = useState<Value | string>([
		{ type: "p", children: [{ text: "" }] },
	]);
	const [url, setUrl] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [uploaded, setUploaded] = useState<Map<File, number>>(new Map());
	const [open, setOpen] = useState(false);
	const [submitting, setBusy] = useState(false);
	const [imageUploading, setImageUploading] = useState(false);
	const busy = submitting || imageUploading;
	const [status, setStatus] = useState<string>();
	const [error, setError] = useState<string>();
	const [success, setSuccess] = useState(false);
	const {
		id: draftId,
		draft,
		loading: draftLoading,
		error: draftError,
		reload: reloadDraft,
	} = useTextSubmissionDraft(
		assignment.course_id,
		assignment.id,
		types.includes("online_text_entry"),
	);
	const [openingEditor, setOpeningEditor] = useState(false);
	const [editorVersion, setEditorVersion] = useState(0);
	async function retryDraft() {
		await reloadDraft();
		const restored = runtime
			.getSnapshot()
			.submissionDrafts.find((item) => item.id === draftId);
		if (restored && !restored.pending) {
			setValue(restored.body);
			setEditorVersion((version) => version + 1);
		}
	}
	async function openEditor() {
		setOpeningEditor(true);
		await reloadDraft();
		if (!mounted.current) return;
		const restored = runtime
			.getSnapshot()
			.submissionDrafts.find((item) => item.id === draftId);
		setValue(restored?.body ?? "");
		setOpeningEditor(false);
		setOpen(true);
	}
	const draftMessage = draftLoading
		? "Loading draft…"
		: draft?.status === "conflict"
			? "Draft needs review"
			: draft?.status === "saving"
				? "Saving to Canvas…"
				: draft?.pending
					? draft.localSaved
						? "Saved on this device · Waiting for Canvas"
						: "Saving draft…"
					: draft?.status === "saved"
						? "Saved to Canvas"
						: "Canvas draft sync unavailable";
	const plainText = (
		typeof value === "string"
			? value.replace(/<[^>]*>/g, " ")
			: submissionText(value)
	).trim();
	const hasContent =
		typeof value === "string" ? !!value.trim() : submissionHasContent(value);
	const words = plainText ? plainText.split(/\s+/u).length : 0;
	const offline = ["none", "on_paper", "not_graded"].includes(type);
	const available =
		assignment.can_submit !== false &&
		!assignment.locked_for_user &&
		!(
			assignment.allowed_attempts &&
			assignment.allowed_attempts > 0 &&
			(assignment.submission?.attempt ?? 0) >= assignment.allowed_attempts
		);
	const native = nativeInstructions[type] ?? [
		"Continue this submission using Canvas.",
		"Open in Canvas",
	];
	let canvasUrl = assignment.html_url;
	if (canvasUrl) {
		try {
			const destination = new URL(canvasUrl);
			if (type === "online_quiz" && assignment.quiz_id)
				destination.pathname = `/courses/${assignment.course_id}/quizzes/${assignment.quiz_id}`;
			if (
				type === "discussion_topic" &&
				typeof assignment.discussion_topic === "object" &&
				assignment.discussion_topic !== null &&
				"id" in assignment.discussion_topic
			)
				destination.pathname = `/courses/${assignment.course_id}/discussion_topics/${assignment.discussion_topic.id}`;
			destination.searchParams.set("canvas_v5_native", "1");
			canvasUrl = destination.toString();
		} catch {
			canvasUrl = undefined;
		}
	}

	async function submit(input: CanvasSubmissionInput | { type: "files" }) {
		if (busy || !available) return;
		const accountId = runtime.getSnapshot().activeAccount?.id;
		const assertCurrentTarget = () => {
			if (
				!mounted.current ||
				runtime.getSnapshot().activeAccount?.id !== accountId
			)
				throw new Error(
					"Submission stopped because the assignment or account changed.",
				);
		};
		setBusy(true);
		setError(undefined);
		setSuccess(false);
		try {
			let payload: CanvasSubmissionInput;
			if (input.type === "files") {
				if (
					!files.length ||
					files.some(
						(file) =>
							!acceptsSubmissionFile(file.name, assignment.allowed_extensions),
					)
				)
					throw new Error(
						"Choose files that match the assignment’s accepted file types.",
					);
				const ids: number[] = [];
				for (const [index, file] of files.entries()) {
					assertCurrentTarget();
					setStatus(`Uploading file ${index + 1} of ${files.length}…`);
					let id = uploaded.get(file);
					if (!id) {
						id = await runtime.uploadAssignmentFile(
							assignment.course_id,
							assignment.id,
							file,
						);
						const uploadedId = id;
						setUploaded((previous) => new Map(previous).set(file, uploadedId));
					}
					ids.push(id);
				}
				payload = { type: "online_upload", fileIds: ids };
			} else payload = input;
			assertCurrentTarget();
			setStatus("Submitting to Canvas…");
			await runtime.submitAssignment(
				assignment.course_id,
				assignment.id,
				payload,
			);
			setSuccess(true);
			setValue("");
			setOpen(false);
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: "Unable to submit. Your draft is still here.",
			);
		} finally {
			setBusy(false);
			setStatus(undefined);
		}
	}

	const draftStatus = (
		<div className="space-y-1 text-muted-foreground text-xs" aria-live="polite">
			<p>{draftMessage}</p>
			{draft?.error || draftError ? (
				<p className="text-destructive">{draft?.error ?? draftError}</p>
			) : null}
			{draft?.status === "conflict" && draftId ? (
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="outline"
						onClick={async () => {
							await runtime.resolveTextDraft(draftId, true);
						}}
					>
						Keep this draft
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={async () => {
							await runtime.resolveTextDraft(draftId, false);
							setValue(draft.remoteBody ?? "");
							setOpen(false);
						}}
					>
						Use Canvas draft
					</Button>
				</div>
			) : draft?.status === "error" || draftError ? (
				<Button size="sm" variant="outline" onClick={() => void retryDraft()}>
					Retry draft sync
				</Button>
			) : null}
		</div>
	);
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>
					{assignment.submission?.attempt
						? "Submit again"
						: "Submit assignment"}
				</CardTitle>
				<CardDescription>
					{offline
						? "Submission requirements"
						: "Choose how to turn in your work."}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Tabs
					value={type}
					onValueChange={(value) => {
						if (typeof value === "string") {
							setSelectedType(value);
							setError(undefined);
							setSuccess(false);
						}
					}}
				>
					{types.length > 1 ? (
						<SubmissionTypeTabs types={types} disabled={busy} />
					) : null}
					<TabsContent className="flex flex-col gap-3 pt-2" value={type}>
						{offline ? (
							<p className="text-muted-foreground text-sm">
								{type === "on_paper"
									? "Turn in your work in person as instructed. No online submission is needed."
									: "No online submission is required for this assignment."}
							</p>
						) : !available ? (
							<p className="text-muted-foreground text-sm">
								{assignment.lock_explanation ||
									"This assignment is not accepting submissions. Check its availability and remaining attempts."}
							</p>
						) : type === "online_text_entry" ? (
							<>
								<p className="text-muted-foreground text-sm">
									Write and format your response in a spacious editor.
								</p>
								<Button
									disabled={openingEditor || draftLoading || !draftId}
									onClick={() => void openEditor()}
								>
									<PenLine data-icon="inline-start" />
									{openingEditor
										? "Loading draft…"
										: hasContent || draft?.body
											? "Continue writing"
											: "Write submission"}
								</Button>
								{draftStatus}
								{words > 0 ? (
									<p className="text-muted-foreground text-xs">
										{words} {words === 1 ? "word" : "words"} in your draft
									</p>
								) : null}
							</>
						) : type === "online_url" ? (
							<form
								className="flex flex-col gap-3"
								onSubmit={(event) => {
									event.preventDefault();
									if (isValidSubmissionUrl(url.trim()))
										void submit({ type: "online_url", url: url.trim() });
								}}
							>
								<label
									htmlFor={`${fieldId}-url`}
									className="flex flex-col gap-2 text-sm"
								>
									Website URL
									<Input
										id={`${fieldId}-url`}
										disabled={busy}
										onChange={(event) => setUrl(event.target.value)}
										placeholder="https://…"
										required
										type="url"
										value={url}
									/>
								</label>
								<Button
									disabled={busy || !isValidSubmissionUrl(url.trim())}
									type="submit"
								>
									<Send data-icon="inline-start" />
									Submit website
								</Button>
							</form>
						) : type === "online_upload" ? (
							<>
								<label
									htmlFor={`${fieldId}-files`}
									className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/20 p-5 text-center text-sm"
								>
									<FileUp className="size-6 text-muted-foreground" />
									<span>Choose files to upload</span>
									<Input
										accept={assignment.allowed_extensions
											?.map((extension) => `.${extension.replace(/^\./, "")}`)
											.join(",")}
										id={`${fieldId}-files`}
										aria-label="Choose submission files"
										className="mt-1 h-auto min-w-0 text-xs file:mr-2"
										disabled={busy}
										multiple
										onChange={(event) => {
											const selected = Array.from(event.target.files ?? []);
											const invalid = selected.filter(
												(file) =>
													!acceptsSubmissionFile(
														file.name,
														assignment.allowed_extensions,
													),
											);
											if (invalid.length) {
												setError(
													`Unsupported file type: ${invalid.map((file) => file.name).join(", ")}`,
												);
											} else {
												setFiles((files) => [...files, ...selected]);
												setError(undefined);
												setSuccess(false);
											}
											event.target.value = "";
										}}
										type="file"
									/>
								</label>
								{assignment.allowed_extensions?.length ? (
									<p className="text-muted-foreground text-xs">
										Accepted: {assignment.allowed_extensions.join(", ")}
									</p>
								) : null}
								{files.length ? (
									<ul className="flex flex-col gap-2">
										{files.map((file, index) => (
											<li
												className="flex min-w-0 items-center gap-2 rounded-lg border py-2 pr-1 pl-3"
												key={`${file.name}-${index}`}
											>
												<span className="min-w-0 flex-1 break-all text-sm">
													{file.name}
													<span className="block text-muted-foreground text-xs">
														{Math.max(
															1,
															Math.round(file.size / 1024),
														).toLocaleString()}{" "}
														KB
													</span>
												</span>
												<Button
													aria-label={`Remove ${file.name}`}
													disabled={busy}
													onClick={() =>
														setFiles((files) =>
															files.filter(
																(_, candidate) => candidate !== index,
															),
														)
													}
													size="icon-sm"
													variant="ghost"
												>
													<X />
												</Button>
											</li>
										))}
									</ul>
								) : null}
								<Button
									disabled={busy || !files.length}
									onClick={() => void submit({ type: "files" })}
								>
									<Send data-icon="inline-start" />
									Submit {files.length === 1 ? "file" : "files"}
								</Button>
							</>
						) : (
							<>
								<p className="text-muted-foreground text-sm">{native[0]}</p>
								{canvasUrl ? (
									<a
										className="inline-flex items-center gap-2 text-primary text-sm underline underline-offset-4"
										href={canvasUrl}
										rel="noreferrer noopener"
										target="_blank"
									>
										<ExternalLink className="size-4 shrink-0" />
										{native[1]}
									</a>
								) : (
									<p className="text-destructive text-sm">
										The Canvas link is unavailable. Refresh the assignment and
										try again.
									</p>
								)}
							</>
						)}
					</TabsContent>
				</Tabs>
				{busy ? (
					<p
						className="flex items-center gap-2 text-muted-foreground text-sm"
						role="status"
					>
						<LoaderCircle className="size-4 animate-spin" />
						{imageUploading ? "Uploading image…" : status}
					</p>
				) : null}
				{error && !open ? (
					<p className="text-destructive text-sm" role="alert">
						{error}
					</p>
				) : null}
				{success ? (
					<p className="flex items-center gap-2 text-sm" role="status">
						<CheckCircle2 className="size-4 text-green-600" />
						Submission sent to Canvas.
					</p>
				) : null}
			</CardContent>
			<Dialog
				open={open}
				onOpenChange={(nextOpen) => {
					if (!busy) {
						if (!nextOpen && draftId) void runtime.flushTextDraft(draftId);
						setOpen(nextOpen);
					}
				}}
			>
				<DialogContent
					className="flex h-[88dvh] w-[96vw] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-5xl"
					showCloseButton={!busy}
				>
					<DialogHeader className="shrink-0 px-6 py-5 pr-16">
						<DialogTitle>{assignment.name}</DialogTitle>
						<DialogDescription>
							Text submission · Drafts save automatically to Canvas.
						</DialogDescription>
					</DialogHeader>
					<Suspense
						fallback={
							<div
								className="flex flex-1 items-center justify-center"
								role="status"
							>
								<LoaderCircle className="mr-2 size-5 animate-spin" />
								Loading editor…
							</div>
						}
					>
						<SubmissionEditor
							key={editorVersion}
							canvasBaseUrl={assignment.html_url}
							disabled={busy || !available}
							onUploadingChange={setImageUploading}
							onUploadImage={async (file) => {
								const accountId = runtime.getSnapshot().activeAccount?.id;
								const image = await runtime.uploadEditorImage(file);
								if (
									!mounted.current ||
									accountId !== runtime.getSnapshot().activeAccount?.id
								)
									throw new Error(
										"The assignment or account changed during upload.",
									);
								return image;
							}}
							onChange={(value, edited = true) => {
								setValue(value);
								if (!edited) return;
								if (draftId)
									void runtime.saveTextDraft(draftId, submissionHtml(value));
								setSuccess(false);
							}}
							value={value}
						/>
					</Suspense>
					<div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background px-6 py-4">
						<div className="min-w-0">
							{draftStatus}
							<p className="text-muted-foreground text-sm">
								{words.toLocaleString()} {words === 1 ? "word" : "words"}
							</p>
							{error ? (
								<p className="text-destructive text-sm" role="alert">
									{error}
								</p>
							) : null}
							{!available ? (
								<p className="text-destructive text-sm">
									This assignment is no longer accepting submissions.
								</p>
							) : null}
						</div>
						<div className="flex gap-2">
							<Button
								disabled={busy}
								onClick={() => {
									if (draftId) void runtime.flushTextDraft(draftId);
									setOpen(false);
								}}
								variant="outline"
							>
								Close editor
							</Button>
							<Button
								disabled={busy || !hasContent || !available}
								onClick={() =>
									void submit({
										type: "online_text_entry",
										text:
											typeof value === "string" ? value : submissionHtml(value),
									})
								}
							>
								{busy ? (
									<LoaderCircle
										className="animate-spin"
										data-icon="inline-start"
									/>
								) : (
									<Send data-icon="inline-start" />
								)}
								{imageUploading
									? "Uploading image…"
									: busy
										? "Submitting…"
										: "Submit text"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
