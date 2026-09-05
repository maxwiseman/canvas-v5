import {
	type AssignmentComment,
	useAssignment,
	useCanvasRuntime,
	useCanvasSnapshot,
	useSubmission,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@canvas-v5/ui/components/avatar";
import { Badge } from "@canvas-v5/ui/components/badge";
import { Button } from "@canvas-v5/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@canvas-v5/ui/components/card";
import { Progress } from "@canvas-v5/ui/components/progress";
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
} from "lucide-react";
import { useEffect, useState } from "react";
import { AssignmentSubmission } from "../../../components/assignment-submission";
import { CanvasHTML } from "../../../components/canvas-html";
import { CommentField } from "../../../components/comment-field";
import { CourseSequenceNavigation } from "../../../components/course-sequence-navigation";
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
	const detailedSubmission = useSubmission(courseId, assignmentId);
	const submission =
		detailedSubmission ??
		(assignment?.submission
			? {
					...assignment.submission,
					id: `${courseId}:${assignmentId}:self`,
					course_id: Number(courseId),
					assignment_id: Number(assignmentId),
				}
			: undefined);
	const runtime = useCanvasRuntime();
	const snapshot = useCanvasSnapshot();
	const sync = useSyncStatus().find((state) => state.scope === "assignments");
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

	const externalToolOnly =
		assignment.submission_types?.length === 1 &&
		assignment.submission_types[0] === "external_tool";

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

					{externalToolOnly && !assignment.locked_for_user ? (
						<ExternalToolFrame
							assignmentId={numericAssignmentId}
							canvasUrl={assignment.html_url}
							courseId={numericCourseId}
							name={assignment.name}
						/>
					) : null}

					{submission?.submission_comments?.length ? (
						<div className="mt-8 flex flex-col gap-3">
							<h2 className="font-medium text-sm">Feedback</h2>
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
									<CardContent className="flex flex-col gap-2 whitespace-pre-wrap">
										{comment.comment ? <p>{comment.comment}</p> : null}
										{comment.attachments?.length ? (
											<div className="flex flex-col gap-1">
												{comment.attachments.map((attachment) => {
													const href = attachment.url ?? attachment.public_url;
													const label =
														attachment.display_name ??
														attachment.filename ??
														`Attachment ${attachment.id}`;
													return href ? (
														<a
															className="text-primary text-sm hover:underline"
															href={String(href)}
															key={attachment.id}
															rel="noreferrer noopener"
															target="_blank"
														>
															{String(label)}
														</a>
													) : (
														<span className="text-sm" key={attachment.id}>
															{String(label)}
														</span>
													);
												})}
											</div>
										) : null}
									</CardContent>
								</Card>
							))}
						</div>
					) : null}

					<div className="mt-8 flex flex-col gap-3">
						<h2 className="font-medium text-sm">Comments</h2>
						{assignmentComments.map((comment) => (
							<div className="flex flex-col gap-2" key={comment.id}>
								<div className="flex flex-row items-center gap-2">
									<Avatar className="size-5">
										{comment.author.avatarUrl ? (
											<AvatarImage alt="" src={comment.author.avatarUrl} />
										) : null}
										<AvatarFallback>
											{initials(comment.author.displayName)}
										</AvatarFallback>
									</Avatar>
									<div className="min-w-0">
										<div className="flex items-baseline gap-1 text-sm">
											{comment.author.displayName}
											<span className="text-muted-foreground">
												{formatDateTime(comment.createdAt, "short")}
											</span>
										</div>
									</div>
								</div>
								<div className="prose dark:prose-invert whitespace-pre-wrap">
									{comment.content}
								</div>
							</div>
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
				</div>

				<div className="flex flex-col gap-4">
					<GradeCard
						pointsPossible={assignment.points_possible}
						submission={submission}
					/>
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

					{!externalToolOnly ? (
						<AssignmentSubmission
							key={`${snapshot.activeAccount?.id ?? commentTargetKey}:${courseId}:${assignmentId}`}
							assignment={{ ...assignment, submission }}
						/>
					) : null}
				</div>
			</div>
			<CourseSequenceNavigation
				assetId={assignmentId}
				assetType="Assignment"
				courseId={courseId}
			/>
		</PageWrapper>
	);
}

function ExternalToolFrame({
	courseId,
	assignmentId,
	name,
	canvasUrl,
}: {
	courseId: number;
	assignmentId: number;
	name: string;
	canvasUrl?: string;
}) {
	const runtime = useCanvasRuntime();
	const [launchUrl, setLaunchUrl] = useState<string>();
	const [error, setError] = useState<string>();

	useEffect(() => {
		let cancelled = false;
		setLaunchUrl(undefined);
		setError(undefined);

		void runtime
			.getExternalToolLaunch(courseId, assignmentId)
			.then((launch) => {
				if (!cancelled) setLaunchUrl(launch.url);
			})
			.catch((launchError) => {
				if (!cancelled) {
					setError(
						launchError instanceof Error
							? launchError.message
							: "Unable to open this external tool.",
					);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [assignmentId, courseId, runtime]);

	if (error) {
		return (
			<div className="mt-8 flex flex-col items-start gap-3 rounded-lg border p-4">
				<p className="text-destructive text-sm">{error}</p>
				{canvasUrl ? (
					<Button
						render={
							// biome-ignore lint/a11y/useAnchorContent: Button supplies the visible link content through render composition.
							<a
								aria-label="Open this submission tool in Canvas"
								href={withNativeFallback(canvasUrl)}
								rel="noreferrer noopener"
								target="_blank"
							/>
						}
						variant="outline"
					>
						<ExternalLink data-icon="inline-start" />
						Open in Canvas
					</Button>
				) : null}
			</div>
		);
	}

	if (!launchUrl) {
		return (
			<div className="mt-8 flex min-h-48 items-center justify-center rounded-lg border">
				<LoaderCircle className="size-5 animate-spin text-muted-foreground" />
				<span className="sr-only">Loading external submission tool</span>
			</div>
		);
	}

	return (
		<iframe
			allow="camera; microphone; display-capture; clipboard-read; clipboard-write"
			allowFullScreen
			className="mt-8 min-h-176 w-full rounded-lg border bg-background"
			src={launchUrl}
			title={`${name} submission tool`}
		/>
	);
}

function GradeCard({
	submission,
	pointsPossible,
}: {
	submission?: {
		score?: number | null;
		grade?: string | null;
		workflow_state?: string;
		missing?: boolean;
		late?: boolean;
		excused?: boolean;
	};
	pointsPossible?: number | null;
}) {
	const hasScore =
		submission?.score !== undefined && submission?.score !== null;
	const hasGrade =
		submission?.grade !== undefined &&
		submission?.grade !== null &&
		submission.grade !== "";
	const possible = pointsPossible ?? 0;
	const percentage =
		hasScore && possible > 0
			? ((submission?.score ?? 0) / possible) * 100
			: undefined;

	let description: string;
	if (submission?.excused) {
		description = "You are excused from this assignment.";
	} else if (hasScore || hasGrade) {
		description =
			percentage !== undefined
				? `${percentage.toFixed(1)}% of ${formatNumber(possible)} points`
				: "Graded";
	} else if (submission?.missing) {
		description = "Marked missing. No grade yet.";
	} else if (submission?.workflow_state === "submitted") {
		description = "Submitted and awaiting a grade.";
	} else {
		description = "No grade yet.";
	}

	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Grade</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{submission?.excused ? (
					<Badge variant="outline">
						<CheckCircle2 data-icon="inline-start" />
						Excused
					</Badge>
				) : hasScore || hasGrade ? (
					<>
						<div className="flex items-baseline gap-1 tabular-nums">
							<span className="font-semibold text-2xl">
								{hasScore
									? formatNumber(submission?.score ?? 0)
									: (submission?.grade ?? "—")}
							</span>
							<span className="text-muted-foreground text-sm">
								/ {formatNumber(possible)} points
							</span>
							{hasGrade &&
							hasScore &&
							submission?.grade !== String(submission?.score) ? (
								<Badge className="ml-2" variant="secondary">
									{submission?.grade}
								</Badge>
							) : null}
							{!hasScore && hasGrade ? (
								<Badge className="ml-2" variant="secondary">
									{submission?.grade}
								</Badge>
							) : null}
						</div>
						{percentage !== undefined ? <Progress value={percentage} /> : null}
						{submission?.late ? (
							<p className="text-muted-foreground text-sm">Submitted late.</p>
						) : null}
					</>
				) : (
					<SubmissionStatus submission={submission} />
				)}
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

function initials(name: string) {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

function formatDueDate(value?: string | null) {
	if (!value) return "No due date";
	return `Due ${formatDateTime(value)}`;
}

function formatDateTime(value?: string, type?: "short") {
	if (!value) return "Date unavailable";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, {
				dateStyle: type === "short" ? "short" : "medium",
				timeStyle: type === "short" ? undefined : "short",
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

function withNativeFallback(value: string) {
	try {
		const url = new URL(value);
		url.searchParams.set("canvas_v5_native", "1");
		return url.toString();
	} catch {
		return value;
	}
}
