import {
	useActiveAccount,
	useCanvasAccountSwitcher,
	useCanvasRuntime,
	useCanvasSnapshot,
	useCourses,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

export const Route = createFileRoute("/dev")({
	component: DevRoute,
});

function DevRoute() {
	const runtime = useCanvasRuntime();
	const snapshot = useCanvasSnapshot();
	const activeAccount = useActiveAccount();
	const { switchAccount } = useCanvasAccountSwitcher();
	const syncStatus = useSyncStatus();
	const courses = useCourses();
	const [label, setLabel] = useState("");
	const [canvasBaseUrl, setCanvasBaseUrl] = useState(
		activeAccount?.canvasBaseUrl ?? "",
	);
	const [canvasUserId, setCanvasUserId] = useState(
		activeAccount?.canvasUserId ?? "",
	);
	const [authMode, setAuthMode] = useState<
		"canvas-session" | "api-token" | "oauth"
	>(activeAccount?.authMode ?? "canvas-session");
	const [accessToken, setAccessToken] = useState("");
	const [switchError, setSwitchError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<
		| { type: "idle" }
		| { type: "success"; message: string }
		| { type: "error"; message: string }
	>({ type: "idle" });

	async function handleConnectionSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaveStatus({ type: "idle" });
		try {
			const connection = await runtime.saveCanvasConnection({
				label: label.trim(),
				canvasBaseUrl: canvasBaseUrl.trim(),
				canvasUserId: canvasUserId.trim() || undefined,
				authMode,
				accessToken: accessToken.trim() || undefined,
				isActive: true,
			});
			setSaveStatus({
				type: "success",
				message: `Saved ${connection.label}.`,
			});
			setAccessToken("");
		} catch (error) {
			setSaveStatus({
				type: "error",
				message:
					error instanceof Error
						? error.message
						: "Unable to save Canvas connection.",
			});
		}
	}

	return (
		<div className="cv5-dev-grid">
			<section className="cv5-panel">
				<div className="cv5-panel-heading">
					<div>
						<p className="cv5-eyebrow">Canvas connection setup</p>
						<h2>Connection</h2>
					</div>
					<button
						className="cv5-small-button"
						type="button"
						onClick={() =>
							void Promise.all([
								runtime.refreshAppAuth(),
								runtime.syncConnections(),
							])
						}
					>
						Refresh
					</button>
				</div>
				<div className="cv5-kv">
					<span>Canvas auth</span>
					<strong>{snapshot.canvasAuth.status}</strong>
					<span>App auth</span>
					<strong>{snapshot.appAuth.status}</strong>
					<span>Active connection</span>
					<strong>{activeAccount?.connectionId ?? "none"}</strong>
					<span>Canvas URL</span>
					<strong>{activeAccount?.canvasBaseUrl ?? "none"}</strong>
				</div>
				{snapshot.appAuth.status !== "authenticated" ? (
					<div className="cv5-inline-actions">
						<button
							className="cv5-small-button"
							type="button"
							onClick={() => void runtime.openAppLogin()}
						>
							Sign in
						</button>
						<button
							className="cv5-small-button"
							type="button"
							onClick={() => void runtime.refreshAppAuth()}
						>
							Refresh auth
						</button>
					</div>
				) : null}
				<div className="cv5-compact-list">
					{snapshot.accounts.map((account) => (
						<div
							className="cv5-compact-row cv5-compact-row-action"
							key={account.connectionId}
						>
							<span>{account.isActive ? "●" : "○"}</span>
							<strong>{account.label}</strong>
							<small>{account.authMode}</small>
							<button
								className="cv5-small-button"
								disabled={account.isActive}
								type="button"
								onClick={() => {
									setSwitchError(null);
									void switchAccount(account.connectionId, {
										onError: (error) => setSwitchError(error.message),
									});
								}}
							>
								{account.isActive ? "Using" : "Use"}
							</button>
						</div>
					))}
					{snapshot.accounts.length === 0 ? (
						<div className="cv5-empty">
							No Canvas connections are saved yet.
						</div>
					) : null}
				</div>
				{switchError ? (
					<div className="cv5-form-status cv5-form-status-error">
						{switchError}
					</div>
				) : null}
			</section>

			<section className="cv5-panel">
				<div className="cv5-panel-heading">
					<div>
						<p className="cv5-eyebrow">App-owned connection</p>
						<h2>Add connection</h2>
					</div>
				</div>
				<form className="cv5-form" onSubmit={handleConnectionSubmit}>
					<label>
						<span>Label</span>
						<input
							value={label}
							onChange={(event) => setLabel(event.currentTarget.value)}
							placeholder="Knox Canvas"
							required
						/>
					</label>
					<label>
						<span>Canvas base URL</span>
						<input
							value={canvasBaseUrl}
							onChange={(event) => setCanvasBaseUrl(event.currentTarget.value)}
							placeholder="https://knoxschools.instructure.com"
							required
							type="url"
						/>
					</label>
					<label>
						<span>Auth mode</span>
						<select
							value={authMode}
							onChange={(event) =>
								setAuthMode(
									event.currentTarget.value as
										| "canvas-session"
										| "api-token"
										| "oauth",
								)
							}
						>
							<option value="canvas-session">Canvas session</option>
							<option value="api-token">API token</option>
							<option value="oauth">OAuth token</option>
						</select>
					</label>
					<label>
						<span>Canvas user ID</span>
						<input
							value={canvasUserId}
							onChange={(event) => setCanvasUserId(event.currentTarget.value)}
							placeholder="optional"
						/>
					</label>
					{authMode !== "canvas-session" ? (
						<label>
							<span>Access token</span>
							<input
								value={accessToken}
								onChange={(event) => setAccessToken(event.currentTarget.value)}
								placeholder="Stored encrypted on the app server"
								required
								type="password"
							/>
						</label>
					) : null}
					<div className="cv5-inline-actions">
						<button
							className="cv5-small-button"
							disabled={snapshot.appAuth.status !== "authenticated"}
							type="submit"
						>
							Save connection
						</button>
						{saveStatus.type !== "idle" ? (
							<span
								className={`cv5-form-status cv5-form-status-${saveStatus.type}`}
							>
								{saveStatus.message}
							</span>
						) : null}
					</div>
				</form>
			</section>

			<section className="cv5-panel">
				<div className="cv5-panel-heading">
					<div>
						<p className="cv5-eyebrow">Local-first cache</p>
						<h2>Synced classes</h2>
					</div>
					<button
						className="cv5-small-button"
						type="button"
						onClick={() => void runtime.syncCourses()}
					>
						Sync
					</button>
				</div>
				<div className="cv5-compact-list">
					{courses.map((course) => (
						<div key={course.id} className="cv5-compact-row">
							<span>{course.app?.icon ?? "□"}</span>
							<strong>{course.name}</strong>
							<small>{course.workflow_state ?? "unknown"}</small>
						</div>
					))}
					{courses.length === 0 ? (
						<div className="cv5-empty">No classes have been synced yet.</div>
					) : null}
				</div>
			</section>

			<section className="cv5-panel cv5-dev-wide">
				<div className="cv5-panel-heading">
					<div>
						<p className="cv5-eyebrow">Background jobs</p>
						<h2>Sync status</h2>
					</div>
				</div>
				<div className="cv5-table">
					<div className="cv5-table-row cv5-table-head">
						<span>Scope</span>
						<span>Status</span>
						<span>Pending</span>
						<span>Last result</span>
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
			</section>
		</div>
	);
}
