import {
	useCanvasAccountSwitcher,
	useCanvasRuntime,
	useCanvasSnapshot,
	useNotificationPreferences,
	useSyncStatus,
} from "@canvas-v5/canvas-sdk";
import { Badge } from "@canvas-v5/ui/components/badge";
import { Button } from "@canvas-v5/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@canvas-v5/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@canvas-v5/ui/components/dialog";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@canvas-v5/ui/components/field";
import { Input } from "@canvas-v5/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@canvas-v5/ui/components/select";
import { createFileRoute } from "@tanstack/react-router";
import {
	ExternalLink,
	LoaderCircle,
	LogIn,
	Plus,
	RefreshCw,
} from "lucide-react";
import { useState } from "react";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderContent,
	PageHeaderSubtitle,
	PageHeaderTitle,
	PageWrapper,
} from "../components/page-header";
import { ResourceEmpty } from "../components/resource-empty";

export const Route = createFileRoute("/account")({ component: AccountRoute });

function AccountRoute() {
	const runtime = useCanvasRuntime();
	const { appAuth } = useCanvasSnapshot();
	const { accounts, activeAccount, switchAccount } = useCanvasAccountSwitcher();

	return (
		<PageWrapper className="mx-auto w-full max-w-4xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Account</PageHeaderTitle>
					<PageHeaderSubtitle>
						Canvas connections and app session
					</PageHeaderSubtitle>
				</PageHeaderContent>
				<PageHeaderActions className="ml-auto">
					<ConnectionDialog />
				</PageHeaderActions>
			</PageHeader>

			<div className="flex flex-col gap-6">
				<Card size="sm">
					<CardHeader>
						<CardTitle>
							{appAuth.status === "authenticated"
								? (appAuth.user.name ??
									appAuth.user.email ??
									"Canvas V5 account")
								: "Canvas V5 account"}
						</CardTitle>
						<CardDescription>
							{appAuth.status === "authenticated"
								? appAuth.user.email
								: "Sign in to sync connections and preferences."}
						</CardDescription>
						<CardAction>
							{appAuth.status === "authenticated" ? (
								<Button
									onClick={() => void runtime.refreshAppAuth()}
									size="sm"
									variant="outline"
								>
									<RefreshCw data-icon="inline-start" />
									Refresh
								</Button>
							) : (
								<Button onClick={() => void runtime.openAppLogin()} size="sm">
									<LogIn data-icon="inline-start" />
									Sign in
								</Button>
							)}
						</CardAction>
					</CardHeader>
				</Card>

				<div>
					<h2 className="mb-3 font-medium text-sm">Canvas connections</h2>
					{accounts.length > 0 ? (
						<div className="grid gap-3 sm:grid-cols-2">
							{accounts.map((account) => (
								<Card key={account.connectionId} size="sm">
									<CardHeader>
										<CardTitle className="flex items-center gap-2">
											{account.label}
											{account.connectionId === activeAccount?.connectionId ? (
												<Badge variant="secondary">Active</Badge>
											) : null}
										</CardTitle>
										<CardDescription>
											{new URL(account.canvasBaseUrl).hostname} ·{" "}
											{formatAuthMode(account.authMode)}
										</CardDescription>
									</CardHeader>
									<CardContent className="flex gap-2">
										<Button
											disabled={
												account.connectionId === activeAccount?.connectionId
											}
											onClick={() => void switchAccount(account.connectionId)}
											size="sm"
										>
											Use account
										</Button>
										<Button
											render={
												<a
													aria-label={`Open ${account.label} in Canvas`}
													href={account.canvasBaseUrl}
													rel="noreferrer noopener"
													target="_blank"
												>
													<span className="sr-only">
														Open {account.label} in Canvas
													</span>
												</a>
											}
											size="sm"
											variant="outline"
										>
											<ExternalLink data-icon="inline-start" />
											Open Canvas
										</Button>
									</CardContent>
								</Card>
							))}
						</div>
					) : (
						<ResourceEmpty
							description="Open Canvas with the extension or add an API-token connection from the web settings page."
							title="No Canvas connections"
						/>
					)}
				</div>
				<NotificationSettings />
			</div>
		</PageWrapper>
	);
}

function ConnectionDialog() {
	const runtime = useCanvasRuntime();
	const [open, setOpen] = useState(false);
	const [label, setLabel] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [token, setToken] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string>();
	const validUrl = normalizeCanvasUrl(baseUrl);
	async function save() {
		if (!label.trim() || !validUrl || !token.trim() || submitting) return;
		setSubmitting(true);
		setError(undefined);
		try {
			await runtime.saveCanvasConnection({
				label: label.trim(),
				canvasBaseUrl: validUrl,
				authMode: "api-token",
				accessToken: token.trim(),
				isActive: true,
			});
			setLabel("");
			setBaseUrl("");
			setToken("");
			setOpen(false);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Unable to save connection.",
			);
		} finally {
			setSubmitting(false);
		}
	}
	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger render={<Button size="sm" />}>
				<Plus data-icon="inline-start" />
				Add connection
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Canvas connection</DialogTitle>
					<DialogDescription>
						Connect the web app with a Canvas API token. Tokens are encrypted
						before storage.
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="connection-label">Name</FieldLabel>
						<Input
							id="connection-label"
							onChange={(event) => setLabel(event.target.value)}
							placeholder="School Canvas"
							value={label}
						/>
					</Field>
					<Field data-invalid={Boolean(baseUrl) && !validUrl}>
						<FieldLabel htmlFor="connection-url">Canvas URL</FieldLabel>
						<Input
							aria-invalid={Boolean(baseUrl) && !validUrl}
							id="connection-url"
							onChange={(event) => setBaseUrl(event.target.value)}
							placeholder="https://school.instructure.com"
							type="url"
							value={baseUrl}
						/>
						<FieldDescription>
							Use the root URL for your institution.
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="connection-token">API token</FieldLabel>
						<Input
							autoComplete="off"
							id="connection-token"
							onChange={(event) => setToken(event.target.value)}
							type="password"
							value={token}
						/>
					</Field>
				</FieldGroup>
				{error ? <p className="text-destructive text-sm">{error}</p> : null}
				<DialogFooter showCloseButton>
					<Button
						disabled={!label.trim() || !validUrl || !token.trim() || submitting}
						onClick={() => void save()}
					>
						{submitting ? (
							<LoaderCircle className="animate-spin" data-icon="inline-start" />
						) : (
							<Plus data-icon="inline-start" />
						)}
						Connect
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function NotificationSettings() {
	const runtime = useCanvasRuntime();
	const hasConnection = useCanvasSnapshot().accounts.length > 0;
	const { channels, preferences } = useNotificationPreferences();
	const sync = useSyncStatus().find((state) => state.scope === "notifications");
	if (channels.length === 0 && preferences.length === 0) {
		return (
			<div>
				<h2 className="mb-3 font-medium text-sm">Notifications</h2>
				<ResourceEmpty
					description={
						hasConnection
							? "Notification preferences are available after Canvas returns an active communication channel."
							: "Connect a Canvas account to manage notification preferences."
					}
					error={
						hasConnection && sync?.status === "error" ? sync.error : undefined
					}
					loading={sync?.status === "syncing"}
					title={hasConnection ? "No notification channels" : "Connect Canvas"}
				/>
			</div>
		);
	}
	return (
		<div>
			<h2 className="mb-3 font-medium text-sm">Notifications</h2>
			<div className="flex flex-col gap-4">
				{channels.map((channel) => {
					const channelPreferences = preferences.filter(
						(preference) => preference.channel_id === channel.id,
					);
					return (
						<Card key={channel.id} size="sm">
							<CardHeader>
								<CardTitle>{channel.address}</CardTitle>
								<CardDescription>
									{channel.type} notification frequency
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-1">
								{channelPreferences.map((preference) => (
									<div
										className="flex items-center justify-between gap-4 rounded-2xl px-3 py-2 hover:bg-muted/50"
										key={preference.id}
									>
										<div className="min-w-0">
											<div className="truncate font-medium text-sm">
												{humanize(preference.notification)}
											</div>
											<div className="text-muted-foreground text-xs">
												{humanize(preference.category)}
											</div>
										</div>
										<Select
											value={preference.frequency}
											onValueChange={(value) =>
												void runtime.updateNotificationPreference(
													preference,
													value as typeof preference.frequency,
												)
											}
										>
											<SelectTrigger size="sm">
												<SelectValue />
											</SelectTrigger>
											<SelectContent alignItemWithTrigger={false}>
												<SelectGroup>
													{["immediately", "daily", "weekly", "never"].map(
														(frequency) => (
															<SelectItem key={frequency} value={frequency}>
																{humanize(frequency)}
															</SelectItem>
														),
													)}
												</SelectGroup>
											</SelectContent>
										</Select>
									</div>
								))}
							</CardContent>
						</Card>
					);
				})}
			</div>
		</div>
	);
}

function formatAuthMode(mode: string) {
	return mode === "canvas-session"
		? "Browser session"
		: mode === "api-token"
			? "API token"
			: "OAuth";
}

function humanize(value: string) {
	return value
		.replaceAll("_", " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeCanvasUrl(value: string) {
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" && url.hostname !== "localhost")
			return undefined;
		return url.origin;
	} catch {
		return undefined;
	}
}
