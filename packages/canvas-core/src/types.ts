export type CanvasCredentialKind = "browser-session" | "api-token" | "oauth";

export type IconId =
	| "atom"
	| "activity"
	| "apple"
	| "badge-dollar-sign"
	| "flask"
	| "microscope"
	| "book"
	| "bookmark"
	| "notebook"
	| "star"
	| "graduation-cap"
	| "school"
	| "library"
	| "paintbrush"
	| "palette"
	| "music"
	| "drama"
	| "camera"
	| "film"
	| "clapperboard"
	| "megaphone"
	| "brain"
	| "brain-circuit"
	| "calculator"
	| "diff"
	| "divide"
	| "pi"
	| "radical"
	| "cone"
	| "sigma"
	| "ruler"
	| "drafting-compass"
	| "code"
	| "binary"
	| "cpu"
	| "circuit-board"
	| "database"
	| "bot"
	| "cog"
	| "wrench"
	| "hammer"
	| "hard-hat"
	| "government"
	| "gavel"
	| "earth"
	| "dna"
	| "telescope"
	| "orbit"
	| "leaf"
	| "bug"
	| "mountain"
	| "waves"
	| "languages"
	| "feather"
	| "scroll"
	| "map"
	| "compass"
	| "scale"
	| "users"
	| "briefcase"
	| "chart-column"
	| "heart-handshake"
	| "heart-pulse"
	| "stethoscope"
	| "dumbbell"
	| "chef-hat"
	| "tractor"
	| "plane"
	| "radio-tower";

export interface CanvasAccountRef {
	id: string;
	baseUrl: string;
	canvasUserId?: string;
}

export interface CanvasSourceRequestOptions {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	body?: unknown;
	signal?: AbortSignal;
}

export interface CanvasDataSource {
	request<T>(path: string, options?: CanvasSourceRequestOptions): Promise<T>;
	paginatedRequest<T>(
		path: string,
		options?: CanvasSourceRequestOptions,
	): Promise<T[]>;
}

export interface CanvasRecordMetadata {
	canvasAccountId: string;
	observedAt: string;
	contentHash: string;
}

export interface NormalizedCanvasCourse extends CanvasRecordMetadata {
	id: number;
	name: string;
	course_code?: string;
	default_view?: "feed" | "wiki" | "modules" | "assignments" | "syllabus";
	syllabus_body?: string | null;
	workflow_state?: string;
	start_at?: string | null;
	end_at?: string | null;
	enrollment_term_id?: number;
}

export interface NormalizedCanvasAssignment extends CanvasRecordMetadata {
	id: number;
	course_id: number;
	name: string;
	description?: string | null;
	created_at?: string;
	updated_at?: string;
	due_at?: string | null;
	lock_at?: string | null;
	unlock_at?: string | null;
	html_url?: string;
	points_possible?: number | null;
	published?: boolean;
	workflow_state?: string;
	omit_from_final_grade?: boolean;
	submission_types?: string[];
	allowed_extensions?: string[];
	allowed_attempts?: number;
	due_date_required?: boolean;
	only_visible_to_overrides?: boolean;
	locked_for_user?: boolean;
	can_submit?: boolean;
	has_overrides?: boolean;
	all_dates?: Array<{
		id?: number;
		base?: boolean;
		title?: string;
		due_at?: string | null;
		unlock_at?: string | null;
		lock_at?: string | null;
	}> | null;
	rubric_settings?: Record<string, unknown>;
	rubric?: unknown;
	submission?: NormalizedCanvasSubmission | null;
}

export interface NormalizedCanvasSubmission {
	workflow_state?: string;
	submitted_at?: string | null;
	missing?: boolean;
	late?: boolean;
	excused?: boolean;
	graded?: boolean;
	score?: number | null;
	grade?: string | null;
}

export type CanvasResourceType =
	| "announcement"
	| "page"
	| "quiz"
	| "discussion"
	| "discussion-entry"
	| "file";

export interface NormalizedCanvasResource extends CanvasRecordMetadata {
	id: string;
	course_id: number;
	resourceType: CanvasResourceType;
	canvasResourceId: string;
	title: string;
	body?: string | null;
	html_url?: string;
	updated_at?: string | null;
	metadata?: Record<string, unknown>;
}

export interface NormalizedCanvasCalendarEvent extends CanvasRecordMetadata {
	id: string;
	title: string;
	start_at?: string | null;
	end_at?: string | null;
	all_day?: boolean;
	all_day_date?: string | null;
	context_code?: string;
	context_name?: string;
	html_url?: string;
}

export type CanvasSyncScope =
	| "courses"
	| "assignments"
	| "resources"
	| "calendar";

export interface CanvasSyncBatch<T extends CanvasRecordMetadata> {
	account: CanvasAccountRef;
	scope: CanvasSyncScope;
	scopeKey?: string;
	generationId: string;
	observedAt: string;
	records: T[];
}

export interface CanvasSyncResult {
	scope: CanvasSyncScope;
	scopeKey?: string;
	generationId: string;
	observedAt: string;
	recordCount: number;
}

export interface CanvasSyncRepository {
	applySnapshot<T extends CanvasRecordMetadata>(
		batch: CanvasSyncBatch<T>,
	): Promise<CanvasSyncResult>;
}
