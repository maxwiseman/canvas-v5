import { CanvasApp } from "@canvas-v5/app";
import { createFileRoute } from "@tanstack/react-router";

import { canvasRuntime } from "../../canvas-runtime";

export const Route = createFileRoute("/_auth/dashboard")({
	component: RouteComponent,
});

function RouteComponent() {
	Route.useRouteContext();

	return <CanvasApp runtime={canvasRuntime} />;
}
