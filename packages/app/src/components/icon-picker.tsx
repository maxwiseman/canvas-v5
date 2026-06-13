import { Select } from "@base-ui/react/select";
import { cn } from "@canvas-v5/ui/lib/utils";
import {
	Atom,
	Binary,
	Bookmark,
	BookOpen,
	Brain,
	BrainCircuit,
	Brush,
	Calculator,
	CodeXml,
	Cone,
	Diff,
	Divide,
	Earth,
	FlaskConical,
	Landmark,
	Microscope,
	NotebookPen,
	Palette,
	Pi,
	Radical,
	Star,
} from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";

type IconId = (typeof icons)[number]["id"];

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
			icons.map((iconObj) => ({
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
							"z-50 flex w-72 flex-col gap-4 rounded-3xl bg-popover p-4 text-popover-foreground text-sm shadow-lg outline-hidden ring-1 ring-foreground/5 duration-100 data-closed:animate-out data-open:animate-in dark:ring-foreground/10",
							// Icon-picker specifics
							"max-h-72 overflow-auto p-2",
							popupClassName,
						)}
					>
						<Select.List className="grid grid-cols-6 gap-1">
							{icons.map((iconObj) => {
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
	const found = icons.find((i) => i.id === icon);
	if (!found) return null;
	const Icon = found.icon;
	return <Icon className={className} aria-hidden="true" />;
}

const icons = [
	{ id: "atom", name: "Atom", icon: Atom },
	{ id: "flask", name: "Flask", icon: FlaskConical },
	{ id: "microscope", name: "Microscope", icon: Microscope },
	{ id: "book", name: "Book", icon: BookOpen },
	{ id: "bookmark", name: "Bookmark", icon: Bookmark },
	{ id: "notebook", name: "Notebook", icon: NotebookPen },
	{ id: "star", name: "Star", icon: Star },
	{ id: "paintbrush", name: "Paintbrush", icon: Brush },
	{ id: "palette", name: "Palette", icon: Palette },
	{ id: "brain", name: "Brain", icon: Brain },
	{ id: "brain-circuit", name: "Brain Circuit", icon: BrainCircuit },
	{ id: "calculator", name: "Calculator", icon: Calculator },
	{ id: "diff", name: "Plus or Minus", icon: Diff },
	{ id: "divide", name: "Divide", icon: Divide },
	{ id: "pi", name: "Pi", icon: Pi },
	{ id: "radical", name: "Radical", icon: Radical },
	{ id: "cone", name: "Cone", icon: Cone },
	{ id: "code", name: "Code", icon: CodeXml },
	{ id: "binary", name: "Binary", icon: Binary },
	{ id: "government", name: "Government", icon: Landmark },
	{ id: "earth", name: "Earth", icon: Earth },
] as const;

export const iconIds = icons.map((i) => i.id);
export type { IconId };
export { icons as availableIcons };
