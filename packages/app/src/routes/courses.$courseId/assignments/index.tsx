import { useAssignments } from "@canvas-v5/canvas-sdk";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/courses/$courseId/assignments/")({
	component: AssignmentsRoute,
});

function AssignmentsRoute() {
	const { courseId } = Route.useParams();
	const assignments = useAssignments(courseId);

	return (
		<div>
			<h2>Assignments</h2>
			<ul>
				{assignments?.map((assignment) => (
					<li key={assignment.id}>
						<Link
							params={{ courseId, assignmentId: assignment.id }}
							to="/courses/$courseId/assignments/$assignmentId"
						>
							{assignment.name}
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
