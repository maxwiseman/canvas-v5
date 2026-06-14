export type CanvasRuntimeMode = "extension" | "web" | "mock";

export type CanvasAuthState =
	| { status: "checking" }
	| { status: "authenticated"; user: CanvasUser; baseUrl: string }
	| { status: "unauthenticated"; reason: string }
	| { status: "error"; reason: string };

export type AppAuthState =
	| { status: "checking" }
	| { status: "authenticated"; user: AppUser }
	| { status: "unauthenticated"; reason: string }
	| { status: "error"; reason: string };

export interface AppUser {
	id: string;
	name?: string | null;
	email?: string | null;
}

export interface CanvasUser {
	id: number | string;
	name?: string;
	short_name?: string;
	sortable_name?: string;
	avatar_url?: string;
}

export type IconId =
	| "atom"
	| "flask"
	| "microscope"
	| "book"
	| "bookmark"
	| "notebook"
	| "star"
	| "paintbrush"
	| "palette"
	| "brain"
	| "brain-circuit"
	| "calculator"
	| "diff"
	| "divide"
	| "pi"
	| "radical"
	| "cone"
	| "code"
	| "binary"
	| "government"
	| "gavel"
	| "earth";

export interface CanvasAccount {
	id: string;
	label: string;
	connectionId: string;
	canvasBaseUrl: string;
	authMode: "canvas-session" | "api-token" | "oauth";
	canvasUserId?: string;
	isActive: boolean;
}

export interface CanvasConnectionInput {
	label: string;
	canvasBaseUrl: string;
	authMode: "canvas-session" | "api-token" | "oauth";
	canvasUserId?: string;
	accessToken?: string;
	isActive?: boolean;
}

export interface SwitchCanvasAccountOptions {
	onError?: (error: Error) => void;
}

export interface CanvasCourse {
	id: number;
	name: string;
	course_code?: string;
	workflow_state?: string;
	start_at?: string | null;
	end_at?: string | null;
	enrollment_term_id?: number;
	app?: {
		icon?: IconId | null;
	};
}

export interface CanvasEnrollment {
	id: number;
	course_id: number;
	user_id: number;
	type?: string;
	role?: string;
	enrollment_state?: string;
}

export interface CanvasAssignment {
	id: number;
	course_id: number;
	name: string;
	due_at?: string | null;
	html_url?: string;
	points_possible?: number | null;
	workflow_state?: string;
}

export interface CanvasModule {
	id: number;
	course_id: number;
	name: string;
	position?: number;
	workflow_state?: string;
}

export interface CanvasAnnouncement {
	id: number;
	course_id: number;
	title: string;
	message?: string;
	posted_at?: string;
	html_url?: string;
}

export interface CanvasSubmission {
	id?: number;
	assignment_id: number;
	course_id: number;
	user_id?: number;
	workflow_state?: string;
	submitted_at?: string | null;
	score?: number | null;
	grade?: string | null;
}

export interface CanvasCalendarItem {
	id: string;
	title: string;
	start_at?: string | null;
	end_at?: string | null;
	context_code?: string;
	html_url?: string;
}

export interface CourseOverlay {
	id: string;
	canvasConnectionId: string;
	canvasCourseId: number;
	icon?: IconId | null;
	updatedAt: string;
}

export type SyncScope =
	| "accounts"
	| "courses"
	| "enrollments"
	| "assignments"
	| "modules"
	| "announcements"
	| "submissions"
	| "calendar"
	| "course-overlays";

export interface SyncScopeState {
	scope: SyncScope;
	status: "idle" | "syncing" | "stale" | "error";
	lastSyncedAt?: string;
	error?: string;
	pendingJobs: number;
}

export interface QueuedMutation {
	id: string;
	type: "course-overlay.update";
	status: "queued" | "flushing" | "acked" | "error";
	target: {
		canvasConnectionId: string;
		canvasCourseId: number;
	};
	payload: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
	error?: string;
}

export interface CanvasRuntimeSnapshot {
	mode: CanvasRuntimeMode;
	canvasAuth: CanvasAuthState;
	appAuth: AppAuthState;
	activeAccount?: CanvasAccount;
	accounts: CanvasAccount[];
	courses: CanvasCourse[];
	enrollments: CanvasEnrollment[];
	assignments: CanvasAssignment[];
	modules: CanvasModule[];
	announcements: CanvasAnnouncement[];
	submissions: CanvasSubmission[];
	calendarItems: CanvasCalendarItem[];
	courseOverlays: CourseOverlay[];
	syncScopes: SyncScopeState[];
	mutationQueue: QueuedMutation[];
}

export interface CanvasRequestOptions {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	body?: unknown;
	signal?: AbortSignal;
}

export interface CanvasTransport {
	readonly mode: CanvasRuntimeMode;
	setActiveAccount?(account?: CanvasAccount): void;
	probeAuth(): Promise<CanvasAuthState>;
	request<T>(path: string, options?: CanvasRequestOptions): Promise<T>;
	paginatedRequest<T>(
		path: string,
		options?: CanvasRequestOptions,
	): Promise<T[]>;
}

export interface OverlayTransport {
	probeAuth(): Promise<AppAuthState>;
	listConnections(): Promise<CanvasAccount[]>;
	ensureConnection(connection: CanvasAccount): Promise<CanvasAccount>;
	createConnection(input: CanvasConnectionInput): Promise<CanvasAccount>;
	listCourseOverlays(): Promise<CourseOverlay[]>;
	updateCourseOverlay(input: {
		canvasConnectionId: string;
		canvasCourseId: number;
		icon?: string | null;
	}): Promise<CourseOverlay>;
}
