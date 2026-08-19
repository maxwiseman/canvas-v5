import { useAssignments } from "@canvas-v5/canvas-sdk";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageHeaderContent, PageHeaderTitle, PageWrapper } from "../../../components/page-header";

export const Route = createFileRoute("/courses/$courseId/assignments/")({
	component: AssignmentsRoute,
});

function AssignmentsRoute() {
	const { courseId } = Route.useParams();
	return <AssignmentsView courseId={courseId} />;
}

export function AssignmentsView({ courseId }: { courseId: string }) {
	const assignments = useAssignments(courseId);
	const sortedAssignments = [...assignments].sort((a, b) => {
		if (a.due_at && b.due_at) {
			return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
		}

		if (a.due_at) return -1;
		if (b.due_at) return 1;

		return a.name.localeCompare(b.name);
	});

	return (
		<PageWrapper>
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Assignments</PageHeaderTitle>
        </PageHeaderContent>
			</PageHeader>
			<ul>
				{sortedAssignments.map((assignment) => (
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
		</PageWrapper>
	);
}
