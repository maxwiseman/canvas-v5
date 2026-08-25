import { useCanvasRuntime, useCanvasSnapshot } from "@canvas-v5/canvas-sdk";
import { Button } from "@canvas-v5/ui/components/button";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@canvas-v5/ui/components/command";
import { useNavigate } from "@tanstack/react-router";
import {
	File,
	FileText,
	Megaphone,
	MessageSquare,
	PencilLine,
	School,
	ScrollText,
	Search,
} from "lucide-react";
import {
	type ComponentType,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

type SearchItem = {
	id: string;
	title: string;
	subtitle?: string;
	keywords: string;
	href: string;
	group: string;
	icon: ComponentType;
};

const resourcePresentation = {
	announcement: { group: "Announcements", icon: Megaphone },
	page: { group: "Pages", icon: FileText },
	quiz: { group: "Quizzes", icon: ScrollText },
	discussion: { group: "Discussions", icon: MessageSquare },
	"discussion-entry": { group: "Discussion posts", icon: MessageSquare },
	file: { group: "Files", icon: File },
} as const;

export function GlobalSearch() {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const snapshot = useCanvasSnapshot();
	const runtime = useCanvasRuntime();
	const navigate = useNavigate();
	const setSearchOpen = useCallback((nextOpen: boolean) => {
		if (nextOpen) setQuery("");
		setOpen(nextOpen);
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((current) => {
					const nextOpen = !current;
					if (nextOpen) setQuery("");
					return nextOpen;
				});
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	useEffect(() => {
		if (open) void runtime.syncSearchContent();
	}, [open, runtime]);

	const items = useMemo(() => buildSearchItems(snapshot), [snapshot]);
	const visibleItems = useMemo(() => {
		const terms = normalizeText(query).split(" ").filter(Boolean);
		const matching = terms.length
			? items.filter((item) =>
					terms.every((term) => item.keywords.includes(term)),
				)
			: items;
		return matching.slice(0, terms.length ? 60 : 24);
	}, [items, query]);
	const groups = groupSearchItems(visibleItems);

	function choose(item: SearchItem) {
		setOpen(false);
		setQuery("");
		void navigate({ to: item.href as never });
	}

	return (
		<>
			<Button
				aria-label="Search Canvas"
				className="w-full justify-start rounded-2xl px-3 text-muted-foreground"
				onClick={() => setSearchOpen(true)}
				variant="outline"
			>
				<Search data-icon="inline-start" />
				<span className="flex-1 text-left">Search</span>
				<kbd className="rounded-lg border bg-muted px-1.5 py-0.5 font-medium text-[11px] text-muted-foreground">
					⌘K
				</kbd>
			</Button>
			<CommandDialog open={open} onOpenChange={setSearchOpen}>
				<Command shouldFilter={false}>
					<CommandInput
						autoFocus
						onValueChange={setQuery}
						placeholder="Search assignments, pages, quizzes, discussions, files…"
						value={query}
					/>
					<CommandList>
						<CommandEmpty>No local results found.</CommandEmpty>
						{Array.from(groups, ([heading, groupItems]) => (
							<CommandGroup heading={heading} key={heading}>
								{groupItems.map((item) => {
									const Icon = item.icon;
									return (
										<CommandItem
											key={item.id}
											onSelect={() => choose(item)}
											value={item.id}
										>
											<Icon />
											<span className="min-w-0 flex-1">
												<span className="block truncate">{item.title}</span>
												{item.subtitle ? (
													<span className="block truncate text-muted-foreground text-xs">
														{item.subtitle}
													</span>
												) : null}
											</span>
											<CommandShortcut aria-hidden="true">↵</CommandShortcut>
										</CommandItem>
									);
								})}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			</CommandDialog>
		</>
	);
}

function buildSearchItems(snapshot: ReturnType<typeof useCanvasSnapshot>) {
	const courses = new Map(
		snapshot.courses.map((course) => [course.id, course]),
	);
	const courseItems: SearchItem[] = snapshot.courses.map((course) => ({
		id: `course:${course.id}`,
		title: course.name,
		subtitle: course.course_code,
		keywords: normalizeText(`${course.name} ${course.course_code ?? ""}`),
		href: `/courses/${course.id}`,
		group: "Courses",
		icon: School,
	}));
	const assignmentItems: SearchItem[] = snapshot.assignments.map(
		(assignment) => {
			const course = courses.get(assignment.course_id);
			return {
				id: `assignment:${assignment.course_id}:${assignment.id}`,
				title: assignment.name,
				subtitle: course?.name,
				keywords: normalizeText(
					`${assignment.name} ${course?.name ?? ""} ${stripHtml(assignment.description)}`,
				),
				href: `/courses/${assignment.course_id}/assignments/${assignment.id}`,
				group: "Assignments",
				icon: PencilLine,
			};
		},
	);
	const resourceItems: SearchItem[] = snapshot.resources.map((resource) => {
		const presentation = resourcePresentation[resource.resourceType];
		const course = courses.get(resource.course_id);
		return {
			id: `resource:${resource.id}`,
			title: resource.title,
			subtitle: course?.name,
			keywords: normalizeText(
				`${resource.title} ${course?.name ?? ""} ${stripHtml(resource.body)}`,
			),
			href: resourceHref(resource),
			group: presentation.group,
			icon: presentation.icon,
		};
	});
	return [...courseItems, ...assignmentItems, ...resourceItems];
}

function resourceHref(
	resource: ReturnType<typeof useCanvasSnapshot>["resources"][number],
) {
	const base = `/courses/${resource.course_id}`;
	if (resource.resourceType === "page") {
		return `${base}/pages/${encodeURIComponent(resource.canvasResourceId)}`;
	}
	if (resource.resourceType === "quiz") {
		return `${base}/quizzes/${resource.canvasResourceId}`;
	}
	if (resource.resourceType === "discussion") {
		return `${base}/discussions/${resource.canvasResourceId}`;
	}
	if (resource.resourceType === "discussion-entry") {
		const topicId = resource.metadata?.topic_id;
		return typeof topicId === "number" || typeof topicId === "string"
			? `${base}/discussions/${topicId}`
			: `${base}/discussions`;
	}
	if (resource.resourceType === "announcement") return `${base}/announcements`;
	if (resource.resourceType === "file") return `${base}/files`;
	return base;
}

function stripHtml(value: unknown) {
	if (typeof value !== "string") return "";
	return value.replace(/<[^>]*>/g, " ");
}

function normalizeText(value: string) {
	return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function groupSearchItems(items: SearchItem[]) {
	const groups = new Map<string, SearchItem[]>();
	for (const item of items) {
		const group = groups.get(item.group) ?? [];
		group.push(item);
		groups.set(item.group, group);
	}
	return groups;
}
