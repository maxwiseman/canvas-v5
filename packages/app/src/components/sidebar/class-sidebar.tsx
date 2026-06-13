import { useCourse } from "@canvas-v5/canvas-sdk";
import { SidebarMenuButton } from "@canvas-v5/ui/components/sidebar";
import { Link, useParams } from "@tanstack/react-router";
import {
	Blocks,
	ChevronLeft,
	LayoutGrid,
	LayoutList,
	LayoutTemplate,
	Megaphone,
	PencilLine,
} from "lucide-react";

export function ClassSidebar({ onBack }: { onBack: () => void }) {
	const params = useParams({ strict: false }) as { courseId?: string };
	const classId = params.courseId;
	const course = useCourse(classId ?? "");

	if (!classId) return null;

	if (!course) return <div>Loading...</div>;

	return (
		<>
			<SidebarMenuButton onClick={onBack} className="text-muted-foreground">
				<ChevronLeft />
				<div className="mr-6 w-full text-center">{course.name}</div>
			</SidebarMenuButton>
			<SidebarMenuButton
				render={<Link to="/courses/$classId" params={{ classId }} />}
			>
				<LayoutGrid />
				Overview
			</SidebarMenuButton>
			<SidebarMenuButton
				render={
					<Link to="/courses/$classId/announcements" params={{ classId }} />
				}
			>
				<Megaphone />
				Announcements
			</SidebarMenuButton>
			<SidebarMenuButton
				render={<Link to="/courses/$classId/modules" params={{ classId }} />}
			>
				<Blocks />
				Modules
			</SidebarMenuButton>
			<SidebarMenuButton
				render={
					<Link to="/courses/$classId/assignments" params={{ classId }} />
				}
			>
				<PencilLine />
				Assignments
			</SidebarMenuButton>
			<SidebarMenuButton>
				<LayoutList />
				Quizzes
			</SidebarMenuButton>
			<SidebarMenuButton>
				<LayoutTemplate />
				Pages
			</SidebarMenuButton>
		</>
	);
}
