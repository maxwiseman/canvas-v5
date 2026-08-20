import { useQuiz, useSyncStatus } from "@canvas-v5/canvas-sdk";
import { Badge } from "@canvas-v5/ui/components/badge";
import { Button } from "@canvas-v5/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@canvas-v5/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, ExternalLink, ListChecks, RotateCw } from "lucide-react";
import { CanvasHTML } from "../../../components/canvas-html";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../../../components/page-header";
import { ResourceEmpty } from "../../../components/resource-empty";

export const Route = createFileRoute("/courses/$courseId/quizzes/$quizId")({
	component: QuizRoute,
});

function QuizRoute() {
	const { courseId, quizId } = Route.useParams();
	const quiz = useQuiz(courseId, quizId);
	const sync = useSyncStatus().find((state) => state.scope === "quizzes");

	if (!quiz) {
		return (
			<PageWrapper>
				<ResourceEmpty
					description="This quiz is unavailable."
					error={sync?.status === "error" ? sync.error : undefined}
					loading={sync?.status === "syncing"}
					title="Quiz not found"
				/>
			</PageWrapper>
		);
	}

	return (
		<PageWrapper className="mx-auto w-full max-w-5xl">
			<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<div>
					<PageHeader>
						<PageHeaderContent>
							<PageHeaderTitle>{quiz.title}</PageHeaderTitle>
							<PageHeaderSubtitle>
								{formatDueDate(quiz.due_at)}
							</PageHeaderSubtitle>
						</PageHeaderContent>
					</PageHeader>
					{quiz.locked_for_user ? (
						<ResourceEmpty
							description={
								quiz.lock_explanation ?? "This quiz is currently locked."
							}
							title="Quiz locked"
						/>
					) : (
						<CanvasHTML>{quiz.description ?? undefined}</CanvasHTML>
					)}
				</div>
				<Card size="sm">
					<CardHeader>
						<CardTitle>Quiz details</CardTitle>
						<CardDescription>Review before beginning</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<Detail
							icon={<ListChecks />}
							label={`${quiz.question_count ?? 0} questions`}
						/>
						<Detail
							icon={<Clock />}
							label={
								quiz.time_limit ? `${quiz.time_limit} minutes` : "No time limit"
							}
						/>
						<Detail
							icon={<RotateCw />}
							label={formatAttempts(quiz.allowed_attempts)}
						/>
						{quiz.points_possible !== undefined ? (
							<Badge variant="outline">
								{quiz.points_possible ?? 0} points
							</Badge>
						) : null}
						{quiz.html_url && !quiz.locked_for_user ? (
							<Button
								render={
									<a
										aria-label="Open quiz in Canvas"
										href={withNativeFallback(quiz.html_url)}
										rel="noreferrer noopener"
										target="_blank"
									>
										<span className="sr-only">Open quiz in Canvas</span>
									</a>
								}
							>
								<ExternalLink data-icon="inline-start" />
								Open quiz in Canvas
							</Button>
						) : null}
					</CardContent>
				</Card>
			</div>
		</PageWrapper>
	);
}

function Detail({ icon, label }: { icon: React.ReactNode; label: string }) {
	return (
		<div className="flex items-center gap-2 text-muted-foreground text-sm">
			{icon}
			{label}
		</div>
	);
}

function formatDueDate(value?: string | null) {
	if (!value) return "No due date";
	return `Due ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))}`;
}

function formatAttempts(value?: number) {
	if (value === -1) return "Unlimited attempts";
	if (!value) return "One attempt";
	return `${value} attempts`;
}

function withNativeFallback(value: string) {
	const url = new URL(value);
	url.searchParams.set("canvas_v5_native", "1");
	return url.toString();
}
