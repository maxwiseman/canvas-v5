import {
	type CanvasActivityItem,
	useCourse,
	useCourseHome,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import { createFileRoute } from "@tanstack/react-router";
import { CanvasHTML } from "../../components/canvas-html";
import { SyllabusView } from "../../components/syllabus-view";
import { AssignmentsView } from "./assignments/index";
import { ModulesView } from "./modules";

export const Route = createFileRoute("/courses/$courseId/")({
	component: CourseRoute,
});

function CourseRoute() {
	const { courseId } = Route.useParams();
	const course = useCourse(courseId);
	const defaultView = course?.default_view ?? "feed";
	const courseHome = useCourseHome(courseId, course ? defaultView : undefined);
	const homeSync = useSyncStatus().find(
		(scope) => scope.scope === "course-home",
	);

	if (!course) return <HomeStatus>Loading course…</HomeStatus>;

	if (defaultView === "modules") return <ModulesView courseId={courseId} />;
	if (defaultView === "assignments") {
		return <AssignmentsView courseId={courseId} />;
	}
	if (defaultView === "syllabus") {
		return <SyllabusView courseId={courseId} />;
	}
	if (defaultView === "wiki") {
		const frontPage = courseHome?.front_page;
		if (!frontPage) return <SyncStatus state={homeSync} />;
		return (
			<HomeDocument>
				{frontPage.locked_for_user ? (
					<HomeStatus>
						{frontPage.lock_explanation ?? "This page is currently locked."}
					</HomeStatus>
				) : (
					<CanvasHTML>{frontPage.body ?? undefined}</CanvasHTML>
				)}
			</HomeDocument>
		);
	}

	const activity = courseHome?.activity_stream;
	if (!activity) return <SyncStatus state={homeSync} />;
	return <ActivityStream items={activity} />;
}

function HomeDocument({ children }: { children: React.ReactNode }) {
	return <section className="mx-auto w-full max-w-3xl">{children}</section>;
}

function ActivityStream({ items }: { items: CanvasActivityItem[] }) {
	return (
		<section className="mx-auto w-full max-w-3xl">
			<h1 className="mb-6 font-semibold text-2xl tracking-tight">
				Recent activity
			</h1>
			<div className="space-y-3">
				{items.map((item) => (
					<article className="rounded-xl border bg-card p-4" key={item.id}>
						<div className="flex items-start justify-between gap-4">
							<h2 className="font-medium">{item.title}</h2>
							{item.created_at ? (
								<time className="shrink-0 text-muted-foreground text-xs">
									{formatActivityDate(item.created_at)}
								</time>
							) : null}
						</div>
						{item.message ? (
							<p className="mt-2 whitespace-pre-wrap text-muted-foreground text-sm">
								{item.message}
							</p>
						) : null}
					</article>
				))}
				{items.length === 0 ? (
					<HomeStatus>No recent course activity.</HomeStatus>
				) : null}
			</div>
		</section>
	);
}

function SyncStatus({
	state,
}: {
	state?: ReturnType<typeof useSyncStatus>[number];
}) {
	return (
		<HomeStatus>
			{state?.status === "error"
				? (state.error ?? "Unable to load the course home page.")
				: "Loading course home…"}
		</HomeStatus>
	);
}

function HomeStatus({ children }: { children: React.ReactNode }) {
	return (
		<div className="mx-auto w-full max-w-3xl rounded-xl border bg-card px-4 py-10 text-center text-muted-foreground text-sm">
			{children}
		</div>
	);
}

function formatActivityDate(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, {
				month: "short",
				day: "numeric",
			}).format(date);
}
