import { CanvasApp } from "@canvas-v5/app";
import {
	type ChatGPTBootstrap,
	createChatGPTCanvasRuntime,
} from "@canvas-v5/canvas-sdk";
import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { createMemoryHistory } from "@tanstack/react-router";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@canvas-v5/app/styles.css";
import "./canvas-app.css";
import "./canvas-host-layout.css";
import { applyCanvasHostStyles } from "./canvas-host-styles";
import { appRelativePath, unwrapAppResult } from "./canvas-host";

const app = new App(
	{ name: "Canvas V5 workspace", version: "1.0.0" },
	{},
	{ autoResize: false },
);
const history = createMemoryHistory({ initialEntries: ["/"] });
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Canvas workspace mount is missing.");
const root = createRoot(rootElement);
let bootstrap: ChatGPTBootstrap | undefined;
let runtime: ReturnType<typeof createChatGPTCanvasRuntime> | undefined;
let theme: "light" | "dark" | undefined;
let connected = false;
let ready = false;
let startup: Promise<void> | undefined;

async function callTool(name: string, args: Record<string, unknown>) {
	return unwrapAppResult(await app.callServerTool({ name, arguments: args }));
}

function applyHostContext(context: McpUiHostContext | undefined) {
	if (context?.theme) theme = context.theme;
	applyCanvasHostStyles(context);
	const link = context?.["openai/deepLink"] as { url?: unknown } | undefined;
	const path = appRelativePath(link?.url);
	if (path && path !== history.location.href) history.push(path);
	if (bootstrap && connected) renderWorkspace();
}

function renderWorkspace() {
	if (!bootstrap) return;
	runtime ??= createChatGPTCanvasRuntime({
		bootstrap,
		callTool,
		openLink: async (url) => {
			await app.openLink({ url });
		},
	});
	if (!ready) {
		if (!startup)
			startup = runtime
				.boot()
				.then(() => {
					ready = true;
					renderWorkspace();
				})
				.catch(renderError);
		return;
	}
	root.render(
		<ErrorBoundary>
			<div className="canvas-shared-app">
				<CanvasApp runtime={runtime} history={history} hostTheme={theme} />
			</div>
		</ErrorBoundary>,
	);
}

class ErrorBoundary extends Component<
	{ children: ReactNode },
	{ error: string | null }
> {
	state = { error: null as string | null };
	static getDerivedStateFromError(error: Error) {
		return { error: error.message };
	}
	render() {
		return this.state.error ? (
			<div className="canvas-host-empty" role="alert">
				<h1>Unable to open Canvas</h1>
				<p>{this.state.error}</p>
				<p>Close and reopen the Canvas workspace to retry.</p>
			</div>
		) : (
			this.props.children
		);
	}
}

// The entrypoint's first result is the bootstrap; do not make a second call.
app.ontoolresult = (result) => {
	try {
		bootstrap = unwrapAppResult(result) as ChatGPTBootstrap;
		if (!bootstrap?.user?.id || !Array.isArray(bootstrap.accounts))
			throw new Error("Invalid Canvas workspace response.");
		if (connected) renderWorkspace();
	} catch (error) {
		renderError(error);
	}
};
app.onhostcontextchanged = applyHostContext;

function renderError(error: unknown) {
	root.render(
		<div className="canvas-host-empty" role="alert">
			<h1>Unable to connect to Canvas</h1>
			<p>
				{error instanceof Error
					? error.message
					: "Reconnect the Canvas V5 plugin and try again."}
			</p>
		</div>,
	);
}

// Route external links through the host, preserving the embedded workspace.
document.addEventListener(
	"click",
	(event) => {
		const anchor = (event.target as Element | null)?.closest?.("a[href]");
		const href = anchor?.getAttribute("href");
		if (!href || !/^https?:\/\//i.test(href)) return;
		event.preventDefault();
		event.stopPropagation();
		void app.openLink({ url: href });
	},
	true,
);
root.render(
	<div className="canvas-host-empty" role="status">
		Connecting to Canvas…
	</div>,
);
app
	.connect()
	.then(() => {
		connected = true;
		applyHostContext(app.getHostContext());
	})
	.catch(renderError);
