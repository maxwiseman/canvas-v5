import {
	useAssignments,
	useCourse,
	useCourseOverlay,
} from "@canvas-v5/canvas-sdk";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/courses/$courseId")({
	component: CourseRoute,
});

function CourseRoute() {
	const { courseId } = Route.useParams();
	const course = useCourse(courseId);
	const overlay = useCourseOverlay(courseId);
	const assignments = useAssignments(courseId);

	return (
		<section className="cv5-panel">
			<div className="cv5-panel-heading">
				<div>
					<p className="cv5-eyebrow">Course detail dev route</p>
					<h2>{course?.name ?? `Course ${courseId}`}</h2>
				</div>
				<span className="cv5-course-icon cv5-course-icon-large">
					{overlay?.icon ?? "□"}
				</span>
			</div>
			<div className="cv5-two-column">
				<div>
					<h3>Canvas record</h3>
					<pre>{JSON.stringify(course, null, 2)}</pre>
				</div>
				<div>
					<h3>Assignments</h3>
					<pre>{JSON.stringify(assignments, null, 2)}</pre>
				</div>
			</div>
		</section>
	);
}
