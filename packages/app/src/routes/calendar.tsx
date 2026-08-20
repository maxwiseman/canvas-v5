import {
	useCalendarItems,
	useCanvasSnapshot,
	useCourses,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import { Badge } from "@canvas-v5/ui/components/badge";
import { Card, CardContent } from "@canvas-v5/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../components/page-header";
import { ResourceEmpty } from "../components/resource-empty";

export const Route = createFileRoute("/calendar")({ component: CalendarRoute });

function CalendarRoute() {
	const hasConnection = useCanvasSnapshot().accounts.length > 0;
	const items = [...useCalendarItems()].sort(
		(a, b) => Date.parse(a.start_at ?? "") - Date.parse(b.start_at ?? ""),
	);
	const courses = useCourses();
	const sync = useSyncStatus().find((state) => state.scope === "calendar");
	const courseNames = new Map(
		courses.map((course) => [`course_${course.id}`, course.name]),
	);
	const groups = groupByDay(items);

	return (
		<PageWrapper className="mx-auto w-full max-w-4xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Calendar</PageHeaderTitle>
					<PageHeaderSubtitle>
						Events and due dates across Canvas
					</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>
			{groups.length > 0 ? (
				<div className="flex flex-col gap-6">
					{groups.map(([date, dayItems]) => (
						<section key={date}>
							<h2 className="mb-3 font-medium text-sm">{formatDay(date)}</h2>
							<Card size="sm">
								<CardContent className="flex flex-col gap-1 px-2">
									{dayItems.map((item) => (
										<a
											className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-muted/50"
											href={item.html_url}
											key={item.id}
											rel="noreferrer noopener"
											target={item.html_url ? "_blank" : undefined}
										>
											<div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
												<CalendarDays className="size-4" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate font-medium">{item.title}</div>
												<div className="text-muted-foreground text-sm">
													{courseNames.get(item.context_code ?? "") ?? "Canvas"}{" "}
													· {formatTime(item.start_at)}
												</div>
											</div>
											{item.end_at ? (
												<Badge variant="outline">
													{formatTime(item.end_at)}
												</Badge>
											) : null}
										</a>
									))}
								</CardContent>
							</Card>
						</section>
					))}
				</div>
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

type CalendarItem = ReturnType<typeof useCalendarItems>[number];
function groupByDay(items: CalendarItem[]) {
	const groups = new Map<string, CalendarItem[]>();
	for (const item of items) {
		const date = item.start_at?.slice(0, 10) ?? "No date";
		groups.set(date, [...(groups.get(date) ?? []), item]);
	}
	return [...groups.entries()];
}
function formatDay(value: string) {
	const date = new Date(`${value}T12:00:00`);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, {
				weekday: "long",
				month: "long",
				day: "numeric",
			}).format(date);
}
function formatTime(value?: string | null) {
	if (!value) return "All day";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, {
				hour: "numeric",
				minute: "2-digit",
			}).format(date);
}
