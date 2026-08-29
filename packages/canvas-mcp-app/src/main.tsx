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

interface CalendarEventItem {
	id: string;
	title: string;
	startAt: string | null;
	endAt: string | null;
	allDay: boolean;
	allDayDate: string | null;
	contextCode: string | null;
	contextName: string;
	htmlUrl: string | null;
	account: { id: string; label: string };
	course: { id: number; name: string; code: string | null } | null;
}

interface UpcomingOutput {
	ok: boolean;
	assignments: Assignment[];
	events?: CalendarEventItem[];
	accounts?: AccountHealth[];
	pageInfo: { hasMore: boolean; nextCursor: string | null };
	view?: {
		kind?: string;
		timezone: string;
		filters: Record<string, unknown>;
		start?: string;
		end?: string;
	};
}

interface CourseSummary {
	id: number;
	name: string;
	code: string | null;
}

interface AssignmentDetailOutput {
	ok: boolean;
	course: CourseSummary;
	assignment: {
		id: number;
		name: string;
		description: string | null;
		dueAt: string | null;
		unlockAt: string | null;
		lockAt: string | null;
		htmlUrl: string | null;
		pointsPossible: number | null;
		published: boolean;
		lockedForUser: boolean;
		canSubmit: boolean;
		submissionTypes: string[];
		allowedAttempts: number | null;
		submission: {
			workflow_state?: string;
			submitted_at?: string | null;
			missing?: boolean;
			late?: boolean;
			excused?: boolean;
			grade?: string | null;
			score?: number | null;
		} | null;
	};
}

interface ResourceDetailOutput {
	ok: boolean;
	course: CourseSummary;
	page?: {
		pageUrl: string;
		title: string;
		body: string | null;
		htmlUrl: string | null;
		updatedAt: string | null;
	};
	resource?: {
		id: string;
		type: string;
		title: string;
		body: string | null;
		htmlUrl: string | null;
		updatedAt: string | null;
		metadata: Record<string, unknown>;
	};
}

type WidgetOutput =
	| UpcomingOutput
	| AssignmentDetailOutput
	| ResourceDetailOutput;

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

const assignmentPreviewOutput: AssignmentDetailOutput = {
	ok: true,
	course: { id: 101, name: "Engineering Fundamentals", code: "EF 151" },
	assignment: {
		id: 1,
		name: "Practice 1.6 – Kinematics",
		description:
			"<p>Complete the kinematics practice set and show your work for each problem.</p><h2>Before you submit</h2><ul><li>Check units.</li><li>Upload one PDF.</li></ul>",
		dueAt: new Date(Date.now() + 1000 * 60 * 60 * 20).toISOString(),
		unlockAt: null,
		lockAt: null,
		htmlUrl: "https://canvas.example.edu/courses/101/assignments/1",
		pointsPossible: 10,
		published: true,
		lockedForUser: false,
		canSubmit: true,
		submissionTypes: ["online_upload"],
		allowedAttempts: 3,
		submission: { workflow_state: "unsubmitted", missing: false, late: false },
	},
};

const resourcePreviewOutput: ResourceDetailOutput = {
	ok: true,
	course: { id: 102, name: "English Composition", code: "ENGL 101" },
	resource: {
		id: "research-guide",
		type: "page",
		title: "Research Paper Guide",
		body: "<p>This guide collects the requirements, recommended databases, and citation examples for your research paper.</p><h2>Requirements</h2><p>Use at least four scholarly sources.</p>",
		htmlUrl: "https://canvas.example.edu/courses/102/pages/research-guide",
		updatedAt: new Date().toISOString(),
		metadata: { published: true, front_page: false },
	},
};

const calendarPreviewOutput: UpcomingOutput = {
	...previewOutput,
	assignments: [
		...previewOutput.assignments,
		{
			id: 3,
			name: "Lab reflection",
			account: { id: "preview", label: "University" },
			course: {
				id: 101,
				name: "Engineering Fundamentals",
				code: "EF 151",
			},
			dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString(),
			dueAtDisplay: "In 5 days",
			pointsPossible: 5,
			htmlUrl: "https://canvas.example.edu/courses/101/assignments/3",
			submission: {
				workflowState: "unsubmitted",
				missing: false,
				late: false,
				excused: false,
			},
		},
	],
	events: [
		{
			id: "event-1",
			title: "Engineering advising",
			startAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString(),
			endAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2.04).toISOString(),
			allDay: false,
			allDayDate: null,
			contextCode: "course_101",
			contextName: "Engineering Fundamentals",
			htmlUrl: "https://canvas.example.edu/calendar",
			account: { id: "preview", label: "University" },
			course: { id: 101, name: "Engineering Fundamentals", code: "EF 151" },
		},
	],
	view: {
		kind: "calendar",
		timezone: "America/New_York",
		filters: {},
		start: new Date(
			Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
		).toISOString(),
		end: new Date(
			Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
		).toISOString(),
	},
};

function getOutput(result: CallToolResult | null): WidgetOutput | null {
	return getStructuredOutput(result?.structuredContent);
}

function getStructuredOutput(output: unknown): WidgetOutput | null {
	if (!output || typeof output !== "object") return null;
	if (
		("assignments" in output && Array.isArray(output.assignments)) ||
		"assignment" in output ||
		"resource" in output ||
		"page" in output
	) {
		return output as WidgetOutput;
	}
	return null;
}

type ChatGptBridge = {
	maxHeight?: number;
	toolOutput?: unknown;
};

const WIDGET_HEIGHT = 600;

function getChatGptOutput(): WidgetOutput | null {
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
		const preview = new URLSearchParams(window.location.search).get("view");
		const output =
			preview === "assignment"
				? assignmentPreviewOutput
				: preview === "resource"
					? resourcePreviewOutput
					: preview === "calendar"
						? calendarPreviewOutput
						: previewOutput;
		return <WidgetView output={output} />;
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
			<WidgetView output={getOutput(toolResult) ?? chatGptOutput} app={app} />
		</div>
	);
}

type WidgetApp = NonNullable<ReturnType<typeof useApp>["app"]>;

function WidgetView({
	output,
	app,
}: {
	output: WidgetOutput | null;
	app?: WidgetApp;
}) {
	if (output && "assignment" in output) {
		return <AssignmentDetailView output={output} app={app} />;
	}
	if (output && ("resource" in output || "page" in output)) {
		return <ResourceDetailView output={output} app={app} />;
	}
	if (output && "assignments" in output && output.view?.kind === "calendar") {
		return <CalendarView output={output} app={app} />;
	}
	return (
		<AssignmentsView
			output={output && "assignments" in output ? output : null}
			app={app}
		/>
	);
}

function AssignmentsView({
	output,
	app,
}: {
	output: UpcomingOutput | null;
	app?: WidgetApp;
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
				if (!next || !("assignments" in next)) {
					throw new Error("Canvas returned an unexpected response.");
				}
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
	app?: WidgetApp;
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

function AssignmentDetailView({
	output,
	app,
}: {
	output: AssignmentDetailOutput;
	app?: WidgetApp;
}) {
	const { assignment, course } = output;
	const description = useMemo(
		() => readableCanvasText(assignment.description),
		[assignment.description],
	);
	const state = assignment.submission?.workflow_state ?? "unsubmitted";
	return (
		<main className="shell detailShell">
			<header className="detailHeader">
				<div className="eyebrow">{course.code ?? course.name} · Assignment</div>
				<h1>{assignment.name}</h1>
				<div className="chipRow">
					<StatusChip
						label={submissionLabel(state)}
						tone={state === "graded" ? "success" : "neutral"}
					/>
					{assignment.submission?.missing ? (
						<StatusChip label="Missing" tone="danger" />
					) : null}
					{assignment.submission?.late ? (
						<StatusChip label="Late" tone="warning" />
					) : null}
				</div>
			</header>
			<section className="factGrid" aria-label="Assignment details">
				<DetailFact label="Due" value={formatDateTime(assignment.dueAt)} />
				<DetailFact
					label="Points"
					value={
						assignment.pointsPossible === null
							? "—"
							: String(assignment.pointsPossible)
					}
				/>
				<DetailFact
					label="Attempts"
					value={formatAttempts(assignment.allowedAttempts)}
				/>
				<DetailFact
					label="Submit"
					value={formatSubmissionTypes(assignment.submissionTypes)}
				/>
			</section>
			<section
				className="scrollRegion detailScroll"
				aria-label="Assignment content"
			>
				<h2 className="sectionTitle">Details</h2>
				{description ? (
					<div className="canvasText">{description}</div>
				) : (
					<p className="muted">No assignment description was provided.</p>
				)}
				{assignment.lockedForUser ? (
					<div className="notice">
						<strong>This assignment is locked in Canvas.</strong>
					</div>
				) : null}
				<OpenCanvasButton
					url={assignment.htmlUrl}
					app={app}
					label={assignment.canSubmit ? "Open assignment" : "View in Canvas"}
				/>
			</section>
		</main>
	);
}

function ResourceDetailView({
	output,
	app,
}: {
	output: ResourceDetailOutput;
	app?: WidgetApp;
}) {
	const item =
		output.resource ??
		(output.page
			? {
					id: output.page.pageUrl,
					type: "page",
					title: output.page.title,
					body: output.page.body,
					htmlUrl: output.page.htmlUrl,
					updatedAt: output.page.updatedAt,
					metadata: {},
				}
			: null);
	if (!item)
		return (
			<StateMessage
				title="Resource unavailable"
				body="Canvas did not return a previewable resource."
			/>
		);
	const body = readableCanvasText(item.body);
	const metadata = resourceMetadata(item.metadata);
	return (
		<main className="shell detailShell">
			<header className="detailHeader">
				<div className="eyebrow">
					{output.course.code ?? output.course.name} ·{" "}
					{resourceLabel(item.type)}
				</div>
				<h1>{item.title}</h1>
				{item.updatedAt ? (
					<p className="summary">Updated {formatDateTime(item.updatedAt)}</p>
				) : null}
			</header>
			<section
				className="scrollRegion detailScroll"
				aria-label="Course resource content"
			>
				{metadata.length > 0 ? (
					<div className="chipRow">
						{metadata.map((value) => (
							<StatusChip key={value} label={value} tone="neutral" />
						))}
					</div>
				) : null}
				{body ? (
					<div className="canvasText">{body}</div>
				) : (
					<div className="empty compactEmpty">
						<div className="emptyMark">{item.type === "file" ? "↗" : "·"}</div>
						<h2>{item.type === "file" ? "File preview" : "No preview text"}</h2>
						<p>Open this resource in Canvas for the full content.</p>
					</div>
				)}
				<OpenCanvasButton url={item.htmlUrl} app={app} label="Open in Canvas" />
			</section>
		</main>
	);
}

function CalendarView({
	output,
	app,
}: {
	output: UpcomingOutput;
	app?: WidgetApp;
}) {
	const timezone = output.view?.timezone ?? "UTC";
	const start = output.view?.start ?? new Date().toISOString();
	const end =
		output.view?.end ?? new Date(Date.now() + 31 * 86400000).toISOString();
	const days = useMemo(() => calendarDays(start, end), [start, end]);
	const itemsByDay = useMemo(() => {
		const grouped = new Map<string, CalendarDisplayItem[]>();
		for (const assignment of output.assignments) {
			if (!assignment.dueAt) continue;
			const key = dateKey(new Date(assignment.dueAt), timezone);
			grouped.set(key, [
				...(grouped.get(key) ?? []),
				{ kind: "assignment", assignment },
			]);
		}
		for (const event of output.events ?? []) {
			const startsAt = event.allDayDate ?? event.startAt;
			if (!startsAt) continue;
			const key = event.allDayDate
				? event.allDayDate.slice(0, 10)
				: dateKey(new Date(startsAt), timezone);
			grouped.set(key, [...(grouped.get(key) ?? []), { kind: "event", event }]);
		}
		return grouped;
	}, [output.assignments, output.events, timezone]);
	const today = dateKey(new Date(), timezone);
	const initialDay = days.includes(today)
		? today
		: ([...itemsByDay.keys()][0] ?? days[0] ?? today);
	const [selectedDay, setSelectedDay] = useState(initialDay);
	const selectedItems = itemsByDay.get(selectedDay) ?? [];
	const itemCount = output.assignments.length + (output.events?.length ?? 0);
	return (
		<main className="shell calendarShell">
			<header className="header calendarHeader">
				<div>
					<div className="eyebrow">Canvas calendar</div>
					<h1>{formatMonth(start, timezone)}</h1>
					<p className="summary">
						Events and due dates · {itemCount} item
						{itemCount === 1 ? "" : "s"}
					</p>
				</div>
			</header>
			<section
				className="scrollRegion calendarScroll"
				aria-label="Calendar and selected day agenda"
			>
				<div className="weekdayRow" aria-hidden="true">
					{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
						<span key={day}>{day}</span>
					))}
				</div>
				<div
					className="monthGrid"
					style={{ "--leading-days": firstWeekday(days[0]) } as CSSProperties}
				>
					{days.map((day, index) => {
						const items = itemsByDay.get(day) ?? [];
						return (
							<button
								key={day}
								type="button"
								className={`calendarDay${selectedDay === day ? "selected" : ""}${day === today ? "today" : ""}${index === 0 ? "firstDay" : ""}`}
								onClick={() => setSelectedDay(day)}
								aria-label={`${formatDayHeading(day, timezone)}, ${items.length} items`}
							>
								<span>{Number(day.slice(-2))}</span>
								{items.length > 0 ? (
									<span className="eventDots">
										{items.slice(0, 3).map((item) => (
											<i key={calendarItemKey(item)} />
										))}
									</span>
								) : null}
							</button>
						);
					})}
				</div>
				<div className="agenda">
					<h2 className="sectionTitle">
						{formatDayHeading(selectedDay, timezone)}
					</h2>
					{selectedItems.length === 0 ? (
						<p className="muted">No events or due dates.</p>
					) : (
						<div className="assignmentList">
							{selectedItems.map((item) =>
								item.kind === "assignment" ? (
									<AssignmentRow
										key={calendarItemKey(item)}
										assignment={item.assignment}
										app={app}
									/>
								) : (
									<CalendarEventRow
										key={calendarItemKey(item)}
										event={item.event}
										app={app}
									/>
								),
							)}
						</div>
					)}
				</div>
			</section>
		</main>
	);
}

type CalendarDisplayItem =
	| { kind: "assignment"; assignment: Assignment }
	| { kind: "event"; event: CalendarEventItem };

function calendarItemKey(item: CalendarDisplayItem) {
	return item.kind === "assignment"
		? `assignment:${item.assignment.account.id}:${item.assignment.course.id}:${item.assignment.id}`
		: `event:${item.event.account.id}:${item.event.id}`;
}

function CalendarEventRow({
	event,
	app,
}: {
	event: CalendarEventItem;
	app?: WidgetApp;
}) {
	const openEvent = async () => {
		if (!event.htmlUrl) return;
		if (app) await app.openLink({ url: event.htmlUrl });
		else window.open(event.htmlUrl, "_blank", "noopener,noreferrer");
	};
	return (
		<button
			className="assignment"
			type="button"
			disabled={!event.htmlUrl}
			onClick={openEvent}
		>
			<span className="assignmentBody">
				<span className="assignmentName">{event.title}</span>
				<span className="metadata">
					<span>{event.course?.code ?? event.contextName}</span>
					<span>Event</span>
				</span>
			</span>
			<span className="due">
				{event.allDay ? "All day" : formatTime(event.startAt)}
			</span>
			<span className="chevron" aria-hidden="true">
				›
			</span>
		</button>
	);
}

function StatusChip({
	label,
	tone,
}: {
	label: string;
	tone: "neutral" | "success" | "warning" | "danger";
}) {
	return <span className={`statusChip ${tone}`}>{label}</span>;
}

function DetailFact({ label, value }: { label: string; value: string }) {
	return (
		<div className="detailFact">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function OpenCanvasButton({
	url,
	app,
	label,
}: {
	url: string | null;
	app?: WidgetApp;
	label: string;
}) {
	if (!url) return null;
	return (
		<button
			className="primaryButton"
			type="button"
			onClick={async () => {
				if (app) await app.openLink({ url });
				else window.open(url, "_blank", "noopener,noreferrer");
			}}
		>
			{label}
			<span aria-hidden="true">↗</span>
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

function readableCanvasText(value: string | null) {
	if (!value) return "";
	const document = new DOMParser().parseFromString(value, "text/html");
	for (const element of document.querySelectorAll(
		"script, style, iframe, object, embed",
	))
		element.remove();
	for (const element of document.querySelectorAll(
		"br, p, div, li, h1, h2, h3, h4, blockquote",
	))
		element.append("\n");
	return (document.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

function submissionLabel(value: string) {
	if (value === "graded") return "Graded";
	if (value === "submitted") return "Submitted";
	return "Not submitted";
}

function formatDateTime(value: string | null) {
	if (!value) return "No date";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "No date";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year:
			date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

function formatTime(value: string | null) {
	if (!value) return "";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "";
	return new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

function formatAttempts(value: number | null) {
	if (value === null || value < 0) return "Unlimited";
	return String(value);
}

function formatSubmissionTypes(types: string[]) {
	if (types.length === 0) return "Not specified";
	return types
		.map((type) => type.replace(/^online_/, "").replaceAll("_", " "))
		.join(", ");
}

function resourceLabel(type: string) {
	return type === "discussion-entry"
		? "Discussion post"
		: `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

function resourceMetadata(metadata: Record<string, unknown>) {
	const values: string[] = [];
	if (metadata.published === true) values.push("Published");
	if (metadata.front_page === true) values.push("Front page");
	if (typeof metadata.question_count === "number")
		values.push(`${metadata.question_count} questions`);
	if (typeof metadata.points_possible === "number")
		values.push(`${metadata.points_possible} pts`);
	if (typeof metadata.content_type === "string")
		values.push(metadata.content_type);
	if (typeof metadata.size === "number")
		values.push(formatFileSize(metadata.size));
	return values;
}

function formatFileSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function dateKey(date: Date, timezone: string) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const value = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";
	return `${value("year")}-${value("month")}-${value("day")}`;
}

function calendarDays(start: string, end: string) {
	const days: string[] = [];
	const cursor = new Date(start);
	const limit = new Date(end);
	while (cursor < limit && days.length < 42) {
		days.push(cursor.toISOString().slice(0, 10));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return days;
}

function firstWeekday(day: string | undefined) {
	if (!day) return 0;
	return new Date(`${day}T12:00:00Z`).getUTCDay();
}

function formatMonth(value: string, timezone: string) {
	const middleOfMonth = new Date(`${value.slice(0, 7)}-15T12:00:00Z`);
	return new Intl.DateTimeFormat(undefined, {
		timeZone: timezone,
		month: "long",
		year: "numeric",
	}).format(middleOfMonth);
}

function formatDayHeading(value: string, timezone: string) {
	return new Intl.DateTimeFormat(undefined, {
		timeZone: timezone,
		weekday: "long",
		month: "long",
		day: "numeric",
	}).format(new Date(`${value}T12:00:00Z`));
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Canvas V5 widget root is missing.");

createRoot(rootElement).render(
	<StrictMode>
		<CanvasAssignmentsApp />
	</StrictMode>,
);
