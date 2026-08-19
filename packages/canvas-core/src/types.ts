export type CanvasCredentialKind = "browser-session" | "api-token" | "oauth";

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

export interface NormalizedCanvasAssignment
	extends CanvasRecordMetadata,
		Record<string, unknown> {
	id: number;
	course_id: number;
	name: string;
	description?: string | null;
	created_at?: string;
	updated_at?: string;
	due_at?: string | null;
	lock_at?: string | null;
	unlock_at?: string | null;
}

export type CanvasSyncScope = "courses" | "assignments";

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
