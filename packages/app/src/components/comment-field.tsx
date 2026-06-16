import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@canvas-v5/ui/components/input-group";
import { cn } from "@canvas-v5/ui/lib/utils";
import { ArrowUp, Paperclip } from "lucide-react";
import { useState } from "react";

export function CommentField() {
	const [commentContent, setCommentContent] = useState("");
	return (
		<InputGroup className="flex-col items-end bg-input/20 ring-1 ring-border">
			<InputGroupTextarea
				onChange={(e) => setCommentContent(e.target.value)}
				value={commentContent}
				className="px-4 py-3 text-base! placeholder:text-muted-foreground/50"
				placeholder="Add a comment..."
			/>
			<InputGroupAddon align="inline-end" className="w-full justify-end">
				<InputGroupButton
					className="text-muted-foreground/60"
					size="icon-sm"
					variant="ghost"
				>
					<Paperclip />
				</InputGroupButton>
				<InputGroupButton
					className={cn(commentContent.length <= 0 && "text-muted-foreground")}
					size="icon-sm"
					variant={commentContent.length <= 0 ? "secondary" : "default"}
				>
					<ArrowUp />
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	);
}
