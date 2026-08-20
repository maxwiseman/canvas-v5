import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@canvas-v5/ui/components/input-group";
import { cn } from "@canvas-v5/ui/lib/utils";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { useState } from "react";

export function CommentField({
	onSubmit,
	disabled,
}: {
	onSubmit: (comment: string) => Promise<void>;
	disabled?: boolean;
}) {
	const [commentContent, setCommentContent] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const canSubmit =
		commentContent.trim().length > 0 && !submitting && !disabled;

	async function submit() {
		if (!canSubmit) return;
		setSubmitting(true);
		try {
			await onSubmit(commentContent.trim());
			setCommentContent("");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<InputGroup className="mt-8 flex-col items-end bg-input/20 ring-1 ring-border">
			<InputGroupTextarea
				disabled={disabled || submitting}
				onChange={(e) => setCommentContent(e.target.value)}
				value={commentContent}
				className="px-4 py-3 text-base! placeholder:text-muted-foreground/50"
				placeholder="Add a comment..."
			/>
			<InputGroupAddon align="inline-end" className="w-full justify-end">
				<InputGroupButton
					aria-label="Send comment"
					className={cn(!canSubmit && "text-muted-foreground")}
					disabled={!canSubmit}
					onClick={() => void submit()}
					size="icon-sm"
					variant={canSubmit ? "default" : "secondary"}
				>
					{submitting ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	);
}
