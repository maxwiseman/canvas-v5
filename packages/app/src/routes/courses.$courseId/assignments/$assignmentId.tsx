import {
	type AssignmentComment,
	type CanvasSubmissionInput,
	useAssignment,
	useCanvasRuntime,
	useCanvasSnapshot,
	useSubmission,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import { Badge } from "@canvas-v5/ui/components/badge";
import { Button } from "@canvas-v5/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@canvas-v5/ui/components/card";
import { Input } from "@canvas-v5/ui/components/input";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@canvas-v5/ui/components/tabs";
import { Textarea } from "@canvas-v5/ui/components/textarea";
import { createFileRoute } from "@tanstack/react-router";
import {
	CalendarClock,
	CheckCircle2,
	CircleAlert,
	ExternalLink,
	FileUp,
	ListChecks,
	LoaderCircle,
	RotateCw,
	Send,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CanvasHTML } from "../../../components/canvas-html";
import { CommentField } from "../../../components/comment-field";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../../../components/page-header";
import { ResourceEmpty } from "../../../components/resource-empty";

export const Route = createFileRoute(
	"/courses/$courseId/assignments/$assignmentId",
)({
	component: AssignmentRoute,
});

function AssignmentRoute() {
	const { courseId, assignmentId } = Route.useParams();
	const assignment = useAssignment(courseId, assignmentId);
	const submission = useSubmission(courseId, assignmentId);
	const runtime = useCanvasRuntime();
	const snapshot = useCanvasSnapshot();
	const sync = useSyncStatus().find((state) => state.scope === "assignments");
	const [actionError, setActionError] = useState<string>();
	const [commentError, setCommentError] = useState<string>();
	const [commentsLoading, setCommentsLoading] = useState(false);
	const [assignmentComments, setAssignmentComments] = useState<
		AssignmentComment[]
	>([]);
	const numericCourseId = Number(courseId);
	const numericAssignmentId = Number(assignmentId);
	const commentTargetKey =
		snapshot.activeAccount?.canvasBaseUrl ??
		(snapshot.canvasAuth.status === "authenticated"
			? snapshot.canvasAuth.baseUrl
			: undefined);

	useEffect(() => {
		if (
			snapshot.appAuth.status !== "authenticated" ||
			!commentTargetKey ||
			!Number.isFinite(numericCourseId) ||
			!Number.isFinite(numericAssignmentId)
		) {
			setAssignmentComments([]);
			setCommentsLoading(false);
			return;
		}

		let cancelled = false;
		setCommentsLoading(true);
		setCommentError(undefined);
		void runtime
			.listAssignmentComments(numericCourseId, numericAssignmentId)
			.then((comments) => {
				if (!cancelled) setAssignmentComments(comments);
			})
			.catch((error) => {
				if (!cancelled) {
					setCommentError(
						error instanceof Error ? error.message : "Unable to load comments.",
					);
				}
			})
			.finally(() => {
				if (!cancelled) setCommentsLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [
		commentTargetKey,
		numericAssignmentId,
		numericCourseId,
		runtime,
		snapshot.appAuth.status,
	]);

	if (!assignment) {
		return (
			<PageWrapper>
				<ResourceEmpty
					description="This assignment is unavailable."
					error={sync?.status === "error" ? sync.error : undefined}
					loading={sync?.status === "syncing"}
					title="Assignment not found"
				/>
			</PageWrapper>
		);
	}

	const availableTypes = (assignment.submission_types ?? []).filter(
		(type): type is CanvasSubmissionInput["type"] =>
			type === "online_text_entry" || type === "online_url",
	);
	const requiresCanvas = (assignment.submission_types ?? []).some(
		(type) =>
			!availableTypes.includes(type as CanvasSubmissionInput["type"]) &&
			type !== "none" &&
			type !== "on_paper",
	);
	const canSubmit =
		assignment.can_submit !== false && !assignment.locked_for_user;

	return (
		<PageWrapper className="mx-auto w-full max-w-6xl">
			<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
				<div className="min-w-0">
					<PageHeader>
						<PageHeaderContent>
							<div className="mb-2 flex flex-wrap items-center gap-2">
								<SubmissionStatus submission={submission} />
							</div>
							<PageHeaderTitle>{assignment.name}</PageHeaderTitle>
							<PageHeaderSubtitle>
								{formatDueDate(assignment.due_at)}
							</PageHeaderSubtitle>
						</PageHeaderContent>
					</PageHeader>

					{assignment.locked_for_user ? (
						<ResourceEmpty
							description={
								assignment.lock_explanation ??
								"This assignment is currently locked."
							}
							title="Assignment locked"
						/>
					) : (
						<CanvasHTML>{assignment.description ?? undefined}</CanvasHTML>
					)}

					{submission?.submission_comments?.length ? (
						<div className="mt-8 flex flex-col gap-3">
							<h2 className="font-medium text-sm">
								Canvas submission comments
							</h2>
							{submission.submission_comments.map((comment) => (
								<Card key={comment.id} size="sm">
									<CardHeader>
										<CardTitle>
											{comment.author_name ?? "Canvas user"}
										</CardTitle>
										<CardDescription>
											{formatDateTime(comment.created_at)}
										</CardDescription>
									</CardHeader>
									<CardContent className="whitespace-pre-wrap">
										{comment.comment}
									</CardContent>
								</Card>
							))}
						</div>
					) : null}

					<div className="mt-8 flex flex-col gap-3">
						<h2 className="font-medium text-sm">Comments</h2>
						{assignmentComments.map((comment) => (
							<Card key={comment.id} size="sm">
								<CardHeader>
									<CardTitle>You</CardTitle>
									<CardDescription>
										{formatDateTime(comment.createdAt)}
									</CardDescription>
								</CardHeader>
								<CardContent className="whitespace-pre-wrap">
									{comment.content}
								</CardContent>
							</Card>
						))}
						<CommentField
							disabled={
								commentsLoading ||
								snapshot.appAuth.status !== "authenticated" ||
								!commentTargetKey
							}
							onSubmit={async (content) => {
								setCommentError(undefined);
								try {
									const saved = await runtime.createAssignmentComment(
										numericCourseId,
										numericAssignmentId,
										content,
									);
									setAssignmentComments((comments) => [...comments, saved]);
								} catch (error) {
									setCommentError(
										error instanceof Error
											? error.message
											: "Unable to save comment.",
									);
									throw error;
								}
							}}
						/>
						{commentError ? (
							<p className="text-destructive text-sm">{commentError}</p>
						) : null}
					</div>
					{actionError ? (
						<p className="mt-2 text-destructive text-sm">{actionError}</p>
					) : null}
				</div>

				<div className="flex flex-col gap-4">
					<Card size="sm">
						<CardHeader className="gap-0">
							<CardTitle>Assignment details</CardTitle>
							{/*<CardDescription>Requirements and availability</CardDescription>*/}
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<Detail
								icon={<CalendarClock />}
								label={formatDueDate(assignment.due_at)}
							/>
							<Detail
								icon={<ListChecks />}
								label={`${formatNumber(assignment.points_possible ?? 0)} points`}
							/>
							<Detail
								icon={<RotateCw />}
								label={formatAttempts(assignment.allowed_attempts)}
							/>
							<Detail
								icon={<FileUp />}
								label={formatSubmissionTypes(assignment.submission_types)}
							/>
						</CardContent>
					</Card>

					{canSubmit && (availableTypes.length > 0 || requiresCanvas) ? (
						<SubmissionCard
							assignmentId={Number(assignmentId)}
							availableTypes={availableTypes}
							canvasUrl={assignment.html_url}
							courseId={Number(courseId)}
							onError={setActionError}
							requiresCanvas={requiresCanvas}
						/>
					) : null}
				</div>
			</div>
		</PageWrapper>
	);
}

function SubmissionCard({
	courseId,
	assignmentId,
	availableTypes,
	requiresCanvas,
	canvasUrl,
	onError,
}: {
	courseId: number;
	assignmentId: number;
	availableTypes: CanvasSubmissionInput["type"][];
	requiresCanvas: boolean;
	canvasUrl?: string;
	onError: (error?: string) => void;
}) {
	const runtime = useCanvasRuntime();
	const [text, setText] = useState("");
	const [url, setUrl] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const defaultType = availableTypes[0];

	async function submit(input: CanvasSubmissionInput) {
		setSubmitting(true);
		onError(undefined);
		try {
			await runtime.submitAssignment(courseId, assignmentId, input);
		} catch (error) {
			onError(
				error instanceof Error ? error.message : "Unable to submit assignment.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Submit assignment</CardTitle>
				<CardDescription>
					Your submission is sent directly to Canvas.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{defaultType ? (
					<Tabs defaultValue={defaultType}>
						<TabsList>
							{availableTypes.includes("online_text_entry") ? (
								<TabsTrigger value="online_text_entry">Text</TabsTrigger>
							) : null}
							{availableTypes.includes("online_url") ? (
								<TabsTrigger value="online_url">Website</TabsTrigger>
							) : null}
						</TabsList>
						<TabsContent
							className="flex flex-col gap-3 pt-3"
							value="online_text_entry"
						>
							<Textarea
								aria-label="Submission text"
								onChange={(event) => setText(event.target.value)}
								placeholder="Write your submission…"
								rows={8}
								value={text}
							/>
							<Button
								disabled={!text.trim() || submitting}
								onClick={() =>
									void submit({ type: "online_text_entry", text: text.trim() })
								}
							>
								{submitting ? (
									<LoaderCircle
										className="animate-spin"
										data-icon="inline-start"
									/>
								) : (
									<Send data-icon="inline-start" />
								)}
								Submit text
							</Button>
						</TabsContent>
						<TabsContent
							className="flex flex-col gap-3 pt-3"
							value="online_url"
						>
							<Input
								aria-label="Website URL"
								onChange={(event) => setUrl(event.target.value)}
								placeholder="https://…"
								type="url"
								value={url}
							/>
							<Button
								disabled={!isValidHttpUrl(url) || submitting}
								onClick={() => void submit({ type: "online_url", url })}
							>
								{submitting ? (
									<LoaderCircle
										className="animate-spin"
										data-icon="inline-start"
									/>
								) : (
									<Send data-icon="inline-start" />
								)}
								Submit website
							</Button>
						</TabsContent>
					</Tabs>
				) : null}
				{requiresCanvas && canvasUrl ? (
					<Button
						render={
							<a
								aria-label="Submit files or media in Canvas"
								href={withNativeFallback(canvasUrl)}
								rel="noreferrer noopener"
								target="_blank"
							>
								<span className="sr-only">Submit files or media in Canvas</span>
							</a>
						}
						variant={defaultType ? "outline" : "default"}
					>
						<ExternalLink data-icon="inline-start" />
						Submit files or media in Canvas
					</Button>
				) : null}
			</CardContent>
		</Card>
	);
}

function SubmissionStatus({
	submission,
}: {
	submission?: {
		workflow_state?: string;
		missing?: boolean;
		late?: boolean;
		excused?: boolean;
	};
}) {
	if (submission?.excused)
		return (
			<Badge variant="outline">
				<CheckCircle2 data-icon="inline-start" />
				Excused
			</Badge>
		);
	if (submission?.missing)
		return (
			<Badge variant="destructive">
				<CircleAlert data-icon="inline-start" />
				Missing
			</Badge>
		);
	if (submission?.late)
		return (
			<Badge variant="secondary">
				<CircleAlert data-icon="inline-start" />
				Late
			</Badge>
		);
	if (submission?.workflow_state === "graded")
		return (
			<Badge>
				<CheckCircle2 data-icon="inline-start" />
				Graded
			</Badge>
		);
	if (submission?.workflow_state === "submitted")
		return (
			<Badge variant="secondary">
				<CheckCircle2 data-icon="inline-start" />
				Submitted
			</Badge>
		);
	return <Badge variant="outline">Not submitted</Badge>;
}

function Detail({ icon, label }: { icon: React.ReactNode; label: string }) {
	return (
		<div className="flex items-center gap-2 text-muted-foreground text-sm [&>svg]:size-4">
			{icon}
			<span>{label}</span>
		</div>
	);
}

function formatDueDate(value?: string | null) {
	if (!value) return "No due date";
	return `Due ${formatDateTime(value)}`;
}

function formatDateTime(value?: string) {
	if (!value) return "Date unavailable";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(date);
}

function formatAttempts(value?: number) {
	if (value === -1) return "Unlimited attempts";
	if (!value || value === 1) return "One attempt";
	return `${value} attempts`;
}

function formatSubmissionTypes(types?: string[]) {
	if (!types?.length || types.includes("none")) return "No online submission";
	return types
		.map((type) => type.replace("online_", "").replaceAll("_", " "))
		.join(", ");
}

function formatNumber(value: number) {
	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
		value,
	);
}

function isValidHttpUrl(value: string) {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

function withNativeFallback(value: string) {
	try {
		const url = new URL(value);
		url.searchParams.set("canvas_v5_native", "1");
		return url.toString();
	} catch {
		return value;
	}
}
