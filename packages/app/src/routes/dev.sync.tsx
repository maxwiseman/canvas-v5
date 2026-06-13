import { useCanvasSnapshot, useSyncStatus } from "@canvas-v5/canvas-sdk";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dev/sync")({
	component: SyncRoute,
});

function SyncRoute() {
	const syncStatus = useSyncStatus();
	const snapshot = useCanvasSnapshot();

	return (
		<section className="cv5-panel">
			<div className="cv5-panel-heading">
				<div>
					<p className="cv5-eyebrow">Freshness and cache visibility</p>
					<h2>Sync inspector</h2>
				</div>
			</div>
			<div className="cv5-table">
				<div className="cv5-table-row cv5-table-head">
					<span>Scope</span>
					<span>Status</span>
					<span>Pending</span>
					<span>Last synced</span>
				</div>
				{syncStatus.map((scope) => (
					<div className="cv5-table-row" key={scope.scope}>
						<span>{scope.scope}</span>
						<span>{scope.status}</span>
						<span>{scope.pendingJobs}</span>
						<span>{scope.error ?? scope.lastSyncedAt ?? "never"}</span>
					</div>
				))}
			</div>
			<pre>{JSON.stringify(snapshot.activeAccount, null, 2)}</pre>
		</section>
	);
}
