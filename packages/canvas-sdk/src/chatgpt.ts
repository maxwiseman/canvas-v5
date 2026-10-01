import { CanvasRuntime } from "./runtime";
import { CanvasIndexedDbStore } from "./store";
import type {
	AppUser,
	AssignmentComment,
	CanvasAccount,
	CanvasAuthState,
	CanvasRequestOptions,
	CanvasTransport,
	CourseOverlay,
	OverlayTransport,
} from "./types";

export interface ChatGPTBootstrap {
	user: AppUser;
	accounts: CanvasAccount[];
	courseOverlays: CourseOverlay[];
	appUrl: string;
}

export type ChatGPTCallTool = (
	name: string,
	args: Record<string, unknown>,
) => Promise<unknown>;

const readOnlyMessage =
	"Open Canvas V5 in your browser to make changes. This ChatGPT connection has read access.";

/** Host authentication stays in MCP; neither Canvas nor app tokens enter the UI. */
export class ChatGPTCanvasTransport implements CanvasTransport {
	readonly mode = "chatgpt" as const;
	private account?: CanvasAccount;
	constructor(private readonly callTool: ChatGPTCallTool) {}
	setActiveAccount(account?: CanvasAccount) {
		this.account = account;
	}
	async probeAuth(): Promise<CanvasAuthState> {
		return {
			status: "unauthenticated",
			reason: "Select a connected Canvas account.",
		};
	}
	async request<T>(
		path: string,
		options: CanvasRequestOptions = {},
	): Promise<T> {
		return this.read(path, options, false) as Promise<T>;
	}
	async paginatedRequest<T>(
		path: string,
		options: CanvasRequestOptions = {},
	): Promise<T[]> {
		return this.read(path, options, true) as Promise<T[]>;
	}
	private async read(
		path: string,
		options: CanvasRequestOptions,
		paginated: boolean,
	) {
		options.signal?.throwIfAborted();
		if (options.method && options.method !== "GET")
			throw new Error(readOnlyMessage);
		if (!this.account) throw new Error("Select a Canvas account first.");
		const result = await this.callTool("canvas_app_read", {
			connectionId: this.account.connectionId,
			path,
			paginated,
		});
		options.signal?.throwIfAborted();
		return result;
	}
}

export function createChatGPTCanvasRuntime(options: {
	bootstrap: ChatGPTBootstrap;
	callTool: ChatGPTCallTool;
	openLink: (url: string) => Promise<void>;
}) {
	const { bootstrap, callTool, openLink } = options;
	const unsupported = async (): Promise<never> => {
		throw new Error(readOnlyMessage);
	};
	const overlayTransport: OverlayTransport = {
		probeAuth: async () => ({ status: "authenticated", user: bootstrap.user }),
		signOutApp: async () => {
			throw new Error(
				"Disconnect Canvas V5 in ChatGPT plugin settings to sign out.",
			);
		},
		listConnections: async () => bootstrap.accounts,
		ensureConnection: async (account) => account,
		createConnection: unsupported,
		listCourseOverlays: async () => bootstrap.courseOverlays,
		updateCourseOverlay: unsupported,
		listAssignmentComments: async (input) =>
			(await callTool("canvas_app_comments", input)) as AssignmentComment[],
		createAssignmentComment: unsupported,
	};
	return new CanvasRuntime({
		mode: "chatgpt",
		canvasTransport: new ChatGPTCanvasTransport(callTool),
		overlayTransport,
		// A different ChatGPT connection must never hydrate another user's cache.
		store: new CanvasIndexedDbStore(
			`canvas-v5-sdk:chatgpt:${bootstrap.user.id}`,
		),
		openAppLogin: () => openLink(bootstrap.appUrl),
		openCanvasAccount: (account) => {
			if (account) void openLink(account.canvasBaseUrl);
		},
	});
}
