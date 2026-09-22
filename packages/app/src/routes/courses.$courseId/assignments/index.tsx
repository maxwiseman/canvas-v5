import {
	type CanvasAssignment,
	useAssignments,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import { Input } from "@canvas-v5/ui/components/input";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ChevronRight,
	ClipboardList,
	FileText,
	MessageSquare,
	Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderTitle,
	PageWrapper,
} from "../../../components/page-header";

export const Route = createFileRoute("/courses/$courseId/assignments/")({
	component: AssignmentsRoute,
});

function AssignmentsRoute() {
	const { courseId } = Route.useParams();
	return <AssignmentsView key={courseId} courseId={courseId} />;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
	hour: "numeric",
	minute: "2-digit",
});

function timestamp(value?: string | null) {
	return value ? Date.parse(value) : Number.NaN;
}

function AssignmentRow({
	assignment,
	courseId,
}: {
	assignment: CanvasAssignment;
	courseId: string;
}) {
	const Icon =
		assignment.quiz_id || assignment.submission_types?.includes("online_quiz")
			? ClipboardList
			: assignment.submission_types?.includes("discussion_topic")
				? MessageSquare
				: FileText;
	const submission = assignment.submission;
	const status = submission?.excused
		? "Excused"
		: submission?.missing
			? "Missing"
			: submission?.workflow_state === "graded"
				? "Graded"
				: submission?.submitted_at ||
						submission?.workflow_state === "submitted" ||
						submission?.workflow_state === "pending_review"
					? "Submitted"
					: assignment.locked_for_user
						? "Locked"
						: null;
	const due = timestamp(assignment.due_at);
	const availableUntil = timestamp(assignment.lock_at);

	return (
		<li>
			<Link
				className="group/row flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px] sm:gap-4 sm:px-5"
				params={{ courseId, assignmentId: String(assignment.id) } as never}
				to={"/courses/$courseId/assignments/$assignmentId" as never}
			>
				<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
					<Icon aria-hidden="true" className="size-4" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
						<span className="break-words font-medium text-sm underline-offset-4 group-hover/row:underline">
							{assignment.name}
						</span>
						{status && (
							<span
								className={`rounded-md px-2 py-0.5 text-xs ${status === "Missing" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}
							>
								{status}
							</span>
						)}
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs leading-relaxed">
						<span>
							{Number.isFinite(due) ? (
								<>
									Due{" "}
									<time dateTime={assignment.due_at ?? undefined}>
										{dateFormatter.format(due)}
									</time>
								</>
							) : (
								"No due date"
							)}
						</span>
						{assignment.points_possible != null && (
							<span>
								{submission?.score != null && !submission.excused
									? `${submission.score} / `
									: ""}
								{assignment.points_possible} pts
							</span>
						)}
						{Number.isFinite(availableUntil) && (
							<span>
								Available until{" "}
								<time dateTime={assignment.lock_at ?? undefined}>
									{dateFormatter.format(availableUntil)}
								</time>
							</span>
						)}
						{submission?.late && <span>Late submission</span>}
					</div>
				</div>
				<ChevronRight
					aria-hidden="true"
					className="size-4 shrink-0 text-muted-foreground"
				/>
			</Link>
		</li>
	);
}

export function AssignmentsView({ courseId }: { courseId: string }) {
	const assignments = useAssignments(courseId);
	const syncState = useSyncStatus().find(
		(scope) => scope.scope === "assignments",
	);
	const [query, setQuery] = useState("");
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, []);
	const search = query.trim().toLocaleLowerCase();
	const visible = assignments.filter((assignment) =>
		assignment.name.toLocaleLowerCase().includes(search),
	);
	const groups = [
		{
			id: "upcoming",
			label: "Upcoming assignments",
			empty: "You're all caught up. No upcoming assignments.",
			items: visible.filter((a) => timestamp(a.due_at) >= now),
		},
		{
			id: "undated",
			label: "Undated assignments",
			empty: "No assignments without a due date.",
			items: visible.filter((a) => !Number.isFinite(timestamp(a.due_at))),
		},
		{
			id: "past",
			label: "Past assignments",
			empty: "No past assignments.",
			items: visible
				.filter((a) => timestamp(a.due_at) < now)
				.sort(
					(a, b) =>
						timestamp(b.due_at) - timestamp(a.due_at) ||
						a.name.localeCompare(b.name),
				),
		},
	];

	return (
		<PageWrapper className="px-4 sm:px-8">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Assignments</PageHeaderTitle>
					<p className="mt-2 text-muted-foreground text-sm">
						Due dates, details, and submissions in one place.
					</p>
				</PageHeaderContent>
			</PageHeader>
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<div className="relative w-full sm:max-w-xs">
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						aria-label="Search assignments"
						className="pl-9"
						type="search"
						placeholder="Search assignments…"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				<p aria-live="polite" className="text-muted-foreground text-xs">
					{search
						? `${visible.length} of ${assignments.length}`
						: assignments.length}{" "}
					{assignments.length === 1 ? "assignment" : "assignments"}
				</p>
			</div>
			{syncState?.status === "error" && (
				<p
					role="alert"
					className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm"
				>
					Assignments couldn't refresh.{" "}
					{assignments.length > 0 ? "Showing saved assignments. " : ""}
					{syncState.error}
				</p>
			)}
			{assignments.length === 0 || visible.length === 0 ? (
				<div
					role="status"
					className="rounded-xl border bg-card px-4 py-14 text-center"
				>
					<ClipboardList
						aria-hidden="true"
						className="mx-auto mb-3 size-7 text-muted-foreground"
					/>
					<p className="font-medium text-sm">
						{assignments.length === 0 && syncState?.status === "syncing"
							? "Loading assignments…"
							: search
								? "No matching assignments"
								: syncState?.status === "error"
									? "Assignments unavailable"
									: "No assignments yet"}
					</p>
					{search && (
						<p className="mt-1 text-muted-foreground text-sm">
							Try a different assignment name.
						</p>
					)}
				</div>
			) : (
				<div className="space-y-4">
					{groups.map((group) => (
						<details
							key={group.id}
							open
							className="group/section overflow-hidden rounded-xl border bg-card"
						>
							<summary className="flex cursor-pointer list-none items-center gap-3 bg-muted/40 px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px] sm:px-5 [&::-webkit-details-marker]:hidden">
								<ChevronRight
									aria-hidden="true"
									className="size-4 shrink-0 text-muted-foreground transition-transform group-open/section:rotate-90 motion-reduce:transition-none"
								/>
								<h2 className="flex-1 font-medium text-sm">{group.label}</h2>
								<span className="rounded-md border bg-background px-2 py-0.5 text-muted-foreground text-xs tabular-nums">
									{group.items.length}
								</span>
							</summary>
							{group.items.length ? (
								<ul className="divide-y border-t">
									{group.items.map((assignment) => (
										<AssignmentRow
											key={assignment.id}
											assignment={assignment}
											courseId={courseId}
										/>
									))}
								</ul>
							) : (
								<p className="border-t px-5 py-6 text-muted-foreground text-sm">
									{search ? "No matches in this section." : group.empty}
								</p>
							)}
						</details>
					))}
				</div>
			)}
		</PageWrapper>
	);
}
