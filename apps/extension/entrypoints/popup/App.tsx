import { useEffect, useState } from "react";
import {
	APP_BASE_URL,
	getNewUiEnabled,
	setNewUiEnabled,
} from "../../lib/config";

import "./App.css";

type AuthState =
	| { status: "checking" }
	| { status: "authenticated"; user: { name?: string; email?: string } }
	| { status: "unauthenticated"; reason?: string };

async function getAuthState(): Promise<AuthState> {
	try {
		const response = (await browser.runtime.sendMessage({
			type: "canvas-v5:get-app-session",
		})) as {
			ok: boolean;
			user?: { name?: string; email?: string };
			reason?: string;
		};
		return response.ok && response.user
			? { status: "authenticated", user: response.user }
			: { status: "unauthenticated", reason: response.reason };
	} catch (error) {
		return {
			status: "unauthenticated",
			reason:
				error instanceof Error
					? error.message
					: "Unable to check your session.",
		};
	}
}

function App() {
	const [newUiEnabled, setNewUiEnabledState] = useState(true);
	const [savingPreference, setSavingPreference] = useState(false);
	const [auth, setAuth] = useState<AuthState>({ status: "checking" });

	useEffect(() => {
		void getNewUiEnabled().then(setNewUiEnabledState);
		void getAuthState().then(setAuth);
	}, []);

	async function toggleNewUi() {
		const enabled = !newUiEnabled;
		setSavingPreference(true);
		try {
			await setNewUiEnabled(enabled);
			setNewUiEnabledState(enabled);
			const [activeTab] = await browser.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (activeTab?.id !== undefined) {
				await browser.tabs.reload(activeTab.id);
			}
		} finally {
			setSavingPreference(false);
		}
	}

	function openLogin() {
		void browser.runtime.sendMessage({ type: "canvas-v5:open-app-login" });
	}

	return (
		<main className="popup-shell">
			<header className="popup-header">
				<div className="brand-mark" aria-hidden="true">
					C5
				</div>
				<div>
					<h1>Canvas V5</h1>
					<p>Extension settings</p>
				</div>
			</header>

			{auth.status === "checking" ? (
				<section className="auth-card" aria-live="polite">
					<div className="status-dot status-dot-checking" />
					<div>
						<strong>Checking your session…</strong>
						<p>Connecting to {new URL(APP_BASE_URL).hostname}</p>
					</div>
				</section>
			) : auth.status === "authenticated" ? (
				<section className="auth-card" aria-live="polite">
					<div className="status-dot status-dot-signed-in" />
					<div>
						<strong>Signed in</strong>
						<p>{auth.user.name ?? auth.user.email ?? "Canvas V5 account"}</p>
					</div>
				</section>
			) : (
				<section className="sign-in-card" aria-live="polite">
					<div>
						<strong>Sign in to finish setup</strong>
						<p>
							The new UI, MCP data, and background cache need your Canvas V5
							account.
						</p>
					</div>
					<button className="primary-button" type="button" onClick={openLogin}>
						Sign in
					</button>
				</section>
			)}

			<section className="setting-row">
				<div>
					<strong>Use the new Canvas UI</strong>
					<p>
						{newUiEnabled
							? "Canvas V5 replaces Canvas pages."
							: "Native Canvas stays visible; caching continues."}
					</p>
				</div>
				<button
					className="switch"
					type="button"
					role="switch"
					aria-checked={newUiEnabled}
					aria-label="Use the new Canvas UI"
					disabled={savingPreference}
					onClick={() => void toggleNewUi()}
				>
					<span className="switch-thumb" />
				</button>
			</section>

			<p className="popup-footer">
				Changing the UI setting reloads the current tab.
			</p>
		</main>
	);
}

export default App;
