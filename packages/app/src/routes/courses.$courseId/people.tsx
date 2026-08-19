import { useCoursePeople, useSyncStatus } from "@canvas-v5/canvas-sdk";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@canvas-v5/ui/components/avatar";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/courses/$courseId/people")({
	component: PeopleRoute,
});

function PeopleRoute() {
	const { courseId } = Route.useParams();
	const people = [...useCoursePeople(courseId)].sort((a, b) =>
		(a.sortable_name ?? a.name).localeCompare(b.sortable_name ?? b.name),
	);
	const syncState = useSyncStatus().find((scope) => scope.scope === "people");

	return (
		<section className="mx-auto w-full max-w-3xl">
			<div className="mb-6 flex items-end justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl tracking-tight">People</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Everyone enrolled in this course
					</p>
				</div>
				{people.length > 0 ? (
					<span className="text-muted-foreground text-sm">
						{people.length} {people.length === 1 ? "person" : "people"}
					</span>
				) : null}
			</div>

			<div className="overflow-hidden rounded-xl border bg-card">
				{people.map((person) => (
					<div
						className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
						key={person.id}
					>
						<Avatar size="lg">
							{person.avatar_url ? (
								<AvatarImage alt="" src={person.avatar_url} />
							) : null}
							<AvatarFallback>{initials(person.name)}</AvatarFallback>
						</Avatar>
						<div className="min-w-0">
							<p className="truncate font-medium">{person.name}</p>
						</div>
					</div>
				))}

				{people.length === 0 ? (
					<div className="px-4 py-10 text-center text-muted-foreground text-sm">
						{syncState?.status === "syncing"
							? "Loading people…"
							: syncState?.status === "error"
								? syncState.error
								: "No people found."}
					</div>
				) : null}
			</div>
		</section>
	);
}

function initials(name: string) {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}
