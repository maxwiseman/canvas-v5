import {
	useAssignments,
	useSelfEnrollment,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import { Badge } from "@canvas-v5/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@canvas-v5/ui/components/card";
import { Progress } from "@canvas-v5/ui/components/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@canvas-v5/ui/components/table";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../../components/page-header";
import { ResourceEmpty } from "../../components/resource-empty";

export const Route = createFileRoute("/courses/$courseId/grades")({
	component: GradesRoute,
});

function GradesRoute() {
	const { courseId } = Route.useParams();
	const assignments = useAssignments(courseId).filter(
		(assignment) => !assignment.omit_from_final_grade,
	);
	const selfEnrollment = useSelfEnrollment(courseId);
	const syncStates = useSyncStatus();
	const sync =
		syncStates.find((state) => state.scope === "assignments") ??
		syncStates.find((state) => state.scope === "enrollments");
	// Naive points-based estimate, kept as a fallback when Canvas has not
	// returned a computed total (and as a starting point for a future
	// what-if calculator). It intentionally ignores assignment-group
	// weights, so it can differ from the Canvas total below.
	const graded = assignments.filter(
		(assignment) =>
			assignment.submission?.score !== undefined &&
			assignment.submission?.score !== null,
	);
	const earned = graded.reduce(
		(total, assignment) => total + (assignment.submission?.score ?? 0),
		0,
	);
	const possible = graded.reduce(
		(total, assignment) => total + (assignment.points_possible ?? 0),
		0,
	);
	const estimatedPercentage = possible > 0 ? (earned / possible) * 100 : 0;
	const canvasCurrent = selfEnrollment?.grades?.current_score ?? null;
	const canvasFinal = selfEnrollment?.grades?.final_score ?? null;
	const canvasLetter =
		selfEnrollment?.grades?.current_grade ??
		selfEnrollment?.grades?.final_grade ??
		null;
	const hasCanvasTotal = canvasCurrent != null || canvasFinal != null;
	const headlineScore = canvasCurrent ?? canvasFinal;
	const headlineLetter =
		canvasCurrent != null
			? (selfEnrollment?.grades?.current_grade ?? null)
			: (selfEnrollment?.grades?.final_grade ?? canvasLetter);

	return (
		<PageWrapper className="mx-auto w-full max-w-5xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Grades</PageHeaderTitle>
					<PageHeaderSubtitle>
						Your scores and submission status
					</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>

			{assignments.length > 0 ? (
				<div className="flex flex-col gap-6">
					<Card size="sm">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								{hasCanvasTotal && headlineScore != null ? (
									<>
										{`${headlineScore.toFixed(1)}%`}
										{headlineLetter ? (
											<Badge variant="secondary">{headlineLetter}</Badge>
										) : null}
									</>
								) : possible > 0 ? (
									`${estimatedPercentage.toFixed(1)}% (estimated)`
								) : (
									"No grade yet"
								)}
							</CardTitle>
							<CardDescription>
								{hasCanvasTotal ? (
									<>
										{canvasCurrent != null
											? "Total from Canvas, based on graded work."
											: "Total from Canvas, counting ungraded as zero."}
										{canvasFinal != null &&
										canvasCurrent != null &&
										canvasFinal !== canvasCurrent ? (
											<>
												{" "}
												Counting ungraded as zero: {canvasFinal.toFixed(1)}%.
											</>
										) : null}
									</>
								) : possible > 0 ? (
									<>
										{`Estimated from ${formatPoints(earned)} of ${formatPoints(possible)} graded points. `}
										Canvas has not returned a computed total yet.
									</>
								) : (
									"Graded work will appear here."
								)}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Progress
								value={
									(hasCanvasTotal ? headlineScore : null) ?? estimatedPercentage
								}
							/>
						</CardContent>
					</Card>
					<Card size="sm">
						<CardContent className="px-0">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Assignment</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="text-right">Score</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{assignments.map((assignment) => (
										<TableRow key={assignment.id}>
											<TableCell>
												<Link
													className="font-medium hover:underline"
													params={
														{
															courseId,
															assignmentId: String(assignment.id),
														} as never
													}
													to={
														"/courses/$courseId/assignments/$assignmentId" as never
													}
												>
													{assignment.name}
												</Link>
											</TableCell>
											<TableCell>
												<SubmissionBadge submission={assignment.submission} />
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{assignment.submission?.grade ??
													assignment.submission?.score ??
													"—"}
												{assignment.points_possible !== undefined ? (
													<span className="text-muted-foreground">
														{" "}
														/ {formatPoints(assignment.points_possible ?? 0)}
													</span>
												) : null}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</div>
			) : (
				<ResourceEmpty
					description="There are no graded assignments in this course."
					error={sync?.status === "error" ? sync.error : undefined}
					loading={sync?.status === "syncing"}
					title="No grades"
				/>
			)}
		</PageWrapper>
	);
}

function SubmissionBadge({
	submission,
}: {
	submission?: {
		workflow_state?: string;
		missing?: boolean;
		late?: boolean;
		excused?: boolean;
	} | null;
}) {
	if (submission?.excused) return <Badge variant="outline">Excused</Badge>;
	if (submission?.missing) return <Badge variant="destructive">Missing</Badge>;
	if (submission?.late) return <Badge variant="secondary">Late</Badge>;
	if (submission?.workflow_state === "graded") return <Badge>Graded</Badge>;
	if (submission?.workflow_state === "submitted")
		return <Badge variant="secondary">Submitted</Badge>;
	return <Badge variant="outline">Not submitted</Badge>;
}

function formatPoints(value: number) {
	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
		value,
	);
}
