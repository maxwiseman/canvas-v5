import { useAssignments } from "@canvas-v5/canvas-sdk";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderTitle,
	PageWrapper,
} from "../../../components/page-header";

export const Route = createFileRoute("/courses/$courseId/assignments/")({
	component: AssignmentsRoute,
});

function AssignmentsRoute() {
	const { courseId } = Route.useParams();
	return <AssignmentsView courseId={courseId} />;
}

export function AssignmentsView({ courseId }: { courseId: string }) {
	const assignments = useAssignments(courseId);

	return (
		<PageWrapper>
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Assignments</PageHeaderTitle>
				</PageHeaderContent>
			</PageHeader>
			<ul>
				{assignments.map((assignment) => (
					<li key={assignment.id}>
						<Link
							params={{ courseId, assignmentId: assignment.id } as never}
							to={"/courses/$courseId/assignments/$assignmentId" as never}
						>
							{assignment.name}
						</Link>
					</li>
				))}
			</ul>
		</PageWrapper>
	);
}
