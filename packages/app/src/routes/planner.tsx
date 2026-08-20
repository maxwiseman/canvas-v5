import {
	useCanvasRuntime,
	useCanvasSnapshot,
	useCourses,
	usePlannerItems,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import { Badge } from "@canvas-v5/ui/components/badge";
import { Button } from "@canvas-v5/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@canvas-v5/ui/components/dialog";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@canvas-v5/ui/components/field";
import { Input } from "@canvas-v5/ui/components/input";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@canvas-v5/ui/components/item";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	CalendarDays,
	Check,
	CheckCircle2,
	ChevronRight,
	LoaderCircle,
	Plus,
	RotateCcw,
} from "lucide-react";
import { useState } from "react";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../components/page-header";
import { ResourceEmpty } from "../components/resource-empty";

export const Route = createFileRoute("/planner")({ component: PlannerRoute });

function PlannerRoute() {
	const hasConnection = useCanvasSnapshot().accounts.length > 0;
	const plannerItems = [...usePlannerItems()].sort(
		(a, b) => Date.parse(itemDate(a) ?? "") - Date.parse(itemDate(b) ?? ""),
	);
	const courses = useCourses();
	const sync = useSyncStatus().find((state) => state.scope === "planner");
	const courseNames = new Map(
		courses.map((course) => [course.id, course.name]),
	);
	const runtime = useCanvasRuntime();

	return (
		<PageWrapper className="mx-auto w-full max-w-4xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Planner</PageHeaderTitle>
					<PageHeaderSubtitle>
						Upcoming work across all your courses
					</PageHeaderSubtitle>
				</PageHeaderContent>
				<PageHeaderActions className="ml-auto">
					<PlannerNoteDialog disabled={!hasConnection} />
				</PageHeaderActions>
			</PageHeader>
			{plannerItems.length > 0 ? (
				<ItemGroup>
					{plannerItems.map((item) => {
						const href = internalPlannerHref(item);
						const submissionState =
							item.submissions === false ? undefined : item.submissions;
						return (
							<Item key={item.id} variant="outline">
								<ItemMedia variant="icon">
									{item.planner_override?.marked_complete ? (
										<CheckCircle2 />
									) : (
										<CalendarDays />
									)}
								</ItemMedia>
								<ItemContent>
									<ItemTitle>
										{href ? (
											<Link className="hover:underline" to={href as never}>
												{itemTitle(item)}
											</Link>
										) : item.html_url ? (
											<a
												className="hover:underline"
												href={item.html_url}
												rel="noreferrer noopener"
												target="_blank"
											>
												{itemTitle(item)}
											</a>
										) : (
											itemTitle(item)
										)}
									</ItemTitle>
									<ItemDescription>
										{courseNames.get(item.course_id ?? -1) ??
											item.context_name ??
											"Personal planner"}{" "}
										· {formatDate(itemDate(item))}
									</ItemDescription>
								</ItemContent>
								<ItemActions>
									{submissionState?.missing ? (
										<Badge variant="destructive">Missing</Badge>
									) : submissionState?.graded ? (
										<Badge>Graded</Badge>
									) : item.planner_override?.marked_complete ? (
										<Badge variant="secondary">Done</Badge>
									) : null}
									<Button
										aria-label={
											item.planner_override?.marked_complete
												? "Mark incomplete"
												: "Mark complete"
										}
										onClick={() =>
											void runtime.setPlannerItemComplete(
												item,
												!item.planner_override?.marked_complete,
											)
										}
										size="icon-sm"
										variant="ghost"
									>
										{item.planner_override?.marked_complete ? (
											<RotateCcw />
										) : (
											<Check />
										)}
									</Button>
									{href || item.html_url ? (
										<ChevronRight className="size-4 text-muted-foreground" />
									) : null}
								</ItemActions>
							</Item>
						);
					})}
				</ItemGroup>
			) : (
				<ResourceEmpty
					description={
						hasConnection
							? "You are caught up. Upcoming assignments, quizzes, discussions, and planner notes will appear here."
							: "Connect a Canvas account to see upcoming work and personal notes."
					}
					error={
						hasConnection && sync?.status === "error" ? sync.error : undefined
					}
					loading={sync?.status === "syncing"}
					title={hasConnection ? "Nothing coming up" : "Connect Canvas"}
				/>
			)}
		</PageWrapper>
	);
}

function PlannerNoteDialog({ disabled }: { disabled: boolean }) {
	const runtime = useCanvasRuntime();
	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [details, setDetails] = useState("");
	const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string>();
	async function submit() {
		if (!title.trim() || !date || submitting) return;
		setSubmitting(true);
		setError(undefined);
		try {
			await runtime.createPlannerNote({
				title: title.trim(),
				details: details.trim() || undefined,
				todoDate: date,
			});
			setTitle("");
			setDetails("");
			setOpen(false);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Unable to create note.",
			);
		} finally {
			setSubmitting(false);
		}
	}
	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger render={<Button disabled={disabled} size="sm" />}>
				<Plus data-icon="inline-start" />
				Add note
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add planner note</DialogTitle>
					<DialogDescription>
						Create a personal reminder in Canvas.
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="planner-note-title">Title</FieldLabel>
						<Input
							id="planner-note-title"
							onChange={(event) => setTitle(event.target.value)}
							value={title}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="planner-note-details">Details</FieldLabel>
						<Input
							id="planner-note-details"
							onChange={(event) => setDetails(event.target.value)}
							value={details}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="planner-note-date">Date</FieldLabel>
						<Input
							id="planner-note-date"
							onChange={(event) => setDate(event.target.value)}
							type="date"
							value={date}
						/>
						<FieldDescription>
							The note appears on this date in Canvas.
						</FieldDescription>
					</Field>
				</FieldGroup>
				{error ? <p className="text-destructive text-sm">{error}</p> : null}
				<DialogFooter showCloseButton>
					<Button
						disabled={!title.trim() || !date || submitting}
						onClick={() => void submit()}
					>
						{submitting ? (
							<LoaderCircle className="animate-spin" data-icon="inline-start" />
						) : (
							<Plus data-icon="inline-start" />
						)}
						Add note
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

type PlannerItem = ReturnType<typeof usePlannerItems>[number];

function itemTitle(item: PlannerItem) {
	return (
		item.plannable?.title ??
		item.plannable?.name ??
		`${item.plannable_type.replaceAll("_", " ")} ${item.plannable_id}`
	);
}

function itemDate(item: PlannerItem) {
	return (
		item.plannable_date ??
		item.plannable?.due_at ??
		item.plannable?.todo_date ??
		undefined
	);
}

function formatDate(value?: string | null) {
	if (!value) return "No date";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(date);
}

function internalPlannerHref(item: PlannerItem) {
	if (!item.course_id) return undefined;
	if (item.plannable_type.toLowerCase() === "assignment")
		return `/courses/${item.course_id}/assignments/${item.plannable_id}`;
	if (item.plannable_type.toLowerCase() === "quiz")
		return `/courses/${item.course_id}/quizzes/${item.plannable_id}`;
	return undefined;
}
