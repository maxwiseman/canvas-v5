import { useCourse, useCourseTabs } from "@canvas-v5/canvas-sdk";
import { SidebarMenuButton } from "@canvas-v5/ui/components/sidebar";
import { Link, useParams } from "@tanstack/react-router";
import {
	Blocks,
	ChevronLeft,
	ExternalLink,
	Files,
	FileText,
	GraduationCap,
	LayoutGrid,
	LayoutList,
	LayoutTemplate,
	Megaphone,
	MessagesSquare,
	PencilLine,
	Users,
} from "lucide-react";
import type { ComponentType } from "react";

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

export function ClassSidebar({ onBack }: { onBack: () => void }) {
	const params = useParams({ strict: false }) as { courseId?: string };
	const courseId = params.courseId;
	const course = useCourse(courseId ?? "");
	const canvasTabs = useCourseTabs(courseId ?? "");

	if (!courseId) return null;
	if (!course) {
		return (
			<div className="px-3 py-2 text-muted-foreground text-sm">
				Loading course…
			</div>
		);
	}

	const tabs =
		canvasTabs.length > 0
			? canvasTabs.map((tab) => ({
					id: tab.canvas_tab_id ?? tab.id.replace(`${courseId}:`, ""),
					label: tab.label,
					htmlUrl: tab.html_url,
				}))
			: fallbackTabs;

	return (
		<>
			<SidebarMenuButton onClick={onBack} className="text-muted-foreground">
				<ChevronLeft />
				<div className="mr-6 w-full truncate text-center">{course.name}</div>
			</SidebarMenuButton>
			{tabs.map((tab) => {
				const internal = internalTabs[tab.id];
				if (internal) {
					const Icon = internal.icon;
					return (
						<SidebarMenuButton
							key={tab.id}
							render={<Link to={internal.href(courseId) as never} />}
						>
							<Icon />
							{tab.label}
						</SidebarMenuButton>
					);
				}

				if (!tab.htmlUrl) return null;
				return (
					<SidebarMenuButton
						key={tab.id}
						render={
							<a
								aria-label={`Open ${tab.label} in Canvas`}
								href={withNativeFallback(tab.htmlUrl)}
								rel="noreferrer noopener"
								target="_blank"
							>
								<span className="sr-only">Open {tab.label} in Canvas</span>
							</a>
						}
					>
						<FileText />
						{tab.label}
						<ExternalLink className="ml-auto" />
					</SidebarMenuButton>
				);
			})}
		</>
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
