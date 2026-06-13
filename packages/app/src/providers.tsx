import { SidebarProvider } from "@canvas-v5/ui/components/sidebar";
import { Toaster } from "@canvas-v5/ui/components/sonner";
import { TooltipProvider } from "@canvas-v5/ui/components/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<TooltipProvider>
			<SidebarProvider>
				{children}
				<Toaster richColors />
				{/*<TanStackRouterDevtools position="bottom-left" />
				<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />*/}
			</SidebarProvider>
		</TooltipProvider>
	);
}
