import { useMutationQueue } from "@canvas-v5/canvas-sdk";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dev/mutations")({
	component: MutationsRoute,
});

function MutationsRoute() {
	const mutations = useMutationQueue();

	return (
		<section className="cv5-panel">
			<div className="cv5-panel-heading">
				<div>
					<p className="cv5-eyebrow">Durable optimistic queue</p>
					<h2>Mutation queue</h2>
				</div>
				<span className="cv5-muted">{mutations.length} total</span>
			</div>
			<div className="cv5-table">
				<div className="cv5-table-row cv5-table-head">
					<span>Type</span>
					<span>Status</span>
					<span>Target</span>
					<span>Updated</span>
				</div>
				{mutations.map((mutation) => (
					<div className="cv5-table-row" key={mutation.id}>
						<span>{mutation.type}</span>
						<span>{mutation.status}</span>
						<span>{mutation.target.canvasCourseId}</span>
						<span>{mutation.error ?? mutation.updatedAt}</span>
					</div>
				))}
				{mutations.length === 0 ? (
					<div className="cv5-empty">No queued mutations.</div>
				) : null}
			</div>
		</section>
	);
}
