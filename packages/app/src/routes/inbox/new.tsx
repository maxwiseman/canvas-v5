import {
	useAllCoursePeople,
	useCanvasRuntime,
	useCourses,
} from "@canvas-v5/canvas-sdk";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@canvas-v5/ui/components/avatar";
import { Button } from "@canvas-v5/ui/components/button";
import { Card, CardContent } from "@canvas-v5/ui/components/card";
import { Checkbox } from "@canvas-v5/ui/components/checkbox";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@canvas-v5/ui/components/field";
import { Input } from "@canvas-v5/ui/components/input";
import { Textarea } from "@canvas-v5/ui/components/textarea";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoaderCircle, Search, Send } from "lucide-react";
import { useMemo, useState } from "react";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../../components/page-header";

export const Route = createFileRoute("/inbox/new")({
	component: NewMessageRoute,
});

function NewMessageRoute() {
	const runtime = useCanvasRuntime();
	const navigate = useNavigate();
	const people = useAllCoursePeople();
	const courses = useCourses();
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string>();
	const courseNames = new Map(
		courses.map((course) => [course.id, course.name]),
	);
	const recipients = useMemo(() => {
		const byUser = new Map<string, (typeof people)[number]>();
		for (const person of people)
			byUser.set(String(person.canvas_user_id), person);
		return [...byUser.values()].filter((person) =>
			person.name.toLowerCase().includes(query.trim().toLowerCase()),
		);
	}, [people, query]);

	async function send() {
		if (selected.size === 0 || !body.trim() || submitting) return;
		setSubmitting(true);
		setError(undefined);
		try {
			await runtime.createConversation({
				recipients: [...selected],
				subject: subject.trim() || undefined,
				body: body.trim(),
			});
			await navigate({ to: "/inbox" as never });
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Unable to send message.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<PageWrapper className="mx-auto w-full max-w-4xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>New message</PageHeaderTitle>
					<PageHeaderSubtitle>Send a Canvas conversation</PageHeaderSubtitle>
				</PageHeaderContent>
			</PageHeader>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="recipient-search">Recipients</FieldLabel>
					<div className="relative">
						<Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="pl-9"
							id="recipient-search"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search people in your courses"
							value={query}
						/>
					</div>
					<FieldDescription>{selected.size} selected</FieldDescription>
					<Card size="sm">
						<CardContent className="max-h-72 overflow-auto px-2">
							{recipients.map((person) => {
								const id = String(person.canvas_user_id);
								return (
									<label
										className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 hover:bg-muted/50"
										htmlFor={`recipient-${id}`}
										key={id}
									>
										<Checkbox
											checked={selected.has(id)}
											id={`recipient-${id}`}
											onCheckedChange={(checked) =>
												setSelected((current) => {
													const next = new Set(current);
													if (checked) next.add(id);
													else next.delete(id);
													return next;
												})
											}
										/>
										<Avatar>
											<AvatarImage alt="" src={person.avatar_url} />
											<AvatarFallback>{initials(person.name)}</AvatarFallback>
										</Avatar>
										<div className="min-w-0">
											<div className="truncate font-medium text-sm">
												{person.name}
											</div>
											<div className="truncate text-muted-foreground text-xs">
												{courseNames.get(person.course_id) ?? "Canvas"}
											</div>
										</div>
									</label>
								);
							})}
							{recipients.length === 0 ? (
								<p className="px-3 py-8 text-center text-muted-foreground text-sm">
									No matching people.
								</p>
							) : null}
						</CardContent>
					</Card>
				</Field>
				<Field>
					<FieldLabel htmlFor="message-subject">Subject</FieldLabel>
					<Input
						id="message-subject"
						onChange={(event) => setSubject(event.target.value)}
						placeholder="Optional"
						value={subject}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="message-body">Message</FieldLabel>
					<Textarea
						id="message-body"
						onChange={(event) => setBody(event.target.value)}
						rows={8}
						value={body}
					/>
				</Field>
			</FieldGroup>
			<div className="mt-6 flex items-center justify-between gap-3">
				{error ? <p className="text-destructive text-sm">{error}</p> : <span />}
				<Button
					disabled={selected.size === 0 || !body.trim() || submitting}
					onClick={() => void send()}
				>
					{submitting ? (
						<LoaderCircle className="animate-spin" data-icon="inline-start" />
					) : (
						<Send data-icon="inline-start" />
					)}
					Send message
				</Button>
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
