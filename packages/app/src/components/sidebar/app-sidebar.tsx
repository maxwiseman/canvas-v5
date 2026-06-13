import { useCourses } from "@canvas-v5/canvas-sdk";
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
import { Link } from "@tanstack/react-router";
import { GraduationCap, Home, MessageCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
// import { IconPicker } from "../icon-picker";
// import UserMenu from "../user-menu";
import { ClassSidebar } from "./class-sidebar";

export function AppSidebar() {
	const [hasGoneBack, setHasGoneBack] = useState(false);
	const courses = useCourses();

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
												className="pl-8"
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
											{/*<SidebarMenuAction
												render={
													<IconPicker
														triggerClassName="absolute top-1/2! left-1 right-auto size-6 -translate-y-1/2 hover:bg-sidebar-accent! hover:text-sidebar-accent-foreground"
														// @ts-expect-error - This will only ever be the valid icons
														value={course.app.icon ?? "book"}
														onValueChange={(val) =>
															setIcon(course.id.toString(), val)
														}
													/>
												}
												className="top-1/2! right-auto left-1 size-4 -translate-y-1/2"
											/>*/}
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
							<ClassSidebar onBack={() => setHasGoneBack(true)} />
						</motion.div>
					)}
				</AnimatePresence>
			</SidebarContent>
			<SidebarFooter>{/*<UserMenu />*/}</SidebarFooter>
		</Sidebar>
	);
}
