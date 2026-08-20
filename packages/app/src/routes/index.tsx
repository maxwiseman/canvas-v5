import { useCourses, usePlannerItems } from "@canvas-v5/canvas-sdk";
import { Badge } from "@canvas-v5/ui/components/badge";
import { Button } from "@canvas-v5/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@canvas-v5/ui/components/card";
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
import { ArrowRight, CalendarDays, GraduationCap } from "lucide-react";
import { isIconId, PickedIcon } from "../components/icon-picker";
import { PageWrapper } from "../components/page-header";
import { ResourceEmpty } from "../components/resource-empty";

export const Route = createFileRoute("/")({ component: DashboardRoute });

function DashboardRoute() {
	const courses = useCourses();
	const plannerItems = [...usePlannerItems()]
		.filter((item) => !item.planner_override?.marked_complete)
		.sort(
			(a, b) => Date.parse(itemDate(a) ?? "") - Date.parse(itemDate(b) ?? ""),
		)
		.slice(0, 5);
	const courseNames = new Map(
		courses.map((course) => [course.id, course.name]),
	);

	return (
		<PageWrapper className="mx-auto w-full max-w-6xl">
			<header className="mb-8">
				<p className="text-muted-foreground text-sm">Your learning space</p>
				<h1 className="font-medium text-3xl">Home</h1>
			</header>

			<div className="flex flex-col gap-10">
				<section>
					<div className="mb-4 flex items-center justify-between gap-4">
						<h2 className="font-medium text-lg">Courses</h2>
						<Badge variant="outline">{courses.length} active</Badge>
					</div>
					{courses.length > 0 ? (
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{courses.map((course) => (
								<Card key={course.id} size="sm">
									<CardHeader>
										<div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
											{isIconId(course.app?.icon) ? (
												<PickedIcon className="size-5" icon={course.app.icon} />
											) : (
												<GraduationCap className="size-5" />
											)}
										</div>
										<CardTitle>{course.name}</CardTitle>
										<CardDescription>
											{course.course_code ?? "Canvas course"}
										</CardDescription>
										<CardAction>
											<Badge variant="secondary">
												{course.workflow_state ?? "active"}
											</Badge>
										</CardAction>
									</CardHeader>
									<CardContent>
										<Button
											className="w-full"
											render={
												<Link
											params={{ courseId: String(course.id) } as never}
											to={"/courses/$courseId" as never}
												/>
											}
											variant="outline"
										>
											Open course
											<ArrowRight data-icon="inline-end" />
										</Button>
									</CardContent>
								</Card>
							))}
						</div>
					) : (
						<ResourceEmpty
							description="Connect a Canvas account or open an authenticated Canvas page with the extension."
							title="No courses yet"
						/>
					)}
				</section>

				<section>
					<div className="mb-4 flex items-center justify-between gap-4">
						<div>
							<h2 className="font-medium text-lg">Coming up</h2>
							<p className="text-muted-foreground text-sm">
								Your next five planner items
							</p>
						</div>
						<Button render={<Link to={"/planner" as never} />} size="sm" variant="ghost">
							View planner
							<ArrowRight data-icon="inline-end" />
						</Button>
					</div>
					{plannerItems.length > 0 ? (
						<ItemGroup>
							{plannerItems.map((item) => (
								<Item
									key={item.id}
									render={
										internalHref(item) ? (
											<Link to={internalHref(item) as never} />
										) : undefined
									}
									variant="outline"
								>
									<ItemMedia variant="icon">
										<CalendarDays />
									</ItemMedia>
									<ItemContent>
										<ItemTitle>{itemTitle(item)}</ItemTitle>
										<ItemDescription>
											{courseNames.get(item.course_id ?? -1) ??
												item.context_name ??
												"Personal"}
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<span className="text-muted-foreground text-sm">
											{formatDate(itemDate(item))}
										</span>
									</ItemActions>
								</Item>
							))}
						</ItemGroup>
					) : (
						<ResourceEmpty
							description="There is nothing due soon."
							title="You are caught up"
						/>
					)}
				</section>
			</div>
		</PageWrapper>
	);
}

type PlannerItem = ReturnType<typeof usePlannerItems>[number];

function itemTitle(item: PlannerItem) {
	return (
		item.plannable?.title ??
		item.plannable?.name ??
		item.plannable_type.replaceAll("_", " ")
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
				month: "short",
				day: "numeric",
			}).format(date);
}

function internalHref(item: PlannerItem) {
	if (!item.course_id) return undefined;
	if (item.plannable_type.toLowerCase() === "assignment")
		return `/courses/${item.course_id}/assignments/${item.plannable_id}`;
	if (item.plannable_type.toLowerCase() === "quiz")
		return `/courses/${item.course_id}/quizzes/${item.plannable_id}`;
	return undefined;
}
