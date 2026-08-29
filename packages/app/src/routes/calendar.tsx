import {
	useCalendarItems,
	useCanvasSnapshot,
	useCourses,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import { EventCalendar } from "@canvas-v5/ui/components/reui/event-calendar/event-calendar";
import { EventCalendarContent } from "@canvas-v5/ui/components/reui/event-calendar/event-calendar-content";
import { EventCalendarNav } from "@canvas-v5/ui/components/reui/event-calendar/event-calendar-nav";
import type { CalendarEvent } from "@canvas-v5/ui/components/reui/event-calendar/event-calendar-types";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../components/page-header";
import { ResourceEmpty } from "../components/resource-empty";

export const Route = createFileRoute("/calendar")({ component: CalendarRoute });

const calendarViews = ["month", "week", "day", "agenda"] as const;
const readOnlyInteractions = {
	drag: false,
	resize: false,
	selectSlot: false,
} as const;

function CalendarRoute() {
	const hasConnection = useCanvasSnapshot().accounts.length > 0;
	const items = useCalendarItems();
	const courses = useCourses();
	const sync = useSyncStatus().find((state) => state.scope === "calendar");
	const courseNames = useMemo(
		() =>
			new Map(courses.map((course) => [`course_${course.id}`, course.name])),
		[courses],
	);
	const events = useMemo(
		() =>
			items.flatMap((item) => {
				const event = toCalendarEvent(
					item,
					courseNames.get(item.context_code ?? "") ??
						item.context_name ??
						"Canvas",
				);
				return event ? [event] : [];
			}),
		[courseNames, items],
	);

	return (
		<PageWrapper className="mx-auto w-full max-w-7xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Calendar</PageHeaderTitle>
					<PageHeaderSubtitle>
						Events and due dates across Canvas
					</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>
			{events.length > 0 ? (
				<EventCalendar<CalendarEventData>
					className="h-[calc(100svh-10rem)] min-h-[34rem] overflow-hidden rounded-2xl border bg-card"
					defaultView="month"
					eventTooltip
					events={events}
					interactions={readOnlyInteractions}
					loading={sync?.status === "syncing"}
					onEventClick={(occurrence) => {
						const url = occurrence.event.data?.htmlUrl;
						if (url) globalThis.open(url, "_blank", "noopener,noreferrer");
					}}
					offDays
					scrollMode="contained"
					views={[...calendarViews]}
				>
					<EventCalendarNav />
					<EventCalendarContent />
				</EventCalendar>
			) : (
				<ResourceEmpty
					description={
						hasConnection
							? "Canvas events and assignment due dates will appear here."
							: "Connect a Canvas account to see events and assignment due dates."
					}
					error={
						hasConnection && sync?.status === "error" ? sync.error : undefined
					}
					loading={sync?.status === "syncing"}
					title={hasConnection ? "Calendar empty" : "Connect Canvas"}
				/>
			)}
		</PageWrapper>
	);
}

type CanvasCalendarItem = ReturnType<typeof useCalendarItems>[number];
type CalendarEventData = {
	htmlUrl?: string;
	contextName: string;
	kind: "assignment" | "event";
};

function toCalendarEvent(
	item: CanvasCalendarItem,
	contextName: string,
): CalendarEvent<CalendarEventData> | undefined {
	const allDay = Boolean(item.all_day || item.all_day_date);
	const start = allDay
		? (parseLocalDate(item.all_day_date) ?? parseDate(item.start_at))
		: parseDate(item.start_at);
	if (!start) return undefined;

	const parsedEnd = parseDate(item.end_at);
	const end = allDay
		? allDayEnd(start, parsedEnd)
		: parsedEnd && parsedEnd > start
			? parsedEnd
			: new Date(start.getTime() + 30 * 60 * 1000);
	const kind =
		item.assignment || String(item.id).startsWith("assignment_")
			? "assignment"
			: "event";

	return {
		id: String(item.id),
		title: item.title,
		start,
		end,
		allDay,
		color: calendarColor(item.context_code),
		readOnly: true,
		data: {
			htmlUrl: item.html_url,
			contextName,
			kind,
		},
	};
}

function parseDate(value?: string | null) {
	if (!value) return undefined;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseLocalDate(value?: string | null) {
	if (!value) return undefined;
	const [year, month, day] = value.split("-").map(Number);
	if (!year || !month || !day) return undefined;
	return new Date(year, month - 1, day);
}

function allDayEnd(start: Date, candidate?: Date) {
	const duration = candidate
		? Math.ceil((candidate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
		: 1;
	return new Date(
		start.getFullYear(),
		start.getMonth(),
		start.getDate() + Math.max(1, duration),
	);
}

function calendarColor(contextCode?: string) {
	let hash = 0;
	for (const character of contextCode ?? "canvas") {
		hash = (hash * 31 + character.charCodeAt(0)) | 0;
	}
	return `var(--chart-${(Math.abs(hash) % 5) + 1})`;
}
