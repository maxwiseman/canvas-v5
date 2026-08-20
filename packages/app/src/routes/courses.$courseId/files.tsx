import { useFiles, useSyncStatus } from "@canvas-v5/canvas-sdk";
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
import { createFileRoute } from "@tanstack/react-router";
import { Download, File } from "lucide-react";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../../components/page-header";
import { ResourceEmpty } from "../../components/resource-empty";

export const Route = createFileRoute("/courses/$courseId/files")({
	component: FilesRoute,
});

function FilesRoute() {
	const { courseId } = Route.useParams();
	const files = useFiles(courseId);
	const sync = useSyncStatus().find((state) => state.scope === "files");

	return (
		<PageWrapper className="mx-auto w-full max-w-4xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Files</PageHeaderTitle>
					<PageHeaderSubtitle>
						Downloads and course resources
					</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>
			{files.length > 0 ? (
				<ItemGroup>
					{files.map((file) => (
						<Item
							key={file.id}
							render={
								file.url && !file.locked_for_user ? (
									<a
										aria-label={`Download ${file.display_name}`}
										href={file.url}
										rel="noreferrer noopener"
										target="_blank"
									>
										<span className="sr-only">
											Download {file.display_name}
										</span>
									</a>
								) : undefined
							}
							variant="outline"
						>
							<ItemMedia variant="icon">
								<File />
							</ItemMedia>
							<ItemContent>
								<ItemTitle>{file.display_name}</ItemTitle>
								<ItemDescription>
									{file.locked_for_user
										? (file.lock_explanation ?? "Locked")
										: formatFileMeta(file.size, file.content_type)}
								</ItemDescription>
							</ItemContent>
							<ItemActions>
								{file.content_type ? (
									<Badge variant="outline">
										{shortType(file.content_type)}
									</Badge>
								) : null}
								{file.url && !file.locked_for_user ? (
									<Download className="size-4 text-muted-foreground" />
								) : null}
							</ItemActions>
						</Item>
					))}
				</ItemGroup>
			) : (
				<ResourceEmpty
					description="There are no available files in this course."
					error={sync?.status === "error" ? sync.error : undefined}
					loading={sync?.status === "syncing"}
					title="No files"
				/>
			)}
		</PageWrapper>
	);
}

function formatFileMeta(size?: number, type?: string) {
	const parts = [];
	if (type) parts.push(type);
	if (size !== undefined)
		parts.push(
			new Intl.NumberFormat(undefined, {
				style: "unit",
				unit: "byte",
				notation: "compact",
			}).format(size),
		);
	return parts.join(" · ") || "Course file";
}

function shortType(type: string) {
	return type.split("/").at(-1)?.toUpperCase() ?? type;
}
