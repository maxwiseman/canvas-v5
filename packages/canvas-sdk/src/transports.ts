import type {
	AppAuthState,
	CanvasAccount,
	CanvasAuthState,
	CanvasConnectionInput,
	CanvasRequestOptions,
	CanvasRuntimeMode,
	CanvasTransport,
	CourseOverlay,
	OverlayTransport,
} from "./types";

export class CanvasRestTransport implements CanvasTransport {
	readonly mode: CanvasRuntimeMode;

	constructor(
		private readonly options: {
			mode: CanvasRuntimeMode;
			baseUrl: string;
			accessToken?: string;
			credentials?: RequestCredentials;
		},
	) {
		this.mode = options.mode;
	}

	async probeAuth(): Promise<CanvasAuthState> {
		try {
			const user = await this.request<Record<string, unknown>>(
				"/api/v1/users/self/profile",
			);
			return {
				status: "authenticated",
				baseUrl: this.options.baseUrl,
				user: {
					id: String(user.id),
					name: typeof user.name === "string" ? user.name : undefined,
					short_name:
						typeof user.short_name === "string" ? user.short_name : undefined,
					sortable_name:
						typeof user.sortable_name === "string"
							? user.sortable_name
							: undefined,
					avatar_url:
						typeof user.avatar_url === "string" ? user.avatar_url : undefined,
				},
			};
		} catch (error) {
			return {
				status: "unauthenticated",
				reason:
					error instanceof Error
						? error.message
						: "Unable to authenticate with Canvas.",
			};
		}
	}

	async request<T>(
		path: string,
		requestOptions: CanvasRequestOptions = {},
	): Promise<T> {
		const headers = new Headers();
		headers.set("Accept", "application/json");
		if (requestOptions.body !== undefined) {
			headers.set("Content-Type", "application/json");
		}
		if (this.options.accessToken) {
			headers.set("Authorization", `Bearer ${this.options.accessToken}`);
		}

		const response = await fetch(new URL(path, this.options.baseUrl), {
			method: requestOptions.method ?? "GET",
			headers,
			body:
				requestOptions.body === undefined
					? undefined
					: JSON.stringify(requestOptions.body),
			credentials: this.options.credentials ?? "include",
			signal: requestOptions.signal,
		});

		if (!response.ok) {
			throw new Error(`Canvas request failed (${response.status}) for ${path}`);
		}

		return (await response.json()) as T;
	}

	async paginatedRequest<T>(
		path: string,
		requestOptions: CanvasRequestOptions = {},
	): Promise<T[]> {
		const records: T[] = [];
		let nextPath: string | undefined = path;

		while (nextPath) {
			const response = await this.rawRequest(nextPath, requestOptions);
			const page = (await response.json()) as T[];
			records.push(...page);
			nextPath = parseNextLink(response.headers.get("Link"));
		}

		return records;
	}

	private async rawRequest(path: string, requestOptions: CanvasRequestOptions) {
		const headers = new Headers();
		headers.set("Accept", "application/json");
		if (this.options.accessToken) {
			headers.set("Authorization", `Bearer ${this.options.accessToken}`);
		}
		const response = await fetch(new URL(path, this.options.baseUrl), {
			method: requestOptions.method ?? "GET",
			headers,
			credentials: this.options.credentials ?? "include",
			signal: requestOptions.signal,
		});
		if (!response.ok) {
			throw new Error(`Canvas request failed (${response.status}) for ${path}`);
		}
		return response;
	}
}

export class MockCanvasTransport implements CanvasTransport {
	readonly mode: CanvasRuntimeMode = "mock";

	async probeAuth(): Promise<CanvasAuthState> {
		return {
			status: "authenticated",
			baseUrl: "https://canvas.example.edu",
			user: { id: "mock-user", name: "Mock Canvas User" },
		};
	}

	async request<T>(path: string): Promise<T> {
		if (path.includes("/users/self/profile")) {
			return { id: "mock-user", name: "Mock Canvas User" } as T;
		}
		return [] as T;
	}

	async paginatedRequest<T>(path: string): Promise<T[]> {
		if (path.includes("/courses")) {
			return [
				{
					id: 101,
					name: "Biology",
					course_code: "BIO-101",
					workflow_state: "available",
				},
				{
					id: 204,
					name: "World History",
					course_code: "HIST-204",
					workflow_state: "available",
				},
			] as T[];
		}
		return [];
	}
}

export class WebCanvasProxyTransport implements CanvasTransport {
	readonly mode: CanvasRuntimeMode = "web";
	private activeAccount?: CanvasAccount;

	constructor(private readonly baseUrl = "") {}

	setActiveAccount(account?: CanvasAccount) {
		this.activeAccount = account;
	}

	async probeAuth(): Promise<CanvasAuthState> {
		if (!this.activeAccount) {
			return {
				status: "unauthenticated",
				reason: "No Canvas connection selected.",
			};
		}
		return {
			status: "authenticated",
			baseUrl: this.activeAccount.canvasBaseUrl,
			user: {
				id: this.activeAccount.canvasUserId ?? this.activeAccount.connectionId,
				name: this.activeAccount.label,
			},
		};
	}

	async request<T>(
		path: string,
		requestOptions: CanvasRequestOptions = {},
	): Promise<T> {
		const response = await this.proxyRequest<T>(path, requestOptions, false);
		return response;
	}

	async paginatedRequest<T>(
		path: string,
		requestOptions: CanvasRequestOptions = {},
	): Promise<T[]> {
		return this.proxyRequest<T[]>(path, requestOptions, true);
	}

	private async proxyRequest<T>(
		path: string,
		requestOptions: CanvasRequestOptions,
		paginated: boolean,
	) {
		if (!this.activeAccount) {
			throw new Error("No Canvas connection selected.");
		}
		const url = new URL("/api/canvas/request", this.baseUrl);
		url.searchParams.set("connectionId", this.activeAccount.connectionId);
		url.searchParams.set("path", path);
		if (paginated) {
			url.searchParams.set("paginated", "true");
		}
		const response = await fetch(url, {
			method: requestOptions.method ?? "GET",
			credentials: "include",
			headers:
				requestOptions.body === undefined
					? { Accept: "application/json" }
					: {
							Accept: "application/json",
							"Content-Type": "application/json",
						},
			body:
				requestOptions.body === undefined
					? undefined
					: JSON.stringify(requestOptions.body),
			signal: requestOptions.signal,
		});
		if (!response.ok) {
			throw new Error(`Canvas proxy request failed (${response.status})`);
		}
		return (await response.json()) as T;
	}
}

export class HttpOverlayTransport implements OverlayTransport {
	constructor(private readonly baseUrl = "") {}

	async probeAuth(): Promise<AppAuthState> {
		try {
			const response = await fetch(
				new URL("/api/auth/get-session", this.baseUrl),
				{
					credentials: "include",
				},
			);
			if (!response.ok) {
				return { status: "unauthenticated", reason: "No app session." };
			}
			const session = (await response.json()) as {
				user?: { id: string; name?: string; email?: string };
			};
			if (!session.user) {
				return { status: "unauthenticated", reason: "No app session." };
			}
			return { status: "authenticated", user: session.user };
		} catch (error) {
			return {
				status: "error",
				reason:
					error instanceof Error ? error.message : "Unable to check app auth.",
			};
		}
	}

	async listConnections(): Promise<CanvasAccount[]> {
		const response = await fetch(
			new URL("/api/canvas/connections", this.baseUrl),
			{
				credentials: "include",
			},
		);
		if (!response.ok) {
			return [];
		}
		return (await response.json()) as CanvasAccount[];
	}

	async ensureConnection(connection: CanvasAccount): Promise<CanvasAccount> {
		const response = await fetch(
			new URL("/api/canvas/connections", this.baseUrl),
			{
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(connection),
			},
		);
		if (!response.ok) {
			throw new Error(`Connection update failed (${response.status})`);
		}
		return (await response.json()) as CanvasAccount;
	}

	async createConnection(input: CanvasConnectionInput): Promise<CanvasAccount> {
		const response = await fetch(
			new URL("/api/canvas/connections", this.baseUrl),
			{
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			},
		);
		if (!response.ok) {
			throw new Error(`Connection create failed (${response.status})`);
		}
		return (await response.json()) as CanvasAccount;
	}

	async listCourseOverlays(): Promise<CourseOverlay[]> {
		const response = await fetch(
			new URL("/api/canvas/course-overlays", this.baseUrl),
			{
				credentials: "include",
			},
		);
		if (!response.ok) {
			return [];
		}
		return (await response.json()) as CourseOverlay[];
	}

	async updateCourseOverlay(input: {
		canvasConnectionId: string;
		canvasCourseId: number;
		icon?: string | null;
	}): Promise<CourseOverlay> {
		const response = await fetch(
			new URL("/api/canvas/course-overlays", this.baseUrl),
			{
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			},
		);
		if (!response.ok) {
			throw new Error(`Overlay update failed (${response.status})`);
		}
		return (await response.json()) as CourseOverlay;
	}
}

export class LocalOverlayTransport implements OverlayTransport {
	private overlays: CourseOverlay[] = [];
	private connections: CanvasAccount[] = [];

	async probeAuth(): Promise<AppAuthState> {
		return {
			status: "authenticated",
			user: { id: "local-dev", name: "Local Dev" },
		};
	}

	async listConnections(): Promise<CanvasAccount[]> {
		return this.connections;
	}

	async ensureConnection(connection: CanvasAccount): Promise<CanvasAccount> {
		this.connections = [
			...this.connections.filter((item) => item.id !== connection.id),
			connection,
		];
		return connection;
	}

	async createConnection(input: CanvasConnectionInput): Promise<CanvasAccount> {
		const id = `${input.canvasBaseUrl}:${input.canvasUserId ?? "manual"}:${input.authMode}`;
		const connection: CanvasAccount = {
			id,
			connectionId: id,
			label: input.label,
			canvasBaseUrl: input.canvasBaseUrl,
			canvasUserId: input.canvasUserId,
			authMode: input.authMode,
			isActive: input.isActive ?? true,
		};
		return this.ensureConnection(connection);
	}

	async listCourseOverlays(): Promise<CourseOverlay[]> {
		return this.overlays;
	}

	async updateCourseOverlay(input: {
		canvasConnectionId: string;
		canvasCourseId: number;
		icon?: string | null;
	}): Promise<CourseOverlay> {
		const overlay = {
			id: `${input.canvasConnectionId}:${input.canvasCourseId}`,
			canvasConnectionId: input.canvasConnectionId,
			canvasCourseId: input.canvasCourseId,
			icon: input.icon,
			updatedAt: new Date().toISOString(),
		};
		this.overlays = [
			...this.overlays.filter((item) => item.id !== overlay.id),
			overlay,
		];
		return overlay;
	}
}

function parseNextLink(linkHeader: string | null) {
	if (!linkHeader) {
		return undefined;
	}
	for (const part of linkHeader.split(",")) {
		const [urlPart, relPart] = part.split(";").map((value) => value.trim());
		if (
			relPart === 'rel="next"' &&
			urlPart?.startsWith("<") &&
			urlPart.endsWith(">")
		) {
			return urlPart.slice(1, -1);
		}
	}
	return undefined;
}
