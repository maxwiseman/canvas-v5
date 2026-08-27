import { Button } from "@canvas-v5/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/oauth/consent")({
	component: OAuthConsent,
});

const scopeDescriptions: Record<string, string> = {
	openid: "Confirm your Canvas V5 identity",
	profile: "Read your Canvas V5 name and profile",
	email: "Read the email on your Canvas V5 account",
	offline_access: "Stay connected until you revoke access",
	"canvas:read": "Read courses, assignments, and other synced Canvas data",
	"canvas:refresh": "Request a fresh sync from connected Canvas accounts",
};

function OAuthConsent() {
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const [pending, setPending] = useState<"accept" | "deny" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const requestedScopes = useMemo(() => {
		if (typeof window === "undefined") return [];
		return (new URLSearchParams(window.location.search).get("scope") ?? "")
			.split(" ")
			.filter(Boolean);
	}, []);

	const decide = async (accept: boolean) => {
		setPending(accept ? "accept" : "deny");
		setError(null);
		const result = await authClient.oauth2.consent({ accept });
		if (result.error) {
			setError(
				result.error.message ?? "Canvas V5 could not complete authorization.",
			);
			setPending(null);
			return;
		}
		if (result.data?.url) {
			window.location.assign(result.data.url);
			return;
		}
		setError("The authorization client did not provide a return URL.");
		setPending(null);
	};

	if (sessionPending) {
		return <ConsentShell title="Preparing authorization…" />;
	}

	if (!session) {
		return (
			<ConsentShell title="Sign in to continue">
				<p className="text-muted-foreground text-sm">
					Canvas V5 needs to confirm which account you want to connect.
				</p>
				<Button
					className="mt-5 w-full"
					onClick={() =>
						window.location.assign(`/login${window.location.search}`)
					}
				>
					Sign in
				</Button>
			</ConsentShell>
		);
	}

	return (
		<ConsentShell title="Connect Canvas V5?">
			<p className="text-muted-foreground text-sm leading-6">
				ChatGPT or another MCP client is asking to use Canvas V5 as you. It will
				be able to:
			</p>
			<ul className="mt-5 space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
				{requestedScopes
					.filter((scope) => scopeDescriptions[scope])
					.map((scope) => (
						<li className="flex gap-3" key={scope}>
							<span className="mt-0.5 text-emerald-500">✓</span>
							<span>{scopeDescriptions[scope]}</span>
						</li>
					))}
			</ul>
			<p className="mt-4 text-muted-foreground text-xs">
				Signed in as {session.user.email}. You can revoke this connection later.
			</p>
			{error ? (
				<p className="mt-4 rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
					{error}
				</p>
			) : null}
			<div className="mt-6 flex gap-3">
				<Button
					className="flex-1"
					disabled={pending !== null}
					onClick={() => decide(true)}
				>
					{pending === "accept" ? "Connecting…" : "Allow"}
				</Button>
				<Button
					className="flex-1"
					disabled={pending !== null}
					onClick={() => decide(false)}
					variant="outline"
				>
					{pending === "deny" ? "Declining…" : "Cancel"}
				</Button>
			</div>
		</ConsentShell>
	);
}

function ConsentShell({
	title,
	children,
}: {
	title: string;
	children?: React.ReactNode;
}) {
	return (
		<main className="grid min-h-svh place-items-center p-6">
			<section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
				<p className="mb-2 font-semibold text-emerald-500 text-xs uppercase tracking-[0.16em]">
					Canvas V5
				</p>
				<h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
				<div className="mt-3">{children}</div>
			</section>
		</main>
	);
}
