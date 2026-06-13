import { useCourses, useUpdateCourseIcon } from "@canvas-v5/canvas-sdk";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@canvas-v5/ui/components/sidebar";
import { Link, useRouterState } from "@tanstack/react-router";
import { GraduationCap, Home, MessageCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ComponentType, useState } from "react";
import { IconPicker } from "../icon-picker";
import UserMenu from "../user-menu";
import { ClassSidebar } from "./class-sidebar";

const sidebars: {
	sidebar: ComponentType<{ onBack: () => void }>;
	matcher: RegExp;
}[] = [
	{
		sidebar: ClassSidebar,
		matcher: /^\/courses\/\d+\/?.*/,
	},
];

export function AppSidebar() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const activeSidebar = sidebars.find(({ matcher }) => matcher.test(pathname));
	const [hasGoneBack, setHasGoneBack] = useState(!activeSidebar);
	const courses = useCourses();
	const updateCourseIcon = useUpdateCourseIcon();
	const SidebarComponent = activeSidebar?.sidebar ?? (() => null);

	return (
		<Sidebar variant="inset">
			<SidebarContent>
				<AnimatePresence initial={false} mode="popLayout">
					{hasGoneBack && (
						<motion.div
							key="main-menu"
							transition={{
								ease: "easeOut",
								duration: 0.15,
							}}
							initial={{ opacity: 0, filter: "blur(2px)", x: -30 }}
							animate={{ opacity: 1, filter: "blur(0px)", x: 0 }}
							exit={{ opacity: 0, filter: "blur(2px)", x: -30 }}
							className="flex flex-col gap-2"
						>
							<SidebarMenuItem>
								<SidebarMenuButton
									onClick={() => setHasGoneBack(false)}
									render={<Link to="/" />}
								>
									<Home />
									Home
								</SidebarMenuButton>
							</SidebarMenuItem>
							{/*<SidebarMenuItem>
								<SidebarMenuButton
									onClick={() => setHasGoneBack(false)}
									render={<Link to="/settings" />}
								>
									<Settings />
									Settings
								</SidebarMenuButton>
							</SidebarMenuItem>*/}
							<SidebarMenuItem>
								<SidebarMenuButton onClick={() => setHasGoneBack(false)}>
									<MessageCircle />
									Chat
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton onClick={() => setHasGoneBack(false)}>
									<GraduationCap />
									Study
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarGroup>
								<SidebarGroupLabel>Classes</SidebarGroupLabel>
								<SidebarGroupContent>
									{courses.map((course) => (
										<SidebarMenuItem key={course.name}>
											<SidebarMenuButton
												className="pl-9.5"
												onClick={() => {
													setHasGoneBack(false);
												}}
												render={
													<Link
														to="/courses/$classId"
														params={{ classId: course.id.toString() }}
													/>
												}
											>
												{course.name}
											</SidebarMenuButton>
											<SidebarMenuAction
												render={
													<IconPicker
														triggerClassName="absolute top-1/2! left-2 right-auto size-6 hover:bg-sidebar-accent! hover:text-sidebar-accent-foreground"
														triggerStyle={{ transform: "translateY(-50%)" }}
														// @ts-expect-error - This will only ever be the valid icons
														value={course.app.icon ?? "book"}
														onValueChange={(val) =>
															updateCourseIcon(course.id, val)
														}
													/>
												}
												className="top-1/2! right-auto left-1 size-4 -translate-y-1/2"
											/>
										</SidebarMenuItem>
									))}
								</SidebarGroupContent>
							</SidebarGroup>
						</motion.div>
					)}
					{!hasGoneBack && (
						<motion.div
							key="sub-menu"
							transition={{
								ease: "easeOut",
								duration: 0.15,
							}}
							initial={{ opacity: 0, filter: "blur(2px)", x: 30 }}
							animate={{ opacity: 1, filter: "blur(0px)", x: 0 }}
							exit={{ opacity: 0, filter: "blur(2px)", x: 30 }}
							className="flex flex-col gap-2"
						>
							<SidebarComponent onBack={() => setHasGoneBack(true)} />
						</motion.div>
					)}
				</AnimatePresence>
			</SidebarContent>
			<SidebarFooter>
				<UserMenu />
			</SidebarFooter>
		</Sidebar>
	);
}
