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

export interface CanvasAccount {
	id: string;
	label: string;
	connectionId: string;
	canvasIdentityId?: string;
	canvasBaseUrl: string;
	authMode: "canvas-session" | "api-token" | "oauth";
	canvasUserId?: string;
	canvasUserName?: string;
	canvasAvatarUrl?: string;
	isActive: boolean;
}

export interface CanvasConnectionInput {
	label: string;
	canvasBaseUrl: string;
	authMode: "canvas-session" | "api-token" | "oauth";
	canvasUserId?: string;
	canvasUserName?: string;
	canvasAvatarUrl?: string;
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
	default_view?: CanvasCourseDefaultView;
	syllabus_body?: string | null;
	workflow_state?: string;
	start_at?: string | null;
	end_at?: string | null;
	enrollment_term_id?: number;
	app?: {
		icon?: string | null;
	};
}

export type CanvasCourseDefaultView =
	| "feed"
	| "wiki"
	| "modules"
	| "assignments"
	| "syllabus";

export interface CanvasPage extends Record<string, unknown> {
	id?: string;
	course_id?: number;
	page_id: number;
	url: string;
	title: string;
	body?: string | null;
	published?: boolean;
	front_page?: boolean;
	locked_for_user?: boolean;
	lock_explanation?: string;
}

export interface CanvasActivityItem extends Record<string, unknown> {
	id: number;
	title: string;
	message?: string;
	type?: string;
	created_at?: string;
	updated_at?: string;
	html_url?: string;
	read_state?: boolean;
}

export interface CanvasCourseHome {
	id: number;
	course_id: number;
	front_page?: CanvasPage;
	activity_stream?: CanvasActivityItem[];
}

export interface CanvasEnrollment {
	id: number;
	course_id: number;
	user_id: number;
	type?: string;
	role?: string;
	enrollment_state?: string;
}

export interface CanvasCourseUser {
	id: string;
	canvas_user_id: number | string;
	course_id: number;
	name: string;
	short_name?: string;
	sortable_name?: string;
	avatar_url?: string;
}

export interface CanvasExternalToolTagAttributes {
	url?: string;
	new_tab?: boolean;
	resource_link_id?: string;
	[key: string]: unknown;
}

export interface CanvasExternalToolLaunch {
	id?: string;
	name?: string;
	url: string;
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
	submission?: Partial<CanvasSubmission> | null;
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
	items_count?: number;
	items?: CanvasModuleItem[];
}

export interface CanvasModuleItem extends Record<string, unknown> {
	id: number;
	module_id: number;
	position?: number;
	title: string;
	indent?: number;
	type: string;
	content_id?: number;
	page_url?: string;
	html_url?: string;
	external_url?: string;
	new_tab?: boolean;
	published?: boolean;
}

export interface CanvasAnnouncement {
	id: number;
	course_id: number;
	title: string;
	message?: string;
	posted_at?: string;
	delayed_post_at?: string | null;
	read_state?: "read" | "unread";
	unread_count?: number;
	author?: CanvasBasicUser;
	html_url?: string;
}

export interface CanvasSubmission {
	id: string | number;
	assignment_id: number;
	course_id: number;
	user_id?: number;
	workflow_state?: string;
	submitted_at?: string | null;
	score?: number | null;
	grade?: string | null;
	attempt?: number | null;
	body?: string | null;
	url?: string | null;
	submission_type?: string | null;
	late?: boolean;
	missing?: boolean;
	excused?: boolean;
	attachments?: CanvasFile[];
	submission_comments?: CanvasSubmissionComment[];
	submission_history?: CanvasSubmission[];
	rubric_assessment?: Record<string, unknown>;
}

export interface CanvasCalendarItem {
	id: string;
	title: string;
	start_at?: string | null;
	end_at?: string | null;
	context_code?: string;
	html_url?: string;
}

export interface CanvasSubmissionComment {
	id: number;
	author_id?: number;
	author_name?: string;
	comment?: string;
	created_at?: string;
	attachments?: CanvasFile[];
}

export interface CanvasSubmissionInput {
	type: "online_text_entry" | "online_url";
	text?: string;
	url?: string;
}

export interface CanvasQuiz extends Record<string, unknown> {
	id: number;
	course_id: number;
	title: string;
	description?: string | null;
	quiz_type?: string;
	due_at?: string | null;
	lock_at?: string | null;
	unlock_at?: string | null;
	points_possible?: number | null;
	question_count?: number;
	time_limit?: number | null;
	allowed_attempts?: number;
	workflow_state?: string;
	locked_for_user?: boolean;
	lock_explanation?: string;
	html_url?: string;
}

export interface CanvasDiscussionTopic extends Record<string, unknown> {
	id: number;
	course_id: number;
	title: string;
	message?: string | null;
	posted_at?: string | null;
	last_reply_at?: string | null;
	discussion_type?: string;
	unread_count?: number;
	read_state?: "read" | "unread";
	subscribed?: boolean;
	locked_for_user?: boolean;
	author?: CanvasBasicUser & { avatar_image_url?: string };
	html_url?: string;
}

export interface CanvasDiscussionEntry extends Record<string, unknown> {
	id: number;
	topic_id: number;
	course_id: number;
	user_id?: number;
	user_name?: string;
	message?: string;
	created_at?: string;
	updated_at?: string;
	read_state?: "read" | "unread";
	rating_count?: number;
	rating_sum?: number;
	replies?: CanvasDiscussionEntry[];
}

export interface CanvasFile extends Record<string, unknown> {
	id: number;
	course_id: number;
	display_name: string;
	filename?: string;
	content_type?: string;
	size?: number;
	url?: string;
	public_url?: string;
	preview_url?: string;
	canvadoc_url?: string;
	provisional_canvadoc_url?: string | null;
	enhanced_preview_url?: string;
	thumbnail_url?: string;
	created_at?: string;
	updated_at?: string;
	locked_for_user?: boolean;
	lock_explanation?: string;
}

export interface CanvasCourseTab extends Record<string, unknown> {
	id: string;
	canvas_tab_id?: string;
	course_id: number;
	label?: string | null;
	position?: number;
	hidden?: boolean;
	visibility?: string;
	type?: string;
	html_url?: string;
}

export interface CanvasPlannerItem extends Record<string, unknown> {
	id: string;
	course_id?: number;
	context_type?: string;
	context_name?: string;
	plannable_id: string | number;
	plannable_type: string;
	plannable_date?: string;
	plannable?: Record<string, unknown> & {
		title?: string;
		name?: string;
		due_at?: string | null;
		todo_date?: string | null;
		details?: string | null;
	};
	planner_override?: {
		id?: number;
		marked_complete?: boolean;
		dismissed?: boolean;
	} | null;
	submissions?:
		| false
		| {
				excused?: boolean;
				graded?: boolean;
				late?: boolean;
				missing?: boolean;
				needs_grading?: boolean;
				with_feedback?: boolean;
		  };
	html_url?: string;
}

export interface CanvasConversation extends Record<string, unknown> {
	id: string;
	subject?: string;
	workflow_state?: "read" | "unread" | "archived";
	last_message?: string;
	last_message_at?: string;
	message_count?: number;
	starred?: boolean;
	avatar_url?: string;
	context_name?: string;
	participants?: Array<CanvasBasicUser & { full_name?: string }>;
	messages?: CanvasConversationMessage[];
}

export interface CanvasConversationMessage extends Record<string, unknown> {
	id: string | number;
	author_id?: number | string;
	created_at?: string;
	body?: string;
	generated?: boolean;
	attachments?: CanvasFile[];
}

export interface CanvasCommunicationChannel extends Record<string, unknown> {
	id: number;
	address: string;
	type: string;
	position?: number;
	workflow_state?: string;
}

export interface CanvasNotificationPreference extends Record<string, unknown> {
	id: string;
	channel_id: number;
	href?: string;
	notification: string;
	category: string;
	frequency: "immediately" | "daily" | "weekly" | "never";
}

export interface CourseOverlay {
	id: string;
	canvasConnectionId: string;
	canvasCourseId: number;
	icon?: string | null;
	hiddenTabIds?: string[];
	updatedAt: string;
}

export interface AssignmentComment {
	id: string;
	canvasDomain: string;
	canvasCourseId: number;
	canvasAssignmentId: number;
	content: string;
	author: {
		canvasIdentityId: string;
		canvasUserId: string;
		displayName: string;
		avatarUrl?: string | null;
	};
	createdAt: string;
	updatedAt: string;
}

export type SyncScope =
	| "accounts"
	| "courses"
	| "enrollments"
	| "people"
	| "assignments"
	| "modules"
	| "course-home"
	| "announcements"
	| "pages"
	| "quizzes"
	| "discussions"
	| "discussion-entries"
	| "files"
	| "course-tabs"
	| "submissions"
	| "calendar"
	| "planner"
	| "conversations"
	| "notifications"
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
	people: CanvasCourseUser[];
	assignments: CanvasAssignment[];
	modules: CanvasModule[];
	courseHomes: CanvasCourseHome[];
	announcements: CanvasAnnouncement[];
	pages: CanvasPage[];
	quizzes: CanvasQuiz[];
	discussions: CanvasDiscussionTopic[];
	discussionEntries: CanvasDiscussionEntry[];
	files: CanvasFile[];
	courseTabs: CanvasCourseTab[];
	submissions: CanvasSubmission[];
	calendarItems: CanvasCalendarItem[];
	plannerItems: CanvasPlannerItem[];
	conversations: CanvasConversation[];
	communicationChannels: CanvasCommunicationChannel[];
	notificationPreferences: CanvasNotificationPreference[];
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
	signOutApp(): Promise<void>;
	listConnections(): Promise<CanvasAccount[]>;
	ensureConnection(connection: CanvasAccount): Promise<CanvasAccount>;
	createConnection(input: CanvasConnectionInput): Promise<CanvasAccount>;
	listCourseOverlays(): Promise<CourseOverlay[]>;
	updateCourseOverlay(input: {
		canvasConnectionId: string;
		canvasCourseId: number;
		icon?: string | null;
		hiddenTabIds?: string[];
	}): Promise<CourseOverlay>;
	listAssignmentComments(input: {
		canvasDomain: string;
		canvasCourseId: number;
		canvasAssignmentId: number;
	}): Promise<AssignmentComment[]>;
	createAssignmentComment(input: {
		canvasUserId: string;
		canvasDomain: string;
		canvasCourseId: number;
		canvasAssignmentId: number;
		content: string;
	}): Promise<AssignmentComment>;
}
