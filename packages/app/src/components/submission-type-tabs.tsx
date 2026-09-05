import { TabsList, TabsTrigger } from "@canvas-v5/ui/components/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@canvas-v5/ui/components/tooltip";
import {
	CircleHelp,
	ClipboardList,
	ExternalLink,
	FileCheck2,
	FileUp,
	Link,
	type LucideIcon,
	MessageSquare,
	NotebookPen,
	PenLine,
	Video,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

const submissionTypes: Record<string, { label: string; Icon: LucideIcon }> = {
	online_text_entry: { label: "Text", Icon: PenLine },
	online_url: { label: "Website", Icon: Link },
	online_upload: { label: "Files", Icon: FileUp },
	media_recording: { label: "Media", Icon: Video },
	student_annotation: { label: "Annotate", Icon: NotebookPen },
	online_quiz: { label: "Quiz", Icon: ClipboardList },
	discussion_topic: { label: "Discussion", Icon: MessageSquare },
	external_tool: { label: "External tool", Icon: ExternalLink },
	basic_lti_launch: { label: "External tool", Icon: ExternalLink },
	on_paper: { label: "On paper", Icon: NotebookPen },
	none: { label: "No submission", Icon: FileCheck2 },
	not_graded: { label: "Not graded", Icon: FileCheck2 },
};

export function SubmissionTypeTabs({
	types,
	disabled,
}: {
	types: string[];
	disabled: boolean;
}) {
	const container = useRef<HTMLDivElement>(null);
	const measure = useRef<HTMLDivElement>(null);
	const [iconsOnly, setIconsOnly] = useState(false);
	useLayoutEffect(() => {
		const wrapper = container.current;
		const labels = measure.current;
		if (!wrapper || !labels) return;
		const update = () =>
			setIconsOnly(labels.getBoundingClientRect().width > wrapper.clientWidth);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(wrapper);
		observer.observe(labels);
		return () => observer.disconnect();
	}, []);
	const options = types.map((type) => ({
		type,
		...(submissionTypes[type] ?? {
			label: type.replaceAll("_", " "),
			Icon: CircleHelp,
		}),
	}));
	return (
		<div className="relative min-w-0 overflow-hidden" ref={container}>
			{/* Measure the full labels independently so collapsing never causes an oscillation. */}
			<div
				aria-hidden="true"
				className="pointer-events-none invisible absolute top-0 left-0 flex w-max gap-1 p-1"
				ref={measure}
			>
				{options.map(({ type, label, Icon }) => (
					<span
						className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full border border-transparent px-3 font-medium text-sm"
						key={type}
					>
						<Icon className="size-4 shrink-0" />
						{label}
					</span>
				))}
			</div>
			<div className="overflow-x-auto">
				<TabsList
					aria-label="Submission type"
					className="w-full min-w-max gap-1"
				>
					{options.map(({ type, label, Icon }) => {
						const tab = (
							<TabsTrigger
								key={type}
								aria-label={label}
								className={iconsOnly ? "min-w-9 px-2" : "px-3"}
								disabled={disabled}
								value={type}
							>
								<Icon aria-hidden="true" className="size-4 shrink-0" />
								{!iconsOnly ? <span>{label}</span> : null}
							</TabsTrigger>
						);
						return iconsOnly ? (
							<Tooltip key={type}>
								<TooltipTrigger render={tab}>
									<Icon aria-hidden="true" className="size-4 shrink-0" />
								</TooltipTrigger>
								<TooltipContent>{label}</TooltipContent>
							</Tooltip>
						) : (
							tab
						);
					})}
				</TabsList>
			</div>
		</div>
	);
}
