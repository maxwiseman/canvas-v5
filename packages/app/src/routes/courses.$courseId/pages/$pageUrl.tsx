import { usePage, useSyncStatus } from "@canvas-v5/canvas-sdk";
import { Badge } from "@canvas-v5/ui/components/badge";
import { createFileRoute } from "@tanstack/react-router";
import { CanvasHTML } from "../../../components/canvas-html";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderTitle,
	PageWrapper,
} from "../../../components/page-header";
import { ResourceEmpty } from "../../../components/resource-empty";

export const Route = createFileRoute("/courses/$courseId/pages/$pageUrl")({
	component: PageRoute,
});

function PageRoute() {
	const { courseId, pageUrl } = Route.useParams();
	const page = usePage(courseId, pageUrl);
	const sync = useSyncStatus().find((state) => state.scope === "pages");

	if (!page) {
		return (
			<PageWrapper className="mx-auto w-full max-w-3xl">
				<ResourceEmpty
					description="This page is unavailable."
					error={sync?.status === "error" ? sync.error : undefined}
					loading={sync?.status === "syncing"}
					title="Page not found"
				/>
			</PageWrapper>
		);
	}

	return (
		<PageWrapper className="mx-auto w-full max-w-3xl">
			<PageHeader>
				<PageHeaderContent>
					<div className="flex items-center gap-2">
						<PageHeaderTitle>{page.title}</PageHeaderTitle>
						{page.front_page ? <Badge variant="secondary">Home</Badge> : null}
					</div>
				</PageHeaderContent>
			</PageHeader>
			{page.locked_for_user ? (
				<ResourceEmpty
					description={
						page.lock_explanation ?? "This page is currently locked."
					}
					title="Page locked"
				/>
			) : (
				<CanvasHTML>{page.body ?? undefined}</CanvasHTML>
			)}
		</PageWrapper>
	);
}
