import { useAssignment } from "@canvas-v5/canvas-sdk";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/courses/$courseId/assignments/$assignmentId",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { courseId, assignmentId } = Route.useParams();
	const assignment = useAssignment(courseId, assignmentId);
	return (
		<div>
			<h2>{assignment?.name ?? `Assignment ${assignmentId}`}</h2>
			<div
				dangerouslySetInnerHTML={{ __html: assignment?.description ?? "" }}
			/>
		</div>
	);
}
