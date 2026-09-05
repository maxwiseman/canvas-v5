import { Button } from "@canvas-v5/ui/components/button";
import { Input } from "@canvas-v5/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "@canvas-v5/ui/components/popover";
import { Baseline, Highlighter, RotateCcw } from "lucide-react";
import type { TRange } from "platejs";
import { useEditorRef, useEditorSelector } from "platejs/react";
import { useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

const presets = [
	["Black", "#171717"],
	["Gray", "#737373"],
	["White", "#ffffff"],
	["Red", "#dc2626"],
	["Orange", "#ea580c"],
	["Yellow", "#facc15"],
	["Green", "#16a34a"],
	["Teal", "#0d9488"],
	["Blue", "#2563eb"],
	["Purple", "#9333ea"],
	["Pink", "#db2777"],
	["Soft yellow", "#fef08a"],
] as const;

export function SubmissionColorButton({
	mark,
	disabled,
}: {
	mark: "color" | "backgroundColor";
	disabled: boolean;
}) {
	const editor = useEditorRef();
	const current = useEditorSelector(
		(editor) => editor.api.marks()?.[mark],
		[mark],
	);
	const selection = useRef<TRange | null>(null);
	const [open, setOpen] = useState(false);
	const [color, setColor] = useState(mark === "color" ? "#171717" : "#fef08a");
	const [hex, setHex] = useState(color);
	const title = mark === "color" ? "Text color" : "Highlight color";
	const Icon = mark === "color" ? Baseline : Highlighter;
	function apply(next: string) {
		if (disabled) return;
		setColor(next);
		setHex(next);
		if (selection.current) editor.tf.select(selection.current);
		editor.tf.addMark(mark, next);
	}
	return (
		<Popover
			open={open && !disabled}
			onOpenChange={(next) => {
				if (next) {
					selection.current = editor.selection;
					const nextColor =
						typeof current === "string" && /^#[\da-f]{6}$/i.test(current)
							? current
							: color;
					setColor(nextColor);
					setHex(nextColor);
				}
				setOpen(next);
			}}
		>
			<PopoverTrigger
				render={
					<Button
						aria-label={title}
						disabled={disabled}
						size="icon-sm"
						title={title}
						variant="ghost"
					/>
				}
			>
				<span className="relative flex items-center justify-center pb-1">
					<Icon />
					<span
						className="absolute inset-x-0 bottom-0 h-0.5 rounded-full"
						style={{
							backgroundColor: typeof current === "string" ? current : color,
						}}
					/>
				</span>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-64 gap-3"
				finalFocus={() => {
					editor.tf.focus();
					return false;
				}}
			>
				<PopoverTitle className="sr-only">{title}</PopoverTitle>
				<HexColorPicker
					color={color}
					onChange={apply}
					style={{ width: "100%", height: 160 }}
				/>
				<fieldset aria-label="Preset colors" className="grid grid-cols-6 gap-2">
					{presets.map(([name, value]) => (
						<button
							aria-label={name}
							aria-pressed={color.toLowerCase() === value}
							className="size-7 rounded-full border border-foreground/15 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
							key={value}
							onClick={() => apply(value)}
							style={{ backgroundColor: value }}
							title={name}
							type="button"
						/>
					))}
				</fieldset>
				<Input
					aria-label={`${title} hex value`}
					value={hex}
					onChange={(event) => {
						const next = event.target.value;
						setHex(next);
						if (/^#[\da-f]{6}$/i.test(next)) apply(next);
					}}
					onBlur={() => setHex(color)}
					spellCheck={false}
				/>
				<Button
					size="sm"
					variant="ghost"
					onClick={() => {
						if (selection.current) editor.tf.select(selection.current);
						editor.tf.removeMark(mark);
						setOpen(false);
					}}
				>
					<RotateCcw data-icon="inline-start" />
					{mark === "color" ? "Automatic color" : "Remove highlight"}
				</Button>
			</PopoverContent>
		</Popover>
	);
}
