import {
	applyDocumentTheme,
	applyHostFonts,
	applyHostStyleVariables,
	type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
	type CSSProperties,
	StrictMode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";

interface Assignment {
	id: number;
	name: string;
	account: { id: string; label: string };
	course: { id: number; name: string; code: string | null };
	dueAt: string | null;
	dueAtDisplay: string | null;
	pointsPossible: number | null;
	htmlUrl: string | null;
	submission: {
		workflowState: "unsubmitted" | "submitted" | "graded";
		missing: boolean;
		late: boolean;
		excused: boolean;
	};
}

interface AccountHealth {
	account: { id: string; label: string };
	status?: string;
	freshness?: { dataObservedAt?: string | null };
}

interface UpcomingOutput {
	ok: boolean;
	assignments: Assignment[];
	accounts?: AccountHealth[];
	pageInfo: { hasMore: boolean; nextCursor: string | null };
	view?: {
		timezone: string;
		filters: Record<string, unknown>;
	};
}

const previewOutput: UpcomingOutput = {
	ok: true,
	assignments: [
		{
			id: 1,
			name: "Practice 1.6 – Kinematics",
			account: { id: "preview", label: "University" },
			course: { id: 101, name: "Engineering Fundamentals", code: "EF 151" },
			dueAt: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
			dueAtDisplay: "In 2 hours",
			pointsPossible: 10,
			htmlUrl: "https://canvas.example.edu/courses/101/assignments/1",
			submission: {
				workflowState: "unsubmitted",
				missing: false,
				late: false,
				excused: false,
			},
		},
		{
			id: 2,
			name: "Paper Prep: Topic Selection",
			account: { id: "preview", label: "University" },
			course: { id: 102, name: "English Composition", code: "ENGL 101" },
			dueAt: new Date(Date.now() + 1000 * 60 * 60 * 20).toISOString(),
			dueAtDisplay: "Tomorrow",
			pointsPossible: 20,
			htmlUrl: "https://canvas.example.edu/courses/102/assignments/2",
			submission: {
				workflowState: "unsubmitted",
				missing: false,
				late: false,
				excused: false,
			},
		},
	],
	accounts: [
		{
			account: { id: "preview", label: "University" },
			status: "ready",
			freshness: { dataObservedAt: new Date().toISOString() },
		},
	],
	pageInfo: { hasMore: false, nextCursor: null },
	view: { timezone: "America/New_York", filters: {} },
};

function getOutput(result: CallToolResult | null): UpcomingOutput | null {
	return getStructuredOutput(result?.structuredContent);
}

function getStructuredOutput(output: unknown): UpcomingOutput | null {
	if (
		!output ||
		typeof output !== "object" ||
		!("assignments" in output) ||
		!Array.isArray(output.assignments)
	)
		return null;
	return output as unknown as UpcomingOutput;
}

type ChatGptBridge = {
	maxHeight?: number;
	toolOutput?: unknown;
};

const WIDGET_HEIGHT = 600;

function getChatGptOutput(): UpcomingOutput | null {
	const openai = (window as Window & { openai?: ChatGptBridge }).openai;
	return getStructuredOutput(openai?.toolOutput);
}

function getChatGptMaxHeight(): number | undefined {
	const openai = (window as Window & { openai?: ChatGptBridge }).openai;
	return typeof openai?.maxHeight === "number" && openai.maxHeight > 0
		? openai.maxHeight
		: undefined;
}

function getHostMaxHeight(context: McpUiHostContext | undefined) {
	const dimensions = context?.containerDimensions;
	return dimensions && "maxHeight" in dimensions
		? dimensions.maxHeight
		: undefined;
}

function CanvasAssignmentsApp() {
	const standalone = window.parent === window;
	const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
	const [chatGptOutput, setChatGptOutput] = useState(getChatGptOutput);
	const [chatGptMaxHeight, setChatGptMaxHeight] = useState(getChatGptMaxHeight);
	const [hostContext, setHostContext] = useState<McpUiHostContext>();

	const { app, error } = useApp({
		appInfo: { name: "Canvas V5 assignments", version: "0.1.0" },
		capabilities: {},
		onAppCreated: (createdApp) => {
			createdApp.ontoolresult = setToolResult;
			createdApp.onhostcontextchanged = (context) => {
				setHostContext((current) => ({ ...current, ...context }));
				if (context.theme) applyDocumentTheme(context.theme);
				if (context.styles?.variables) {
					applyHostStyleVariables(context.styles.variables);
				}
				if (context.styles?.css?.fonts)
					applyHostFonts(context.styles.css.fonts);
			};
			createdApp.onerror = console.error;
			createdApp.onteardown = async () => ({});
		},
	});

	useEffect(() => {
		if (standalone) return;
		const updateGlobals = () => {
			setChatGptOutput(getChatGptOutput());
			setChatGptMaxHeight(getChatGptMaxHeight());
		};
		updateGlobals();
		window.addEventListener("openai:set_globals", updateGlobals);
		return () =>
			window.removeEventListener("openai:set_globals", updateGlobals);
	}, [standalone]);

	useEffect(() => {
		if (!standalone) return;
		const previewTheme = new URLSearchParams(window.location.search).get(
			"theme",
		);
		if (previewTheme === "dark" || previewTheme === "light") {
			applyDocumentTheme(previewTheme);
		}
	}, [standalone]);

	useEffect(() => {
		if (!app) return;
		const context = app.getHostContext();
		setHostContext(context);
		if (context?.theme) applyDocumentTheme(context.theme);
		if (context?.styles?.variables) {
			applyHostStyleVariables(context.styles.variables);
		}
		if (context?.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
	}, [app]);

	if (standalone) {
		return <AssignmentsView output={previewOutput} />;
	}
	if (error)
		return (
			<StateMessage title="Canvas V5 could not connect" body={error.message} />
		);
	if (!app)
		return (
			<StateMessage
				title="Connecting to Canvas V5"
				body="Preparing your assignments…"
			/>
		);

	const safeTopInset = hostContext?.safeAreaInsets?.top ?? 0;
	const widgetHeight = Math.max(
		0,
		Math.min(
			WIDGET_HEIGHT,
			getHostMaxHeight(hostContext) ?? Number.POSITIVE_INFINITY,
			chatGptMaxHeight ?? Number.POSITIVE_INFINITY,
		) - safeTopInset,
	);

	return (
		<div
			style={
				{
					"--canvas-widget-height": `${widgetHeight}px`,
					"--canvas-widget-safe-bottom": `${hostContext?.safeAreaInsets?.bottom ?? 0}px`,
					paddingTop: safeTopInset,
					paddingRight: hostContext?.safeAreaInsets?.right,
					paddingLeft: hostContext?.safeAreaInsets?.left,
				} as CSSProperties
			}
		>
			<AssignmentsView
				output={getOutput(toolResult) ?? chatGptOutput}
				app={app}
			/>
		</div>
	);
}

function AssignmentsView({
	output,
	app,
}: {
	output: UpcomingOutput | null;
	app?: NonNullable<ReturnType<typeof useApp>["app"]>;
}) {
	const [current, setCurrent] = useState(output);
	const [busy, setBusy] = useState<"refresh" | "more" | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => setCurrent(output), [output]);

	const grouped = useMemo(
		() =>
			groupAssignments(
				current?.assignments ?? [],
				current?.view?.timezone ?? "UTC",
			),
		[current],
	);
	const staleAccounts =
		current?.accounts?.filter(
			(account) => account.status && account.status !== "ready",
		) ?? [];

	const runList = useCallback(
		async (options: {
			refresh?: boolean;
			cursor?: string | null;
			append?: boolean;
		}) => {
			if (!app || !current) return;
			setBusy(options.append ? "more" : "refresh");
			setError(null);
			try {
				const result = await app.callServerTool({
					name: "canvas_list_upcoming_assignments",
					arguments: {
						...current.view?.filters,
						timezone: current.view?.timezone ?? "UTC",
						refresh: options.refresh ?? false,
						cursor: options.cursor ?? undefined,
					},
				});
				const next = getOutput(result);
				if (!next) throw new Error("Canvas returned an unexpected response.");
				setCurrent(
					options.append
						? {
								...next,
								assignments: [...current.assignments, ...next.assignments],
							}
						: next,
				);
			} catch (caught) {
				setError(
					caught instanceof Error
						? caught.message
						: "Canvas data is unavailable.",
				);
			} finally {
				setBusy(null);
			}
		},
		[app, current],
	);

	if (!current) {
		return (
			<StateMessage
				title="Loading assignments"
				body="Canvas V5 is preparing your upcoming work…"
			/>
		);
	}

	return (
		<main className="shell">
			<header className="header">
				<div>
					<h1>Upcoming assignments</h1>
					<p className="summary">
						{current.assignments.length === 0
							? "Nothing due in this window"
							: `${current.assignments.length} assignment${current.assignments.length === 1 ? "" : "s"} to focus on`}
					</p>
				</div>
				<button
					className="iconButton"
					type="button"
					disabled={!app || busy !== null}
					onClick={() => runList({ refresh: true })}
					aria-label="Refresh Canvas assignments"
					title="Refresh Canvas assignments"
				>
					<span className={busy === "refresh" ? "spin" : ""}>↻</span>
				</button>
			</header>

			{staleAccounts.length > 0 ? (
				<div className="notice" role="status">
					<strong>Some Canvas data may be stale.</strong>
					<span>
						{staleAccounts.map((account) => account.account.label).join(", ")}
					</span>
				</div>
			) : null}

			{error ? (
				<div className="error" role="alert">
					{error}
				</div>
			) : null}

			<section
				className="scrollRegion"
				aria-label="Upcoming assignment list"
				tabIndex={grouped.length > 0 ? 0 : undefined}
			>
				{grouped.length === 0 ? (
					<div className="empty">
						<div className="emptyMark">✓</div>
						<h2>You’re clear for now</h2>
						<p>Ask for a wider date range if you want to look further ahead.</p>
					</div>
				) : (
					<div className="groups">
						{grouped.map(([label, assignments]) => (
							<section className="group" key={label}>
								<h2>{label}</h2>
								<div className="assignmentList">
									{assignments.map((assignment) => (
										<AssignmentRow
											assignment={assignment}
											app={app}
											key={`${assignment.account.id}:${assignment.course.id}:${assignment.id}`}
										/>
									))}
								</div>
							</section>
						))}
					</div>
				)}

				{current.pageInfo.hasMore ? (
					<button
						className="secondaryButton"
						type="button"
						disabled={!app || busy !== null}
						onClick={() =>
							runList({ cursor: current.pageInfo.nextCursor, append: true })
						}
					>
						{busy === "more" ? "Loading…" : "Show more"}
					</button>
				) : null}
			</section>
		</main>
	);
}

function AssignmentRow({
	assignment,
	app,
}: {
	assignment: Assignment;
	app?: NonNullable<ReturnType<typeof useApp>["app"]>;
}) {
	const openAssignment = async () => {
		if (!assignment.htmlUrl) return;
		if (app) {
			await app.openLink({ url: assignment.htmlUrl });
			return;
		}
		window.open(assignment.htmlUrl, "_blank", "noopener,noreferrer");
	};

	return (
		<button
			className="assignment"
			type="button"
			disabled={!assignment.htmlUrl}
			onClick={openAssignment}
		>
			<span className="assignmentBody">
				<span className="assignmentName">{assignment.name}</span>
				<span className="metadata">
					<span>{assignment.course.code ?? assignment.course.name}</span>
					{assignment.pointsPossible !== null ? (
						<span>{assignment.pointsPossible} pts</span>
					) : null}
					{assignment.submission.missing ? (
						<span className="danger">Missing</span>
					) : null}
					{assignment.submission.late ? (
						<span className="warning">Late</span>
					) : null}
				</span>
			</span>
			<span className="due">{assignment.dueAtDisplay ?? "No due date"}</span>
			<span className="chevron" aria-hidden="true">
				›
			</span>
		</button>
	);
}

function StateMessage({ title, body }: { title: string; body: string }) {
	return (
		<main className="shell state">
			<div className="pulse" />
			<h1>{title}</h1>
			<p>{body}</p>
		</main>
	);
}

function groupAssignments(assignments: Assignment[], timezone: string) {
	const groups = new Map<string, Assignment[]>();
	for (const assignment of assignments) {
		const label = dayLabel(assignment.dueAt, timezone);
		groups.set(label, [...(groups.get(label) ?? []), assignment]);
	}
	return [...groups.entries()];
}

function dayLabel(value: string | null, timezone: string) {
	if (!value) return "No due date";
	const due = new Date(value);
	const today = new Date();
	const tomorrow = new Date(today);
	tomorrow.setDate(today.getDate() + 1);
	const dayKey = (date: Date) =>
		new Intl.DateTimeFormat("en-CA", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(date);
	if (dayKey(due) === dayKey(today)) return "Today";
	if (dayKey(due) === dayKey(tomorrow)) return "Tomorrow";
	return new Intl.DateTimeFormat(undefined, {
		timeZone: timezone,
		weekday: "long",
		month: "short",
		day: "numeric",
	}).format(due);
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Canvas V5 widget root is missing.");

createRoot(rootElement).render(
	<StrictMode>
		<CanvasAssignmentsApp />
	</StrictMode>,
);
