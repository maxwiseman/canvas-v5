import { useAnnouncements, useSyncStatus } from "@canvas-v5/canvas-sdk";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@canvas-v5/ui/components/accordion";
import { Badge } from "@canvas-v5/ui/components/badge";
import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { CanvasHTML } from "../../components/canvas-html";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../../components/page-header";
import { ResourceEmpty } from "../../components/resource-empty";

export const Route = createFileRoute("/courses/$courseId/announcements")({
	component: AnnouncementsRoute,
});

function AnnouncementsRoute() {
	const { courseId } = Route.useParams();
	const announcements = useAnnouncements(courseId);
	const sync = useSyncStatus().find((state) => state.scope === "announcements");

	return (
		<PageWrapper className="mx-auto w-full max-w-4xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Announcements</PageHeaderTitle>
					<PageHeaderSubtitle>Updates from your instructors</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>

			{announcements.length > 0 ? (
				<Accordion>
					{announcements.map((announcement) => (
						<AccordionItem
							key={announcement.id}
							value={String(announcement.id)}
						>
							<AccordionTrigger>
								<div className="flex min-w-0 items-center gap-3">
									<Megaphone className="size-4 shrink-0 text-muted-foreground" />
									<div className="min-w-0">
										<div className="truncate">{announcement.title}</div>
										<div className="mt-1 font-normal text-muted-foreground text-xs">
											{formatDate(announcement.posted_at)}
										</div>
									</div>
									{announcement.read_state === "unread" ? (
										<Badge variant="secondary">New</Badge>
									) : null}
								</div>
							</AccordionTrigger>
							<AccordionContent>
								<CanvasHTML>{announcement.message}</CanvasHTML>
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			) : (
				<ResourceEmpty
					description="Your instructor has not posted any announcements."
					error={sync?.status === "error" ? sync.error : undefined}
					loading={sync?.status === "syncing"}
					title="No announcements"
				/>
			)}
		</PageWrapper>
	);
}

function formatDate(value?: string) {
	if (!value) return "Date unavailable";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(date);
}
