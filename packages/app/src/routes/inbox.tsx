import {
	useCanvasSnapshot,
	useConversations,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@canvas-v5/ui/components/avatar";
import { Badge } from "@canvas-v5/ui/components/badge";
import { Button } from "@canvas-v5/ui/components/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@canvas-v5/ui/components/item";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, SquarePen } from "lucide-react";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../components/page-header";
import { ResourceEmpty } from "../components/resource-empty";

export const Route = createFileRoute("/inbox")({ component: InboxRoute });

function InboxRoute() {
	const hasConnection = useCanvasSnapshot().accounts.length > 0;
	const conversations = [...useConversations()].sort(
		(a, b) =>
			Date.parse(b.last_message_at ?? "") - Date.parse(a.last_message_at ?? ""),
	);
	const sync = useSyncStatus().find((state) => state.scope === "conversations");

	return (
		<PageWrapper className="mx-auto w-full max-w-4xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Inbox</PageHeaderTitle>
					<PageHeaderSubtitle>Messages from Canvas</PageHeaderSubtitle>
				</PageHeaderContent>
				<PageHeaderActions className="ml-auto">
					{hasConnection ? (
						<Button render={<Link to={"/inbox/new" as never} />} size="sm">
							<SquarePen data-icon="inline-start" />
							New message
						</Button>
					) : (
						<Button disabled size="sm">
							<SquarePen data-icon="inline-start" />
							New message
						</Button>
					)}
				</PageHeaderActions>
			</PageHeader>
			{conversations.length > 0 ? (
				<ItemGroup>
					{conversations.map((conversation) => (
						<Item
							key={conversation.id}
							render={
								<Link
									params={{ conversationId: conversation.id } as never}
									to={"/inbox/$conversationId" as never}
								/>
							}
							variant="outline"
						>
							<ItemMedia variant="image">
								<Avatar>
									{conversation.avatar_url ? (
										<AvatarImage alt="" src={conversation.avatar_url} />
									) : null}
									<AvatarFallback>
										{initials(
											conversation.participants
												?.map((participant) => participant.name)
												.filter(Boolean)
												.join(" ") ??
												conversation.subject ??
												"Message",
										)}
									</AvatarFallback>
								</Avatar>
							</ItemMedia>
							<ItemContent>
								<ItemTitle>
									{conversation.subject ||
										conversation.participants
											?.map((participant) => participant.name)
											.filter(Boolean)
											.join(", ") ||
										"Conversation"}
								</ItemTitle>
								<ItemDescription>
									{conversation.last_message ?? "No message preview"}
								</ItemDescription>
							</ItemContent>
							<ItemActions>
								{conversation.workflow_state === "unread" ? (
									<Badge variant="secondary">Unread</Badge>
								) : null}
								<span className="text-muted-foreground text-xs">
									{formatDate(conversation.last_message_at)}
								</span>
								<ChevronRight className="size-4 text-muted-foreground" />
							</ItemActions>
						</Item>
					))}
				</ItemGroup>
			) : (
				<ResourceEmpty
					description={
						hasConnection
							? "Canvas conversations will appear here."
							: "Connect a Canvas account to read and send messages."
					}
					error={
						hasConnection && sync?.status === "error" ? sync.error : undefined
					}
					loading={sync?.status === "syncing"}
					title={hasConnection ? "Inbox empty" : "Connect Canvas"}
				/>
			)}
		</PageWrapper>
	);
}

function initials(value: string) {
	return value
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

function formatDate(value?: string) {
	if (!value) return "";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? ""
		: new Intl.DateTimeFormat(undefined, {
				month: "short",
				day: "numeric",
			}).format(date);
}
