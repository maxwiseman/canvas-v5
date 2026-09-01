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
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@canvas-v5/ui/components/collapsible";
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
	ChevronDown,
	ChevronRight,
	CircleHelp,
	ClipboardList,
	FileText,
	ListChecks,
	LoaderCircle,
	Megaphone,
	MessageSquareText,
	Plus,
	RotateCcw,
	StickyNote,
	UsersRound,
} from "lucide-react";
import { type ComponentType, useState } from "react";
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
	const [pastOpen, setPastOpen] = useState(false);
	const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [completionError, setCompletionError] = useState<string>();
	const startOfToday = localDayStart(new Date()).getTime();
	const currentItems = plannerItems.filter((item) => {
		const date = parseItemDate(item);
		return !date || date.getTime() >= startOfToday;
	});
	const pastItems = plannerItems.filter((item) => {
		const date = parseItemDate(item);
		return date && date.getTime() < startOfToday;
	});
	const currentGroups = groupPlannerItemsByDay(currentItems);
	const pastGroups = groupPlannerItemsByDay(pastItems).reverse();

	async function toggleComplete(item: PlannerItem) {
		if (pendingItemIds.has(item.id)) return;
		setCompletionError(undefined);
		setPendingItemIds((current) => new Set(current).add(item.id));
		try {
			await runtime.setPlannerItemComplete(
				item,
				!item.planner_override?.marked_complete,
			);
		} catch (cause) {
			setCompletionError(
				cause instanceof Error
					? cause.message
					: "Unable to update this planner item.",
			);
		} finally {
			setPendingItemIds((current) => {
				const next = new Set(current);
				next.delete(item.id);
				return next;
			});
		}
	}

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
			{completionError ? (
				<p className="mb-4 text-destructive text-sm" role="alert">
					{completionError}
				</p>
			) : null}
			{plannerItems.length > 0 ? (
				<div className="flex flex-col gap-5">
					{currentGroups.length > 0 ? (
						<div className="flex flex-col gap-4">
							{currentGroups.map((group) => (
								<PlannerDayGroup
									courseNames={courseNames}
									group={group}
									key={group.key}
									onToggleComplete={toggleComplete}
									pendingItemIds={pendingItemIds}
								/>
							))}
						</div>
					) : (
						<p className="rounded-2xl border border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
							Nothing scheduled for today or later.
						</p>
					)}
					{pastItems.length > 0 ? (
						<Collapsible onOpenChange={setPastOpen} open={pastOpen}>
							<CollapsibleTrigger
								render={
									<Button className="w-full justify-between" variant="ghost" />
								}
							>
								<span>Earlier · {pastItems.length}</span>
								<ChevronDown
									className={
										pastOpen
											? "rotate-180 transition-transform"
											: "transition-transform"
									}
								/>
							</CollapsibleTrigger>
							<CollapsibleContent className="mt-4 flex flex-col gap-4">
								{pastGroups.map((group) => (
									<PlannerDayGroup
										courseNames={courseNames}
										group={group}
										key={group.key}
										onToggleComplete={toggleComplete}
										pendingItemIds={pendingItemIds}
									/>
								))}
							</CollapsibleContent>
						</Collapsible>
					) : null}
				</div>
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
type PlannerDayGroup = {
	key: string;
	date?: Date;
	items: PlannerItem[];
};

function PlannerDayGroup({
	group,
	courseNames,
	pendingItemIds,
	onToggleComplete,
}: {
	group: PlannerDayGroup;
	courseNames: Map<number, string>;
	pendingItemIds: Set<string>;
	onToggleComplete: (item: PlannerItem) => Promise<void>;
}) {
	return (
		<section>
			<div className="sticky -top-1 z-10 -mx-1 mb-2 bg-background/95 px-1 py-2 backdrop-blur">
				<h2 className="font-medium text-muted-foreground text-sm">
					{formatDayHeader(group.date)}
				</h2>
			</div>
			<ItemGroup>
				{group.items.map((item) => (
					<PlannerItemRow
						courseName={
							courseNames.get(item.course_id ?? -1) ??
							item.context_name ??
							"Personal planner"
						}
						item={item}
						key={item.id}
						onToggleComplete={onToggleComplete}
						pending={pendingItemIds.has(item.id)}
					/>
				))}
			</ItemGroup>
		</section>
	);
}

function PlannerItemRow({
	item,
	courseName,
	pending,
	onToggleComplete,
}: {
	item: PlannerItem;
	courseName: string;
	pending: boolean;
	onToggleComplete: (item: PlannerItem) => Promise<void>;
}) {
	const href = internalPlannerHref(item);
	const submissionState =
		item.submissions === false ? undefined : item.submissions;
	const Icon = plannerItemIcon(item.plannable_type);
	return (
		<Item variant="outline">
			<ItemMedia variant="icon">
				<Icon aria-label={plannerTypeLabel(item.plannable_type)} />
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
					{courseName} · {formatItemTime(itemDate(item))}
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
					disabled={pending}
					onClick={() => void onToggleComplete(item)}
					size="icon-sm"
					variant="ghost"
				>
					{pending ? (
						<LoaderCircle className="animate-spin" />
					) : item.planner_override?.marked_complete ? (
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
}

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

function parseItemDate(item: PlannerItem) {
	const value = itemDate(item);
	if (!value) return undefined;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function localDayStart(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function groupPlannerItemsByDay(items: PlannerItem[]) {
	const groups = new Map<string, PlannerDayGroup>();
	for (const item of items) {
		const date = parseItemDate(item);
		const key = date
			? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
			: "undated";
		const group = groups.get(key) ?? { key, date, items: [] };
		group.items.push(item);
		groups.set(key, group);
	}
	return [...groups.values()];
}

function formatDayHeader(date?: Date) {
	if (!date) return "No date";
	const today = localDayStart(new Date());
	const day = localDayStart(date);
	const difference = Math.round(
		(day.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
	);
	const label =
		difference === 0 ? "Today" : difference === 1 ? "Tomorrow" : undefined;
	const formatted = new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
	}).format(date);
	return label ? `${label} · ${formatted}` : formatted;
}

function formatItemTime(value?: string | null) {
	if (!value) return "No time";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, {
				hour: "numeric",
				minute: "2-digit",
			}).format(date);
}

function plannerTypeLabel(type: string) {
	return type.replaceAll("_", " ");
}

function plannerItemIcon(
	type: string,
): ComponentType<{ "aria-label"?: string }> {
	switch (type.toLowerCase()) {
		case "assignment":
		case "sub_assignment":
			return ClipboardList;
		case "quiz":
		case "assessment_request":
			return CircleHelp;
		case "discussion_topic":
			return MessageSquareText;
		case "announcement":
			return Megaphone;
		case "planner_note":
			return StickyNote;
		case "wiki_page":
			return FileText;
		case "calendar_event":
			return CalendarDays;
		case "peer_review_sub_assignment":
			return UsersRound;
		default:
			return ListChecks;
	}
}

function internalPlannerHref(item: PlannerItem) {
	if (!item.course_id) return undefined;
	if (item.plannable_type.toLowerCase() === "assignment")
		return `/courses/${item.course_id}/assignments/${item.plannable_id}`;
	if (item.plannable_type.toLowerCase() === "quiz")
		return `/courses/${item.course_id}/quizzes/${item.plannable_id}`;
	return undefined;
}
