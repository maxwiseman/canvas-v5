import { useAssignment } from "@canvas-v5/canvas-sdk";
import { Button } from "@canvas-v5/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@canvas-v5/ui/components/card";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@canvas-v5/ui/components/input-group";
import { Textarea } from "@canvas-v5/ui/components/textarea";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUp, Check, Paperclip, Plus } from "lucide-react";
import { CanvasHTML } from "../../../components/canvas-html";
import { CommentField } from "../../../components/comment-field";

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
				<div>
					<h2 className="mb-6 font-serif text-3xl">
						{assignment?.name ?? `Assignment ${assignmentId}`}
					</h2>
					<CanvasHTML children={assignment?.description ?? undefined} />
					{/*<Textarea
						className="bg-input/10 ring-1 ring-border placeholder:text-muted-foreground/40"
						rows={4}
						placeholder="Add a comment..."
					/>*/}
					<CommentField />
				</div>
				<Card className="h-max w-md gap-3 bg-card/60">
					<CardHeader>
						<CardTitle className="flex items-center gap-1 text-muted-foreground text-sm">
							Actions
							{/*<ChevronDown className="size-3.5" />*/}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col items-start gap-2">
						<Button
							size="sm"
							className="-ml-2.5 h-7 pr-2.5 pl-2 text-muted-foreground text-sm"
							variant="ghost"
						>
							<Plus className="size-4" />
							Add Todo
						</Button>
						<Button
							size="sm"
							className="-ml-2.5 h-7 pr-2.5 pl-2 text-muted-foreground text-sm"
							variant="ghost"
						>
							<Check className="size-4" />
							Submit
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
