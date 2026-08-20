import { usePages, useSyncStatus } from "@canvas-v5/canvas-sdk";
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
import { ChevronRight, FileText } from "lucide-react";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../../../components/page-header";
import { ResourceEmpty } from "../../../components/resource-empty";

export const Route = createFileRoute("/courses/$courseId/pages/")({
	component: PagesRoute,
});

function PagesRoute() {
	const { courseId } = Route.useParams();
	const pages = [...usePages(courseId)].sort((a, b) =>
		a.title.localeCompare(b.title),
	);
	const sync = useSyncStatus().find((state) => state.scope === "pages");

	return (
		<PageWrapper className="mx-auto w-full max-w-4xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Pages</PageHeaderTitle>
					<PageHeaderSubtitle>Course readings and resources</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>
			{pages.length > 0 ? (
				<ItemGroup>
					{pages.map((page) => (
						<Item
							key={page.id}
							render={
								<Link
									params={{ courseId, pageUrl: page.url } as never}
									to={"/courses/$courseId/pages/$pageUrl" as never}
								/>
							}
							variant="outline"
						>
							<ItemMedia variant="icon">
								<FileText />
							</ItemMedia>
							<ItemContent>
								<ItemTitle>{page.title}</ItemTitle>
								<ItemDescription>
									{page.front_page ? "Course front page" : "Canvas page"}
								</ItemDescription>
							</ItemContent>
							<ItemActions>
								{page.front_page ? (
									<Badge variant="secondary">Home</Badge>
								) : null}
								<ChevronRight className="size-4 text-muted-foreground" />
							</ItemActions>
						</Item>
					))}
				</ItemGroup>
			) : (
				<ResourceEmpty
					description="There are no published pages in this course."
					error={sync?.status === "error" ? sync.error : undefined}
					loading={sync?.status === "syncing"}
					title="No pages"
				/>
			)}
		</PageWrapper>
	);
}
