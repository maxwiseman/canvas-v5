import { useAssignment } from "@canvas-v5/canvas-sdk";
import { Button } from "@canvas-v5/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, ListChecks, RotateCw, Share } from "lucide-react";
import type { ReactNode } from "react";
import { CanvasHTML } from "../../../components/canvas-html";
import { CommentField } from "../../../components/comment-field";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
} from "../../../components/page-header";

export const Route = createFileRoute(
	"/courses/$courseId/assignments/$assignmentId",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { courseId, assignmentId } = Route.useParams();
	const assignment = useAssignment(courseId, assignmentId);
	return (
		<div className="p-8">
			<div className="flex gap-8">
				<div className="w-full">
					<PageHeader>
						<PageHeaderContent>
							<PageHeaderTitle>{assignment?.name}</PageHeaderTitle>
							{assignment?.due_at && (
								<PageHeaderSubtitle>
									{`Due ${new Date(assignment?.due_at).toLocaleDateString()}`}
								</PageHeaderSubtitle>
							)}
						</PageHeaderContent>
					</PageHeader>
					<CanvasHTML children={assignment?.description ?? undefined} />
					{/*<Textarea
						className="bg-input/10 ring-1 ring-border placeholder:text-muted-foreground/40"
						rows={4}
						placeholder="Add a comment..."
					/>*/}
					<CommentField />
				</div>
				<div className="flex h-max w-md flex-col items-start gap-1 font-medium">
					<div className="text-sm">Properties</div>
					<PropertiesButton>
						<Clock className="size-4 text-muted-foreground" />
						Tomorrow at 11:59
					</PropertiesButton>
					<PropertiesButton>
						<ListChecks className="size-4 text-muted-foreground" />
						100 Points
					</PropertiesButton>
					<PropertiesButton>
						<RotateCw className="size-4 text-muted-foreground" />2 Attempts
					</PropertiesButton>
					<PropertiesButton>
						<Share className="size-4 text-muted-foreground" />
						File Upload
					</PropertiesButton>
				</div>
			</div>
		</div>
	);
}

export function PropertiesButton({ children }: { children?: ReactNode }) {
	return (
		<Button
			size="sm"
			className="-ml-2.5 h-7 gap-2 pr-2.5 pl-2 text-sm"
			variant="ghost"
		>
			{children}
		</Button>
	);
}

// <Card className="h-max w-md gap-3 bg-card/60">
// 					<CardHeader>
// 						<CardTitle className="flex items-center gap-1 text-muted-foreground text-sm">
// 						Properties
// 							{/*<ChevronDown className="size-3.5" />*/}
// 						</CardTitle>
// 					</CardHeader>
// 					<CardContent className="flex flex-col items-start gap-2">
// 						<Button
// 							size="sm"
// 							className="-ml-2.5 h-7 gap-2 pr-2.5 pl-2 text-muted-foreground text-sm"
// 							variant="ghost"
// 						>
// 							<Clock className="size-4" />
// 							Tomorrow at 11:59
// 						</Button>
// 						<Button
// 							size="sm"
// 							className="-ml-2.5 h-7 gap-2 pr-2.5 pl-2 text-muted-foreground text-sm"
// 							variant="ghost"
// 						>
// 							<Plus className="size-4" />
// 							Add Todo
// 						</Button>
// 						<Button
// 							size="sm"
// 							className="-ml-2.5 h-7 gap-2 pr-2.5 pl-2 text-muted-foreground text-sm"
// 							variant="ghost"
// 						>
// 							<Check className="size-4" />
// 							Submit
// 						</Button>
// 					</CardContent>
// 				</Card>
