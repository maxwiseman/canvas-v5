import { useCanvasRuntime, useCanvasSnapshot } from "@canvas-v5/canvas-sdk";
import { Link, Outlet } from "@tanstack/react-router";
import { Activity, Database, ListTodo, RefreshCw, Wrench } from "lucide-react";

const navItems = [
	{ to: "/dev", label: "Devtools", icon: Wrench },
	{ to: "/", label: "Courses", icon: ListTodo },
	{ to: "/dev/sync", label: "Sync", icon: Activity },
	{ to: "/dev/mutations", label: "Mutations", icon: Database },
] as const;

export function CanvasDevtoolsRoot() {
	const runtime = useCanvasRuntime();
	const snapshot = useCanvasSnapshot();

	return (
		<div className="cv5-shell">
			<aside className="cv5-sidebar">
				<div>
					<p className="cv5-eyebrow">Canvas V5</p>
					<h1>SDK Devtools</h1>
				</div>
				<nav className="cv5-nav">
					{navItems.map(({ to, label, icon: Icon }) => (
						<Link key={to} to={to as never} className="cv5-nav-link">
							<Icon size={16} />
							<span>{label}</span>
						</Link>
					))}
				</nav>
				<SidebarAuthStatus
					appStatus={snapshot.appAuth}
					canvasStatus={snapshot.canvasAuth}
					courseCount={snapshot.courses.length}
					onSignIn={() => void runtime.openAppLogin()}
					onRefreshAuth={() => void runtime.refreshAppAuth()}
				/>
				<button
					className="cv5-refresh"
					type="button"
					onClick={() =>
						void Promise.all([runtime.syncConnections(), runtime.syncCourses()])
					}
				>
					<RefreshCw size={14} />
					Sync now
				</button>
			</aside>
			<main className="cv5-main">
				<Outlet />
			</main>
		</div>
	);
}

type AppStatus = ReturnType<typeof useCanvasSnapshot>["appAuth"];
type CanvasStatus = ReturnType<typeof useCanvasSnapshot>["canvasAuth"];

function SidebarAuthStatus({
	appStatus,
	canvasStatus,
	courseCount,
	onSignIn,
	onRefreshAuth,
}: {
	appStatus: AppStatus;
	canvasStatus: CanvasStatus;
	courseCount: number;
	onSignIn: () => void;
	onRefreshAuth: () => void;
}) {
	const appLabel =
		appStatus.status === "authenticated"
			? (appStatus.user.name ?? appStatus.user.email ?? "Signed in")
			: appStatus.status;
	const canvasLabel =
		canvasStatus.status === "authenticated"
			? (canvasStatus.user.name ?? canvasStatus.baseUrl)
			: canvasStatus.status;

	return (
		<div className="cv5-sidebar-status">
			<div>
				<span>App</span>
				<strong>{appLabel}</strong>
				{appStatus.status !== "authenticated" ? (
					<div className="cv5-sidebar-action-row">
						<button
							className="cv5-sidebar-action"
							type="button"
							onClick={onSignIn}
						>
							Sign in
						</button>
						<button
							className="cv5-sidebar-action"
							type="button"
							onClick={onRefreshAuth}
						>
							Refresh
						</button>
					</div>
				) : null}
			</div>
			<div>
				<span>Canvas</span>
				<strong>{canvasLabel}</strong>
			</div>
			<div>
				<span>Synced classes</span>
				<strong>{courseCount}</strong>
			</div>
		</div>
	);
}
