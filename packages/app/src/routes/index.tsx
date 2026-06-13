import { useCourses, useUpdateCourseIcon } from "@canvas-v5/canvas-sdk";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: CoursesRoute,
});

const ICON_OPTIONS = ["📘", "🧪", "🧮", "🎨", "🌎", "💬"];

function CoursesRoute() {
	const courses = useCourses();
	const updateCourseIcon = useUpdateCourseIcon();

	return (
		<section className="cv5-panel">
			<div className="cv5-panel-heading">
				<div>
					<p className="cv5-eyebrow">Cached Canvas source data plus overlays</p>
					<h2>Courses</h2>
				</div>
				<span className="cv5-muted">{courses.length} cached</span>
			</div>
			<div className="cv5-table">
				<div className="cv5-table-row cv5-table-head">
					<span>Icon</span>
					<span>Course</span>
					<span>State</span>
					<span>Overlay test</span>
				</div>
				{courses.map((course) => (
					<div className="cv5-table-row" key={course.id}>
						<span className="cv5-course-icon">{course.app?.icon ?? "□"}</span>
						<Link
							to={"/courses/$courseId" as never}
							params={{ courseId: String(course.id) } as never}
						>
							<strong>{course.name}</strong>
							<small>{course.course_code ?? course.id}</small>
						</Link>
						<span>{course.workflow_state ?? "unknown"}</span>
						<span className="cv5-icon-row">
							{ICON_OPTIONS.map((icon) => (
								<button
									aria-label={`Set icon to ${icon}`}
									className="cv5-icon-button"
									key={icon}
									type="button"
									onClick={() => void updateCourseIcon(course.id, icon)}
								>
									{icon}
								</button>
							))}
						</span>
					</div>
				))}
				{courses.length === 0 ? (
					<div className="cv5-empty">
						No cached courses yet. Use Sync courses after auth passes.
					</div>
				) : null}
			</div>
		</section>
	);
}
