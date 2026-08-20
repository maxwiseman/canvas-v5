import {
	useCanvasRuntime,
	useCanvasSnapshot,
	useConversation,
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
import { LoaderCircle, Send } from "lucide-react";
import { useState } from "react";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../../components/page-header";
import { ResourceEmpty } from "../../components/resource-empty";

export const Route = createFileRoute("/inbox/$conversationId")({
	component: ConversationRoute,
});

function ConversationRoute() {
	const { conversationId } = Route.useParams();
	const conversation = useConversation(conversationId);
	const runtime = useCanvasRuntime();
	const { canvasAuth } = useCanvasSnapshot();
	const sync = useSyncStatus().find((state) => state.scope === "conversations");
	const [message, setMessage] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string>();

	if (!conversation) {
		return (
			<PageWrapper>
				<ResourceEmpty
					description="This conversation is unavailable."
					error={sync?.status === "error" ? sync.error : undefined}
					loading={sync?.status === "syncing"}
					title="Conversation not found"
				/>
			</PageWrapper>
		);
	}

	const currentUserId =
		canvasAuth.status === "authenticated"
			? String(canvasAuth.user.id)
			: undefined;
	const participantNames = conversation.participants
		?.filter((participant) => String(participant.id) !== currentUserId)
		.map((participant) => participant.name)
		.filter(Boolean)
		.join(", ");

	async function send() {
		if (!message.trim() || submitting) return;
		setSubmitting(true);
		setError(undefined);
		try {
			await runtime.addConversationMessage(conversationId, message.trim());
			setMessage("");
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Unable to send message.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<PageWrapper className="mx-auto flex h-full w-full max-w-4xl flex-col">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>
						{conversation.subject || participantNames || "Conversation"}
					</PageHeaderTitle>
					<PageHeaderSubtitle>
						{participantNames || conversation.context_name || "Canvas inbox"}
					</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>
			<div className="flex flex-1 flex-col gap-3">
				{[...(conversation.messages ?? [])].reverse().map((entry) => {
					const own =
						currentUserId !== undefined &&
						String(entry.author_id) === currentUserId;
					const author = conversation.participants?.find(
						(participant) => String(participant.id) === String(entry.author_id),
					);
					return (
						<Card
							className={
								own
									? "ml-auto w-[min(85%,36rem)]"
									: "mr-auto w-[min(85%,36rem)]"
							}
							key={entry.id}
							size="sm"
						>
							<CardHeader>
								<div className="flex items-center gap-3">
									<Avatar>
										<AvatarFallback>
											{initials(author?.name ?? (own ? "You" : "Canvas user"))}
										</AvatarFallback>
									</Avatar>
									<div>
										<CardTitle>
											{own ? "You" : (author?.name ?? "Canvas user")}
										</CardTitle>
										<CardDescription>
											{formatDate(entry.created_at)}
										</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="whitespace-pre-wrap">
								{entry.body}
							</CardContent>
						</Card>
					);
				})}
			</div>
			<div className="sticky bottom-0 mt-6 rounded-2xl bg-background py-3">
				<Textarea
					aria-label="Reply"
					disabled={submitting}
					onChange={(event) => setMessage(event.target.value)}
					placeholder="Write a message…"
					rows={3}
					value={message}
				/>
				<div className="mt-2 flex items-center justify-between gap-3">
					{error ? (
						<p className="text-destructive text-sm">{error}</p>
					) : (
						<span />
					)}
					<Button
						disabled={!message.trim() || submitting}
						onClick={() => void send()}
					>
						{submitting ? (
							<LoaderCircle className="animate-spin" data-icon="inline-start" />
						) : (
							<Send data-icon="inline-start" />
						)}
						Send
					</Button>
				</div>
			</div>
		</PageWrapper>
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
