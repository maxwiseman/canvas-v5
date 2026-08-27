import { useDiscussions, useSyncStatus } from "@canvas-v5/canvas-sdk";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@canvas-v5/ui/components/accordion";
import { Badge } from "@canvas-v5/ui/components/badge";
import { Button } from "@canvas-v5/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";
import { CanvasHTML } from "../../components/canvas-html";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../../components/page-header";
import { ResourceEmpty } from "../../components/resource-empty";

export const Route = createFileRoute("/courses/$courseId/discussions")({
	component: DiscussionsRoute,
});

function DiscussionsRoute() {
	const { courseId } = Route.useParams();
	const discussions = useDiscussions(courseId);
	const sync = useSyncStatus().find((state) => state.scope === "discussions");

	return (
		<PageWrapper className="mx-auto w-full max-w-4xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Discussions</PageHeaderTitle>
					<PageHeaderSubtitle>
						Course conversations and replies
					</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>
			{discussions.length > 0 ? (
				<Accordion>
					{discussions.map((discussion) => (
						<AccordionItem key={discussion.id} value={String(discussion.id)}>
							<AccordionTrigger>
								<div className="flex min-w-0 items-center gap-3">
									<MessagesSquare className="size-4 shrink-0 text-muted-foreground" />
									<div className="min-w-0">
										<div className="truncate">{discussion.title}</div>
										<div className="mt-1 font-normal text-muted-foreground text-xs">
											{discussion.author?.name ?? "Course discussion"}
										</div>
									</div>
									{(discussion.unread_count ?? 0) > 0 ? (
										<Badge variant="secondary">
											{discussion.unread_count} unread
										</Badge>
									) : null}
								</div>
							</AccordionTrigger>
							<AccordionContent className="flex flex-col gap-4">
								<CanvasHTML>{discussion.message ?? undefined}</CanvasHTML>
								<Button
									className="self-start"
									render={
										<Link
											params={
												{ courseId, topicId: String(discussion.id) } as never
											}
											to={"/courses/$courseId/discussions/$topicId" as never}
										/>
									}
									variant="outline"
								>
									Read and reply
								</Button>
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			) : (
				<ResourceEmpty
					description="There are no active discussions in this course."
					error={sync?.status === "error" ? sync.error : undefined}
					loading={sync?.status === "syncing"}
					title="No discussions"
				/>
			)}
		</PageWrapper>
	);
}
