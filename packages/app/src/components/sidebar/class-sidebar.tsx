import {
	useCourse,
	useCourseSidebarPreferences,
	useCourseTabs,
} from "@canvas-v5/canvas-sdk";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@canvas-v5/ui/components/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@canvas-v5/ui/components/dropdown-menu";
import {
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@canvas-v5/ui/components/sidebar";
import { Link, useParams } from "@tanstack/react-router";
import {
	Blocks,
	ChevronLeft,
	ChevronRight,
	Ellipsis,
	ExternalLink,
	Eye,
	EyeOff,
	Files,
	FileText,
	GraduationCap,
	LayoutGrid,
	LayoutList,
	LayoutTemplate,
	Megaphone,
	MessagesSquare,
	PencilLine,
	Plug,
	Users,
} from "lucide-react";
import { type ComponentType, useRef, useState } from "react";

const internalTabs: Record<
	string,
	{ href: (courseId: string) => string; icon: ComponentType }
> = {
	home: { href: (id) => `/courses/${id}`, icon: LayoutGrid },
	announcements: {
		href: (id) => `/courses/${id}/announcements`,
		icon: Megaphone,
	},
	modules: { href: (id) => `/courses/${id}/modules`, icon: Blocks },
	assignments: { href: (id) => `/courses/${id}/assignments`, icon: PencilLine },
	quizzes: { href: (id) => `/courses/${id}/quizzes`, icon: LayoutList },
	pages: { href: (id) => `/courses/${id}/pages`, icon: LayoutTemplate },
	discussions: {
		href: (id) => `/courses/${id}/discussions`,
		icon: MessagesSquare,
	},
	files: { href: (id) => `/courses/${id}/files`, icon: Files },
	people: { href: (id) => `/courses/${id}/people`, icon: Users },
	grades: { href: (id) => `/courses/${id}/grades`, icon: GraduationCap },
};

const fallbackTabs: Array<{ id: string; label: string; htmlUrl?: string }> = [
	{ id: "home", label: "Overview" },
	{ id: "announcements", label: "Announcements" },
	{ id: "modules", label: "Modules" },
	{ id: "assignments", label: "Assignments" },
	{ id: "quizzes", label: "Quizzes" },
	{ id: "pages", label: "Pages" },
	{ id: "discussions", label: "Discussions" },
	{ id: "files", label: "Files" },
	{ id: "people", label: "People" },
	{ id: "grades", label: "Grades" },
];

interface SidebarTab {
	id: string;
	label: string;
	htmlUrl?: string;
	external: boolean;
}

export function ClassSidebar({ onBack }: { onBack: () => void }) {
	const params = useParams({ strict: false }) as { courseId?: string };
	const courseId = params.courseId;
	const course = useCourse(courseId ?? "");
	const canvasTabs = useCourseTabs(courseId ?? "");
	const { hiddenTabIds, setHiddenTabIds } = useCourseSidebarPreferences(
		courseId ?? "",
	);
	const [pendingPreference, setPendingPreference] = useState<{
		courseId: string;
		tabIds: string[];
	} | null>(null);
	const preferenceUpdateId = useRef(0);

	if (!courseId) return null;
	if (!course) {
		return (
			<div className="px-3 py-2 text-muted-foreground text-sm">
				Loading course…
			</div>
		);
	}
	const resolvedCourseId = courseId;

	const tabs: SidebarTab[] = (
		canvasTabs.length > 0
			? canvasTabs.map((tab) => ({
					id: tab.canvas_tab_id ?? tab.id.replace(`${courseId}:`, ""),
					label: courseTabLabel(
						tab.canvas_tab_id ?? tab.id.replace(`${courseId}:`, ""),
						tab.label,
					),
					htmlUrl: tab.html_url,
					external:
						tab.type === "external" ||
						(tab.canvas_tab_id ?? tab.id).includes("context_external_tool_"),
				}))
			: fallbackTabs.map((tab) => ({ ...tab, external: false }))
	).sort((a, b) => Number(a.external) - Number(b.external));
	const displayedHiddenTabIds =
		pendingPreference?.courseId === resolvedCourseId
			? pendingPreference.tabIds
			: hiddenTabIds;
	const hiddenTabIdSet = new Set(displayedHiddenTabIds);
	const visibleTabs = tabs.filter(
		(tab) => tab.id === "home" || !hiddenTabIdSet.has(tab.id),
	);
	const hiddenTabs = tabs.filter(
		(tab) => tab.id !== "home" && hiddenTabIdSet.has(tab.id),
	);
	const primaryTabs = visibleTabs.filter((tab) => !tab.external);
	const externalTabs = visibleTabs.filter((tab) => tab.external);

	function updateHiddenTabs(nextTabIds: string[]) {
		const updateId = ++preferenceUpdateId.current;
		setPendingPreference({ courseId: resolvedCourseId, tabIds: nextTabIds });
		void setHiddenTabIds(nextTabIds)
			.catch(() => undefined)
			.finally(() => {
				if (preferenceUpdateId.current === updateId) {
					setPendingPreference(null);
				}
			});
	}

	function hideTab(tabId: string) {
		if (tabId === "home" || hiddenTabIdSet.has(tabId)) return;
		updateHiddenTabs([...displayedHiddenTabIds, tabId]);
	}

	function restoreTab(tabId: string) {
		updateHiddenTabs(
			displayedHiddenTabIds.filter((hiddenId) => hiddenId !== tabId),
		);
	}

	return (
		<>
			<SidebarMenuButton onClick={onBack} className="text-muted-foreground">
				<ChevronLeft />
				<div className="mr-6 w-full truncate text-center">{course.name}</div>
			</SidebarMenuButton>
			{primaryTabs.map((tab) => (
				<CourseTabRow
					courseId={courseId}
					key={tab.id}
					onHide={tab.id === "home" ? undefined : () => hideTab(tab.id)}
					tab={tab}
				/>
			))}
			<MoreMenu
				externalTabs={externalTabs}
				hiddenTabs={hiddenTabs}
				onRestore={restoreTab}
			/>
		</>
	);
}

function CourseTabRow({
	tab,
	courseId,
	onHide,
}: {
	tab: SidebarTab;
	courseId: string;
	onHide?: () => void;
}) {
	const internal = internalTabs[tab.id];
	const Icon = internal?.icon ?? (tab.external ? Plug : FileText);
	const button = internal ? (
		<SidebarMenuButton render={<Link to={internal.href(courseId) as never} />}>
			<Icon />
			<span className="min-w-0 flex-1 truncate">{tab.label}</span>
		</SidebarMenuButton>
	) : tab.htmlUrl ? (
		<SidebarMenuButton
			render={
				<a
					aria-label={`Open ${tab.label} in Canvas`}
					href={withNativeFallback(tab.htmlUrl)}
					rel="noreferrer noopener"
					target="_blank"
				>
					<Icon />
					<span className="min-w-0 flex-1 truncate">{tab.label}</span>
					<ExternalLink className="ml-auto" />
				</a>
			}
		/>
	) : null;

	if (!button) return null;
	return (
		<SidebarMenuItem>
			{button}
			{onHide ? (
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuAction
								aria-label={`Options for ${tab.label}`}
								showOnHover
							/>
						}
					>
						<Ellipsis />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" side="right">
						<DropdownMenuGroup>
							<DropdownMenuItem onClick={onHide}>
								<EyeOff />
								Hide from sidebar
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
		</SidebarMenuItem>
	);
}

function MoreMenu({
	externalTabs,
	hiddenTabs,
	onRestore,
}: {
	externalTabs: SidebarTab[];
	hiddenTabs: SidebarTab[];
	onRestore: (tabId: string) => void;
}) {
	const itemCount = externalTabs.length + hiddenTabs.length;
	return (
		<Collapsible className="group/collapsible" render={<SidebarMenuItem />}>
			<CollapsibleTrigger
				className="group/more-trigger"
				disabled={itemCount === 0}
				render={<SidebarMenuButton />}
			>
				<Ellipsis />
				<span className="min-w-0 flex-1 truncate">More</span>
				<ChevronRight className="transition-transform duration-200 group-data-panel-open/more-trigger:rotate-90" />
			</CollapsibleTrigger>
			<CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 data-ending-style:h-0 data-starting-style:h-0">
				<SidebarMenuSub>
					{externalTabs.map((tab) => (
						<ExternalToolSubItem key={tab.id} tab={tab} />
					))}
					{hiddenTabs.map((tab) => (
						<SidebarMenuSubItem key={tab.id}>
							<SidebarMenuSubButton
								aria-label={`Restore ${tab.label}`}
								className="w-full text-muted-foreground"
								render={
									<button onClick={() => onRestore(tab.id)} type="button" />
								}
							>
								<Eye />
								<span className="min-w-0 flex-1 truncate">{tab.label}</span>
							</SidebarMenuSubButton>
						</SidebarMenuSubItem>
					))}
				</SidebarMenuSub>
			</CollapsibleContent>
		</Collapsible>
	);
}

function ExternalToolSubItem({ tab }: { tab: SidebarTab }) {
	if (!tab.htmlUrl) return null;
	return (
		<SidebarMenuSubItem>
			<SidebarMenuSubButton
				render={
					// Base UI supplies the SidebarMenuSubButton children to the rendered anchor.
					// biome-ignore lint/a11y/useAnchorContent: The visible label is supplied below.
					<a
						aria-label={`Open ${tab.label} in Canvas`}
						href={withNativeFallback(tab.htmlUrl)}
						rel="noreferrer noopener"
						target="_blank"
					/>
				}
			>
				<Plug />
				<span className="min-w-0 flex-1 truncate">{tab.label}</span>
				<ExternalLink className="ml-auto" />
			</SidebarMenuSubButton>
		</SidebarMenuSubItem>
	);
}

function courseTabLabel(id: string, label?: string | null) {
	const normalizedLabel = label?.trim();
	if (normalizedLabel) return normalizedLabel;
	return (
		fallbackTabs.find((tab) => tab.id === id)?.label ??
		(id === "syllabus" ? "Syllabus" : "External tool")
	);
}

function withNativeFallback(value: string) {
	try {
		const url = new URL(value);
		url.searchParams.set("canvas_v5_native", "1");
		return url.toString();
	} catch {
		return value;
	}
}
