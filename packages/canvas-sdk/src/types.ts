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
		icon?: string | null;
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

export interface CanvasExternalToolTagAttributes {
	url?: string;
	new_tab?: boolean;
	resource_link_id?: string;
	[key: string]: unknown;
}

export interface CanvasLockInfo {
	asset_string?: string;
	unlock_at?: string | null;
	lock_at?: string | null;
	context_module?: unknown;
	manually_locked?: boolean;
	[key: string]: unknown;
}

export interface CanvasAssignmentDate {
	id?: number;
	base?: boolean;
	title?: string;
	due_at?: string | null;
	unlock_at?: string | null;
	lock_at?: string | null;
	[key: string]: unknown;
}

export interface CanvasTurnitinSettings {
	originality_report_visibility?: string;
	s_paper_check?: boolean;
	internet_check?: boolean;
	journal_check?: boolean;
	exclude_biblio?: boolean;
	exclude_quoted?: boolean;
	exclude_small_matches_type?: string | null;
	exclude_small_matches_value?: number | null;
	[key: string]: unknown;
}

export interface CanvasNeedsGradingCount {
	section_id: string;
	needs_grading_count: number;
	[key: string]: unknown;
}

export interface CanvasScoreStatistic {
	min?: number;
	max?: number;
	mean?: number;
	upper_q?: number;
	median?: number;
	lower_q?: number;
	[key: string]: unknown;
}

export interface CanvasBasicUser {
	id: number | string;
	name?: string;
	[key: string]: unknown;
}

export interface CanvasAssignmentOverride {
	id: number;
	assignment_id?: number;
	quiz_id?: number;
	context_module_id?: number;
	discussion_topic_id?: number;
	wiki_page_id?: number;
	attachment_id?: number;
	student_ids?: number[];
	group_id?: number;
	course_section_id?: number;
	title?: string;
	due_at?: string | null;
	all_day?: boolean;
	all_day_date?: string | null;
	unlock_at?: string | null;
	lock_at?: string | null;
	[key: string]: unknown;
}

export interface CanvasAssignment extends Record<string, unknown> {
	id: number;
	course_id: number;
	name: string;
	description?: string | null;
	created_at?: string;
	updated_at?: string;
	due_at?: string | null;
	lock_at?: string | null;
	unlock_at?: string | null;
	has_overrides?: boolean;
	all_dates?: CanvasAssignmentDate[] | null;
	html_url?: string;
	submissions_download_url?: string;
	assignment_group_id?: number;
	due_date_required?: boolean;
	allowed_extensions?: string[];
	max_name_length?: number;
	turnitin_enabled?: boolean;
	vericite_enabled?: boolean;
	turnitin_settings?: CanvasTurnitinSettings | null;
	grade_group_students_individually?: boolean;
	external_tool_tag_attributes?: CanvasExternalToolTagAttributes | null;
	peer_reviews?: boolean;
	automatic_peer_reviews?: boolean;
	peer_review_count?: number;
	peer_reviews_assign_at?: string | null;
	intra_group_peer_reviews?: boolean;
	group_category_id?: number | null;
	needs_grading_count?: number;
	needs_grading_count_by_section?: CanvasNeedsGradingCount[];
	position?: number;
	post_to_sis?: boolean;
	integration_id?: string | null;
	integration_data?: Record<string, unknown> | null;
	points_possible?: number | null;
	submission_types?: string[];
	has_submitted_submissions?: boolean;
	grading_type?: string;
	grading_standard_id?: number | null;
	published?: boolean;
	unpublishable?: boolean;
	only_visible_to_overrides?: boolean;
	locked_for_user?: boolean;
	lock_info?: CanvasLockInfo | null;
	lock_explanation?: string;
	quiz_id?: number;
	anonymous_submissions?: boolean;
	discussion_topic?: unknown;
	freeze_on_copy?: boolean;
	frozen?: boolean;
	frozen_attributes?: string[];
	submission?: unknown;
	use_rubric_for_grading?: boolean;
	rubric_settings?: Record<string, unknown>;
	rubric?: unknown;
	assignment_visibility?: number[];
	overrides?: CanvasAssignmentOverride[] | null;
	omit_from_final_grade?: boolean;
	hide_in_gradebook?: boolean;
	moderated_grading?: boolean;
	grader_count?: number;
	final_grader_id?: number;
	grader_comments_visible_to_graders?: boolean;
	graders_anonymous_to_graders?: boolean;
	grader_names_visible_to_final_grader?: boolean;
	anonymous_grading?: boolean;
	allowed_attempts?: number;
	post_manually?: boolean;
	score_statistics?: CanvasScoreStatistic | null;
	can_submit?: boolean;
	ab_guid?: string[];
	annotatable_attachment_id?: number | null;
	anonymize_students?: boolean;
	require_lockdown_browser?: boolean;
	important_dates?: boolean;
	muted?: boolean;
	anonymous_peer_reviews?: boolean;
	anonymous_instructor_annotations?: boolean;
	graded_submissions_exist?: boolean;
	is_quiz_assignment?: boolean;
	in_closed_grading_period?: boolean;
	can_duplicate?: boolean;
	original_course_id?: number;
	original_assignment_id?: number;
	original_lti_resource_link_id?: number | string;
	original_assignment_name?: string;
	original_quiz_id?: number;
	workflow_state?: string;
	observed_users?: CanvasBasicUser[];
	peer_review?: unknown;
	asset_processors?: unknown[];
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
	icon?: string | null;
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
