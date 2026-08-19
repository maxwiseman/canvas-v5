import { Button } from "@canvas-v5/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@canvas-v5/ui/components/card";
import { Input } from "@canvas-v5/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

export const Route = createFileRoute("/_auth/settings")({
	component: SettingsPage,
});

interface McpTokenRecord {
	id: string;
	name: string;
	createdAt: string;
	lastUsedAt?: string | null;
}

function SettingsPage() {
	const [tokens, setTokens] = useState<McpTokenRecord[]>([]);
	const [name, setName] = useState("My agents");
	const [createdToken, setCreatedToken] = useState<string>();
	const [error, setError] = useState<string>();
	const [busy, setBusy] = useState(false);
	const mcpUrl =
		typeof window === "undefined"
			? "/api/mcp"
			: `${window.location.origin}/api/mcp`;

	const loadTokens = useCallback(async () => {
		const response = await fetch("/api/canvas/mcp-tokens", {
			credentials: "include",
		});
		if (response.ok) setTokens((await response.json()) as McpTokenRecord[]);
	}, []);

	useEffect(() => {
		void loadTokens();
	}, [loadTokens]);

	async function createToken() {
		setBusy(true);
		setError(undefined);
		try {
			const response = await fetch("/api/canvas/mcp-tokens", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			if (!response.ok) throw new Error("Unable to create an MCP token.");
			const created = (await response.json()) as McpTokenRecord & {
				token: string;
			};
			setCreatedToken(created.token);
			await loadTokens();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Token creation failed.",
			);
		} finally {
			setBusy(false);
		}
	}

	async function revokeToken(id: string) {
		await fetch(`/api/canvas/mcp-tokens?id=${encodeURIComponent(id)}`, {
			method: "DELETE",
			credentials: "include",
		});
		await loadTokens();
	}

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 px-6 py-12">
			<header className="space-y-2">
				<p className="text-muted-foreground text-sm">Settings</p>
				<h1 className="font-semibold text-3xl tracking-tight">Agent access</h1>
				<p className="max-w-2xl text-muted-foreground">
					Connect agents to your Canvas data through the read-only Canvas V5 MCP
					server.
				</p>
			</header>

			<Card>
				<CardHeader>
					<CardTitle>MCP server</CardTitle>
					<CardDescription>
						Use this URL and a bearer token in any Streamable HTTP MCP client.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="break-all rounded-3xl bg-muted px-4 py-3 font-mono text-sm">
						{mcpUrl}
					</div>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Input
							value={name}
							onChange={(event) => setName(event.target.value)}
							aria-label="Token name"
						/>
						<Button disabled={busy || !name.trim()} onClick={createToken}>
							{busy ? "Creating…" : "Create token"}
						</Button>
					</div>
					{createdToken ? (
						<div className="space-y-3 rounded-3xl border border-border p-4">
							<p className="font-medium text-sm">
								Copy this token now. It will not be shown again.
							</p>
							<code className="block break-all text-sm">{createdToken}</code>
							<Button
								variant="outline"
								onClick={() => navigator.clipboard.writeText(createdToken)}
							>
								Copy token
							</Button>
						</div>
					) : null}
					{error ? <p className="text-destructive text-sm">{error}</p> : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Active tokens</CardTitle>
					<CardDescription>
						Revoke credentials you no longer use.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{tokens.length === 0 ? (
						<p className="text-muted-foreground text-sm">No active tokens.</p>
					) : (
						tokens.map((token) => (
							<div
								key={token.id}
								className="flex items-center justify-between gap-4 rounded-3xl border border-border px-4 py-3"
							>
								<div>
									<p className="font-medium">{token.name}</p>
									<p className="text-muted-foreground text-xs">
										{token.lastUsedAt ? "Used recently" : "Never used"}
									</p>
								</div>
								<Button
									variant="destructive"
									onClick={() => revokeToken(token.id)}
								>
									Revoke
								</Button>
							</div>
						))
					)}
				</CardContent>
			</Card>
		</main>
	);
}
