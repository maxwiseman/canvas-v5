import { createFileRoute } from "@tanstack/react-router";
import { SyllabusView } from "../../components/syllabus-view";

export const Route = createFileRoute("/courses/$courseId/syllabus")({
	component: SyllabusRoute,
});

function SyllabusRoute() {
	const { courseId } = Route.useParams();
	return <SyllabusView courseId={courseId} />;
}
