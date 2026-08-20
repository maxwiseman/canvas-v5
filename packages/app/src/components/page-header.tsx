import { cn } from "@canvas-v5/ui/lib/utils";
import type { HTMLProps, ReactNode } from "react";

export function PageHeader({ children }: { children?: ReactNode }) {
	return <div className="mb-8 flex gap-4">{children}</div>;
}

export function PageHeaderContent({ children }: { children?: ReactNode }) {
	return <div className="flex flex-col justify-between gap-0">{children}</div>;
}

export function PageHeaderTitle({ children }: { children?: ReactNode }) {
	return <h1 className="font-medium text-3xl">{children}</h1>;
}

export function PageHeaderSubtitle({ children }: { children?: ReactNode }) {
	return <h3 className="text-lg text-muted-foreground">{children}</h3>;
}

export function PageHeaderActions({
	className,
	...props
}: HTMLProps<HTMLDivElement>) {
	return <div className={cn("flex gap-2", className)} {...props} />;
}

export function PageWrapper({
	className,
	...props
}: { children?: ReactNode } & HTMLProps<HTMLDivElement>) {
	return <div className={cn("p-8", className)} {...props} />;
}
