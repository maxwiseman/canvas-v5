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
import { Eye, File } from "lucide-react";
import { useState } from "react";
import {
	CanvasFilePreview,
	formatCanvasFileMeta,
	shortCanvasFileType,
} from "../../components/canvas-file-preview";
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
	const [selectedFileId, setSelectedFileId] = useState<number>();
	const selectedFile =
		files.find((file) => file.id === selectedFileId) ?? files[0];

	return (
		<PageWrapper className="mx-auto w-full max-w-7xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Files</PageHeaderTitle>
					<PageHeaderSubtitle>
						Downloads and course resources
					</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>
			{files.length > 0 ? (
				<div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
					<ItemGroup className="content-start gap-2.5">
						{files.map((file) => (
							<Item
								aria-pressed={selectedFile?.id === file.id}
								className="cursor-pointer text-left aria-pressed:border-primary/40 aria-pressed:bg-muted"
								key={file.id}
								onClick={() => setSelectedFileId(file.id)}
								render={<button type="button" />}
								size="sm"
								variant="outline"
							>
								<ItemMedia variant="icon">
									<File />
								</ItemMedia>
								<ItemContent className="min-w-0">
									<ItemTitle>{file.display_name}</ItemTitle>
									<ItemDescription>
										{file.locked_for_user
											? (file.lock_explanation ?? "Locked")
											: formatCanvasFileMeta(file.size, file.content_type)}
									</ItemDescription>
								</ItemContent>
								<ItemActions>
									{file.content_type ? (
										<Badge variant="outline">
											{shortCanvasFileType(file.content_type)}
										</Badge>
									) : null}
									{selectedFile?.id === file.id ? (
										<Eye className="size-4 text-muted-foreground" />
									) : null}
								</ItemActions>
							</Item>
						))}
					</ItemGroup>
					<CanvasFilePreview
						className="h-[min(48rem,calc(100dvh-12rem))] min-h-[32rem] lg:sticky lg:top-8"
						file={selectedFile}
					/>
				</div>
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
