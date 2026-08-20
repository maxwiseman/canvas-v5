import {
	useCanvasRuntime,
	useDiscussion,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import { Avatar, AvatarFallback } from "@canvas-v5/ui/components/avatar";
import { Button } from "@canvas-v5/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@canvas-v5/ui/components/card";
import { Textarea } from "@canvas-v5/ui/components/textarea";
import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, Reply, Send } from "lucide-react";
import { useState } from "react";
import { CanvasHTML } from "../../../components/canvas-html";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../../../components/page-header";
import { ResourceEmpty } from "../../../components/resource-empty";

export const Route = createFileRoute("/courses/$courseId/discussions/$topicId")(
	{ component: DiscussionRoute },
);

function DiscussionRoute() {
	const { courseId, topicId } = Route.useParams();
	const { topic, entries } = useDiscussion(courseId, topicId);
	const runtime = useCanvasRuntime();
	const sync = useSyncStatus().find(
		(state) => state.scope === "discussion-entries",
	);

	if (!topic) {
		return (
			<PageWrapper>
				<ResourceEmpty
					description="This discussion is unavailable or requires an initial post in Canvas."
					error={sync?.status === "error" ? sync.error : undefined}
					loading={sync?.status === "syncing"}
					title="Discussion unavailable"
				/>
			</PageWrapper>
		);
	}

	return (
		<PageWrapper className="mx-auto w-full max-w-4xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>{topic.title}</PageHeaderTitle>
					<PageHeaderSubtitle>
						{topic.author?.name
							? `Started by ${topic.author.name}`
							: "Course discussion"}
					</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>
			<Card className="mb-6" size="sm">
				<CardContent>
					<CanvasHTML>{topic.message ?? undefined}</CanvasHTML>
				</CardContent>
			</Card>
			<Composer
				buttonLabel="Post reply"
				onSubmit={async (message) =>
					runtime.addDiscussionEntry(Number(courseId), Number(topicId), message)
				}
			/>
			<div className="mt-8 flex flex-col gap-4">
				{entries.map((entry) => (
					<EntryCard
						courseId={Number(courseId)}
						entry={entry}
						key={entry.id}
						topicId={Number(topicId)}
					/>
				))}
				{entries.length === 0 && sync?.status !== "syncing" ? (
					<ResourceEmpty
						description="Be the first to contribute to this discussion."
						title="No replies yet"
					/>
				) : null}
			</div>
		</PageWrapper>
	);
}

type Entry = ReturnType<typeof useDiscussion>["entries"][number];

function EntryCard({
	courseId,
	topicId,
	entry,
}: {
	courseId: number;
	topicId: number;
	entry: Entry;
}) {
	const runtime = useCanvasRuntime();
	const [replying, setReplying] = useState(false);
	return (
		<Card size="sm">
			<CardHeader>
				<div className="flex items-center gap-3">
					<Avatar>
						<AvatarFallback>
							{initials(entry.user_name ?? "Canvas user")}
						</AvatarFallback>
					</Avatar>
					<div>
						<CardTitle>{entry.user_name ?? "Canvas user"}</CardTitle>
						<CardDescription>{formatDate(entry.created_at)}</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<CanvasHTML>{entry.message}</CanvasHTML>
				<Button
					className="self-start"
					onClick={() => setReplying((value) => !value)}
					size="sm"
					variant="ghost"
				>
					<Reply data-icon="inline-start" />
					Reply
				</Button>
				{replying ? (
					<Composer
						buttonLabel="Send reply"
						onSubmit={async (message) => {
							await runtime.addDiscussionReply(
								courseId,
								topicId,
								entry.id,
								message,
							);
							setReplying(false);
						}}
					/>
				) : null}
				{entry.replies?.map((reply) => (
					<div className="ml-6 border-l pl-4" key={reply.id}>
						<div className="mb-2 text-muted-foreground text-xs">
							{reply.user_name ?? "Canvas user"} ·{" "}
							{formatDate(reply.created_at)}
						</div>
						<CanvasHTML>{reply.message}</CanvasHTML>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

function Composer({
	buttonLabel,
	onSubmit,
}: {
	buttonLabel: string;
	onSubmit: (message: string) => Promise<void>;
}) {
	const [message, setMessage] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string>();
	async function submit() {
		if (!message.trim() || submitting) return;
		setSubmitting(true);
		setError(undefined);
		try {
			await onSubmit(message.trim());
			setMessage("");
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Unable to post reply.",
			);
		} finally {
			setSubmitting(false);
		}
	}
	return (
		<div className="flex flex-col gap-2">
			<Textarea
				aria-label={buttonLabel}
				disabled={submitting}
				onChange={(event) => setMessage(event.target.value)}
				placeholder="Write a reply…"
				rows={3}
				value={message}
			/>
			<div className="flex items-center justify-between gap-3">
				{error ? <p className="text-destructive text-sm">{error}</p> : <span />}
				<Button
					disabled={!message.trim() || submitting}
					onClick={() => void submit()}
					size="sm"
				>
					{submitting ? (
						<LoaderCircle className="animate-spin" data-icon="inline-start" />
					) : (
						<Send data-icon="inline-start" />
					)}
					{buttonLabel}
				</Button>
			</div>
		</div>
	);
}

function initials(value: string) {
	return value
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}
function formatDate(value?: string) {
	if (!value) return "";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(date);
}
