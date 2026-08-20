import {
	useCanvasAccountSwitcher,
	useCanvasRuntime,
	useCanvasSnapshot,
} from "@canvas-v5/canvas-sdk";
// import {
// 	Avatar,
// 	AvatarFallback,
// 	AvatarImage,
// } from "@canvas-v5/ui/components/avatar";
import { Button } from "@canvas-v5/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@canvas-v5/ui/components/dropdown-menu";
import { Skeleton } from "@canvas-v5/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import { Database, LogOut, Settings, SunMoon } from "lucide-react";
import { useState } from "react";
import { useTheme } from "./theme-provider";

export default function UserMenu() {
	const runtime = useCanvasRuntime();
	const { appAuth } = useCanvasSnapshot();
	const { accounts, activeAccount, switchAccount } = useCanvasAccountSwitcher();
	const { theme, setTheme } = useTheme();
	const [signingOut, setSigningOut] = useState(false);

	if (appAuth.status === "checking") {
		return <Skeleton className="h-9 w-24" />;
	}

	if (appAuth.status !== "authenticated") {
		return (
			<Button variant="outline" onClick={runtime.openAppLogin}>
				Sign In
			</Button>
		);
	}

	const user = appAuth.user;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" />}>
				{/*<Avatar>
					<AvatarImage src={session.user.image ?? ""} />
					<AvatarFallback>{session.user.name?.[0] ?? "?"}</AvatarFallback>
				</Avatar>*/}
				{user.name}
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				<DropdownMenuGroup>
					<DropdownMenuLabel>
						<div className="font-medium text-foreground text-sm">
							{user.name}
						</div>
						<div className="text-sm">{user.email}</div>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem render={<Link to={"/account" as never} />}>
						<Settings /> Settings
					</DropdownMenuItem>
					{accounts.length > 0 ? (
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<Database /> Canvas account
							</DropdownMenuSubTrigger>
							<DropdownMenuContent side="right">
								<DropdownMenuRadioGroup
									value={activeAccount?.connectionId}
									onValueChange={(value) => void switchAccount(value)}
								>
									{accounts.map((account) => (
										<DropdownMenuRadioItem
											key={account.connectionId}
											value={account.connectionId}
										>
											{account.label}
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenuSub>
					) : null}
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<SunMoon /> Theme
						</DropdownMenuSubTrigger>
						<DropdownMenuContent side="right">
							<DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
								<DropdownMenuRadioItem value="system">
									System
								</DropdownMenuRadioItem>
								<DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
								<DropdownMenuRadioItem value="light">
									Light
								</DropdownMenuRadioItem>
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenuSub>
					<DropdownMenuItem
						variant="destructive"
						disabled={signingOut}
						onClick={() => {
							setSigningOut(true);
							void runtime.signOutApp().finally(() => setSigningOut(false));
						}}
					>
						<LogOut /> Sign Out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
