import { useQuizzes, useSyncStatus } from "@canvas-v5/canvas-sdk";
import { Badge } from "@canvas-v5/ui/components/badge";
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
import { ChevronRight, ListChecks } from "lucide-react";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../../../components/page-header";
import { ResourceEmpty } from "../../../components/resource-empty";

export const Route = createFileRoute("/courses/$courseId/quizzes/")({
	component: QuizzesRoute,
});

function QuizzesRoute() {
	const { courseId } = Route.useParams();
	const quizzes = [...useQuizzes(courseId)].sort(compareQuizzes);
	const sync = useSyncStatus().find((state) => state.scope === "quizzes");

	return (
		<PageWrapper className="mx-auto w-full max-w-4xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Quizzes</PageHeaderTitle>
					<PageHeaderSubtitle>
						Assessments, practice, and results
					</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>
			{quizzes.length > 0 ? (
				<ItemGroup>
					{quizzes.map((quiz) => (
						<Item
							key={quiz.id}
							render={
								<Link
									params={{ courseId, quizId: String(quiz.id) } as never}
									to={"/courses/$courseId/quizzes/$quizId" as never}
								/>
							}
							variant="outline"
						>
							<ItemMedia variant="icon">
								<ListChecks />
							</ItemMedia>
							<ItemContent>
								<ItemTitle>{quiz.title}</ItemTitle>
								<ItemDescription>{formatDueDate(quiz.due_at)}</ItemDescription>
							</ItemContent>
							<ItemActions>
								{quiz.points_possible !== undefined ? (
									<Badge variant="outline">
										{quiz.points_possible ?? 0} pts
									</Badge>
								) : null}
								<ChevronRight className="size-4 text-muted-foreground" />
							</ItemActions>
						</Item>
					))}
				</ItemGroup>
			) : (
				<ResourceEmpty
					description="There are no available quizzes in this course."
					error={sync?.status === "error" ? sync.error : undefined}
					loading={sync?.status === "syncing"}
					title="No quizzes"
				/>
			)}
		</PageWrapper>
	);
}

function compareQuizzes(
	a: { due_at?: string | null; title: string },
	b: { due_at?: string | null; title: string },
) {
	if (a.due_at && b.due_at) return Date.parse(a.due_at) - Date.parse(b.due_at);
	if (a.due_at) return -1;
	if (b.due_at) return 1;
	return a.title.localeCompare(b.title);
}

function formatDueDate(value?: string | null) {
	if (!value) return "No due date";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: `Due ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)}`;
}
