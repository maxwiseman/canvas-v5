import {
	type CanvasModuleItem,
	useModules,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Blocks, ChevronRight, ExternalLink, FileText } from "lucide-react";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../../components/page-header";

export const Route = createFileRoute("/courses/$courseId/modules")({
	component: ModulesRoute,
});

function ModulesRoute() {
	const { courseId } = Route.useParams();
	return <ModulesView courseId={courseId} />;
}

export function ModulesView({ courseId }: { courseId: string }) {
	const modules = [...useModules(courseId)].sort(
		(a, b) => (a.position ?? 0) - (b.position ?? 0),
	);
	const syncState = useSyncStatus().find((scope) => scope.scope === "modules");

	return (
		<PageWrapper>
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Modules</PageHeaderTitle>
					<PageHeaderSubtitle>
						Course content, organized by module
					</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>

			<div className="space-y-3">
				{modules.map((module) => (
					<div
						className="overflow-hidden rounded-xl border bg-card"
						key={module.id}
					>
						<div className="flex items-center gap-3 px-4 py-4">
							<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
								<Blocks className="size-5" />
							</div>
							<div className="min-w-0 flex-1">
								<h2 className="truncate font-medium">{module.name}</h2>
								<p className="text-muted-foreground text-sm">
									{module.items?.length ?? module.items_count ?? 0}{" "}
									{(module.items?.length ?? module.items_count) === 1
										? "item"
										: "items"}
								</p>
							</div>
						</div>

						{module.items && module.items.length > 0 ? (
							<div className="border-t">
								{[...module.items]
									.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
									.map((item) => (
										<ModuleItemRow
											courseId={courseId}
											item={item}
											key={item.id}
										/>
									))}
							</div>
						) : (
							<div className="border-t px-4 py-3 text-muted-foreground text-sm">
								No items in this module.
							</div>
						)}
					</div>
				))}

				{modules.length === 0 ? (
					<div className="rounded-xl border bg-card px-4 py-10 text-center text-muted-foreground text-sm">
						{syncState?.status === "syncing"
							? "Loading modules…"
							: syncState?.status === "error"
								? syncState.error
								: "No modules found."}
					</div>
				) : null}
			</div>
		</PageWrapper>
	);
}

function ModuleItemRow({
	courseId,
	item,
}: {
	courseId: string;
	item: CanvasModuleItem;
}) {
	const link = moduleItemLink(courseId, item);
	const content = (
		<>
			<FileText className="size-4 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1 truncate">{item.title}</span>
			<span className="shrink-0 text-muted-foreground text-xs">
				{itemTypeLabel(item.type)}
			</span>
			{link?.external ? (
				<ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
			) : link ? (
				<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
			) : null}
		</>
	);

	if (!link) {
		return (
			<div
				className="flex min-h-11 items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
				style={{ paddingLeft: `${16 + (item.indent ?? 0) * 20}px` }}
			>
				{content}
			</div>
		);
	}

	if (!link.external) {
		return (
			<Link
				className="flex min-h-11 items-center gap-3 border-b px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50"
				style={{ paddingLeft: `${16 + (item.indent ?? 0) * 20}px` }}
				to={link.href as never}
			>
				{content}
			</Link>
		);
	}

	return (
		<a
			className="flex min-h-11 items-center gap-3 border-b px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50"
			href={link.href}
			rel="noreferrer noopener"
			style={{ paddingLeft: `${16 + (item.indent ?? 0) * 20}px` }}
			target="_blank"
		>
			{content}
		</a>
	);
}

function moduleItemLink(courseId: string, item: CanvasModuleItem) {
	const internalHref = internalModuleItemHref(courseId, item);
	if (internalHref) {
		return { href: internalHref, external: false };
	}

	const rawUrl =
		item.type === "ExternalUrl" ? item.external_url : item.html_url;
	if (!rawUrl) return undefined;

	try {
		const url = new URL(rawUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return undefined;
		}
		if (item.type !== "ExternalUrl") {
			url.searchParams.set("canvas_v5_native", "1");
		}
		return { href: url.toString(), external: true };
	} catch {
		return undefined;
	}
}

function internalModuleItemHref(courseId: string, item: CanvasModuleItem) {
	if (item.type === "Assignment" && item.content_id !== undefined) {
		return `/courses/${encodeURIComponent(courseId)}/assignments/${item.content_id}`;
	}
	if (item.type === "Quiz" && item.content_id !== undefined) {
		return `/courses/${encodeURIComponent(courseId)}/quizzes/${item.content_id}`;
	}
	if (item.type === "Page" && item.page_url) {
		return `/courses/${encodeURIComponent(courseId)}/pages/${encodeURIComponent(item.page_url)}`;
	}

	return undefined;
}

function itemTypeLabel(type: string) {
	return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}
