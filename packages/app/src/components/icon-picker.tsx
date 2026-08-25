import { Select } from "@base-ui/react/select";
import type { IconId } from "@canvas-v5/canvas-sdk";
import { cn } from "@canvas-v5/ui/lib/utils";
import {
	Activity,
	Apple,
	Atom,
	BadgeDollarSign,
	Binary,
	Bookmark,
	BookOpen,
	Bot,
	Brain,
	BrainCircuit,
	BriefcaseBusiness,
	Brush,
	Bug,
	Calculator,
	Camera,
	ChartColumn,
	ChefHat,
	CircuitBoard,
	Clapperboard,
	CodeXml,
	Cog,
	Compass,
	Cone,
	Cpu,
	Database,
	Diff,
	Divide,
	Dna,
	DraftingCompass,
	Drama,
	Dumbbell,
	Earth,
	Feather,
	Film,
	FlaskConical,
	Gavel,
	GraduationCap,
	Hammer,
	HardHat,
	HeartHandshake,
	HeartPulse,
	Landmark,
	Languages,
	Leaf,
	Library,
	type LucideIcon,
	Map as MapIcon,
	Megaphone,
	Microscope,
	Mountain,
	Music,
	NotebookPen,
	Orbit,
	Palette,
	Pi,
	Plane,
	Radical,
	RadioTower,
	Ruler,
	Scale,
	School,
	ScrollText,
	Sigma,
	Star,
	Stethoscope,
	Telescope,
	Tractor,
	Users,
	Waves,
	Wrench,
} from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";

type IconPickerProps = {
	/** Controlled value. */
	value?: IconId | null;
	/** Uncontrolled initial value. */
	defaultValue?: IconId | null;
	onValueChange?: (value: IconId | null) => void;
	name?: string;
	disabled?: boolean;

	/** Accessible label for the trigger (visually hidden by default). */
	label?: string;

	/** Extra classes applied to the trigger button. */
	triggerClassName?: string;
	triggerStyle?: CSSProperties;
	/** Extra classes applied to the popup container. */
	popupClassName?: string;
};

export function IconPicker({
	value,
	defaultValue,
	onValueChange,
	name,
	disabled,
	label = "Icon",
	triggerClassName,
	triggerStyle,
	popupClassName,
}: IconPickerProps) {
	const [open, setOpen] = useState(false);
	const items = useMemo(
		() =>
			availableIcons.map((iconObj) => ({
				label: iconObj.name,
				value: iconObj.id,
			})),
		[],
	);

	return (
		<Select.Root
			items={items}
			name={name}
			value={value}
			defaultValue={defaultValue}
			disabled={disabled}
			open={open}
			onOpenChange={setOpen}
			onValueChange={(nextValue) => {
				const icon = (nextValue as IconId | null) ?? null;
				setOpen(false);
				globalThis.setTimeout(() => {
					void Promise.resolve(onValueChange?.(icon)).catch(() => {
						// The provider tracks failed mutations and rolls back optimistic state.
					});
				}, 0);
			}}
		>
			<Select.Label className="sr-only">{label}</Select.Label>

			<Select.Trigger
				aria-label={label}
				style={triggerStyle}
				className={cn(
					"inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors",
					"hover:bg-muted/50 hover:text-foreground",
					"focus-visible:ring-3 focus-visible:ring-ring/30",
					"disabled:pointer-events-none disabled:opacity-50",
					triggerClassName,
				)}
			>
				<Select.Value>
					{(currentValue) => {
						const id =
							typeof currentValue === "string"
								? (currentValue as IconId)
								: null;
						return id ? (
							<PickedIcon icon={id} className="size-4" />
						) : (
							<Star className="size-4 opacity-60" aria-hidden="true" />
						);
					}}
				</Select.Value>
			</Select.Trigger>

			<Select.Portal>
				<Select.Positioner
					align="start"
					sideOffset={8}
					alignItemWithTrigger={false}
					className="isolate z-50"
				>
					<Select.Popup
						className={cn(
							// Copied from `packages/ui/src/components/popover.tsx` for a consistent popup surface.
							"z-50 flex w-80 flex-col gap-4 rounded-3xl bg-popover p-4 text-popover-foreground text-sm shadow-lg outline-hidden ring-1 ring-foreground/5 duration-100 data-closed:animate-out data-open:animate-in dark:ring-foreground/10",
							// Icon-picker specifics
							"max-h-96 overflow-auto p-2",
							popupClassName,
						)}
					>
						<Select.List className="flex flex-col gap-3">
							{iconGroups.map((group) => (
								<Select.Group key={group.name}>
									<Select.GroupLabel className="mb-1 px-1 font-medium text-muted-foreground text-xs">
										{group.name}
									</Select.GroupLabel>
									<div className="grid grid-cols-7 gap-1">
										{group.icons.map((iconObj) => {
											const Icon = iconObj.icon;
											return (
												<Select.Item
													key={iconObj.id}
													value={iconObj.id}
													label={iconObj.name}
													title={iconObj.name}
													className={cn(
														"group grid size-9 cursor-pointer place-items-center rounded-xl",
														"text-muted-foreground transition-colors",
														"hover:bg-muted/50 hover:text-foreground",
														"data-highlighted:bg-muted/50 data-highlighted:text-foreground",
														"data-selected:bg-muted data-selected:text-foreground",
														"outline-none",
													)}
												>
													<Icon className="size-4" aria-hidden="true" />
													<Select.ItemText className="sr-only">
														{iconObj.name}
													</Select.ItemText>
												</Select.Item>
											);
										})}
									</div>
								</Select.Group>
							))}
						</Select.List>
					</Select.Popup>
				</Select.Positioner>
			</Select.Portal>
		</Select.Root>
	);
}

export function PickedIcon({
	icon,
	className,
}: {
	icon: IconId;
	className?: string;
}) {
	const found = availableIcons.find((i) => i.id === icon);
	if (!found) return null;
	const Icon = found.icon;
	return <Icon className={className} aria-hidden="true" />;
}

export function isIconId(value: string | null | undefined): value is IconId {
	return availableIcons.some((icon) => icon.id === value);
}

type CourseIcon = { id: IconId; name: string; icon: LucideIcon };
type CourseIconGroup = { name: string; icons: CourseIcon[] };

const iconGroups: CourseIconGroup[] = [
	{
		name: "General & School",
		icons: [
			{ id: "star", name: "Star", icon: Star },
			{ id: "book", name: "Book", icon: BookOpen },
			{ id: "bookmark", name: "Bookmark", icon: Bookmark },
			{ id: "notebook", name: "Notebook", icon: NotebookPen },
			{ id: "graduation-cap", name: "Graduation", icon: GraduationCap },
			{ id: "school", name: "School", icon: School },
			{ id: "library", name: "Library", icon: Library },
		],
	},
	{
		name: "Math",
		icons: [
			{ id: "calculator", name: "Calculator", icon: Calculator },
			{ id: "diff", name: "Plus or Minus", icon: Diff },
			{ id: "divide", name: "Divide", icon: Divide },
			{ id: "pi", name: "Pi", icon: Pi },
			{ id: "radical", name: "Radical", icon: Radical },
			{ id: "sigma", name: "Sigma", icon: Sigma },
			{ id: "cone", name: "Geometry", icon: Cone },
			{ id: "ruler", name: "Ruler", icon: Ruler },
			{
				id: "drafting-compass",
				name: "Drafting Compass",
				icon: DraftingCompass,
			},
		],
	},
	{
		name: "Natural Sciences",
		icons: [
			{ id: "atom", name: "Physics", icon: Atom },
			{ id: "flask", name: "Chemistry", icon: FlaskConical },
			{ id: "microscope", name: "Biology", icon: Microscope },
			{ id: "dna", name: "Genetics", icon: Dna },
			{ id: "telescope", name: "Astronomy", icon: Telescope },
			{ id: "orbit", name: "Space Science", icon: Orbit },
			{ id: "earth", name: "Earth Science", icon: Earth },
			{ id: "leaf", name: "Environmental Science", icon: Leaf },
			{ id: "bug", name: "Ecology", icon: Bug },
			{ id: "mountain", name: "Geology", icon: Mountain },
			{ id: "waves", name: "Marine Science", icon: Waves },
		],
	},
	{
		name: "Computing & Engineering",
		icons: [
			{ id: "code", name: "Programming", icon: CodeXml },
			{ id: "binary", name: "Computer Science", icon: Binary },
			{
				id: "brain-circuit",
				name: "Artificial Intelligence",
				icon: BrainCircuit,
			},
			{ id: "cpu", name: "Computer Engineering", icon: Cpu },
			{
				id: "circuit-board",
				name: "Electrical Engineering",
				icon: CircuitBoard,
			},
			{ id: "database", name: "Data Science", icon: Database },
			{ id: "bot", name: "Robotics", icon: Bot },
			{ id: "cog", name: "Mechanical Engineering", icon: Cog },
			{ id: "wrench", name: "Engineering", icon: Wrench },
			{ id: "hammer", name: "Construction", icon: Hammer },
			{ id: "hard-hat", name: "Civil Engineering", icon: HardHat },
		],
	},
	{
		name: "Humanities & Social Sciences",
		icons: [
			{ id: "languages", name: "World Languages", icon: Languages },
			{ id: "feather", name: "English & Writing", icon: Feather },
			{ id: "scroll", name: "History", icon: ScrollText },
			{ id: "government", name: "Government & Politics", icon: Landmark },
			{ id: "map", name: "Geography", icon: MapIcon },
			{ id: "compass", name: "Global Studies", icon: Compass },
			{ id: "brain", name: "Psychology", icon: Brain },
			{ id: "users", name: "Sociology", icon: Users },
		],
	},
	{
		name: "Arts & Media",
		icons: [
			{ id: "paintbrush", name: "Studio Art", icon: Brush },
			{ id: "palette", name: "Art & Design", icon: Palette },
			{ id: "music", name: "Music", icon: Music },
			{ id: "drama", name: "Theater", icon: Drama },
			{ id: "camera", name: "Photography", icon: Camera },
			{ id: "film", name: "Film Studies", icon: Film },
			{ id: "clapperboard", name: "Film Production", icon: Clapperboard },
			{ id: "megaphone", name: "Communications", icon: Megaphone },
		],
	},
	{
		name: "Business & Law",
		icons: [
			{ id: "briefcase", name: "Business", icon: BriefcaseBusiness },
			{ id: "chart-column", name: "Economics", icon: ChartColumn },
			{ id: "badge-dollar-sign", name: "Finance", icon: BadgeDollarSign },
			{ id: "heart-handshake", name: "Marketing", icon: HeartHandshake },
			{ id: "scale", name: "Law", icon: Scale },
			{ id: "gavel", name: "Criminal Justice", icon: Gavel },
		],
	},
	{
		name: "Health & Wellness",
		icons: [
			{ id: "heart-pulse", name: "Health Sciences", icon: HeartPulse },
			{ id: "stethoscope", name: "Medicine & Nursing", icon: Stethoscope },
			{ id: "activity", name: "Anatomy & Physiology", icon: Activity },
			{ id: "dumbbell", name: "Physical Education", icon: Dumbbell },
			{ id: "apple", name: "Nutrition", icon: Apple },
		],
	},
	{
		name: "Trades & Applied Studies",
		icons: [
			{ id: "chef-hat", name: "Culinary Arts", icon: ChefHat },
			{ id: "tractor", name: "Agriculture", icon: Tractor },
			{ id: "plane", name: "Aviation", icon: Plane },
			{ id: "radio-tower", name: "Broadcasting", icon: RadioTower },
		],
	},
];

export const availableIcons = iconGroups.flatMap((group) => group.icons);
