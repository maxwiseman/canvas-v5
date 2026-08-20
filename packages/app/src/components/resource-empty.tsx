import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@canvas-v5/ui/components/empty";
import { Inbox } from "lucide-react";

export function ResourceEmpty({
	title,
	description,
	loading,
	error,
}: {
	title: string;
	description: string;
	loading?: boolean;
	error?: string;
}) {
	return (
		<Empty className="border">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Inbox />
				</EmptyMedia>
				<EmptyTitle>
					{loading ? "Loading…" : error ? "Unable to load" : title}
				</EmptyTitle>
				<EmptyDescription>
					{error ?? (loading ? "Syncing with Canvas." : description)}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
