import { CanvasApp } from "@canvas-v5/app";
import { createFileRoute } from "@tanstack/react-router";

import { canvasRuntime } from "../canvas-runtime";

export const Route = createFileRoute("/")({
	ssr: false,
	component: HomeComponent,
});

function HomeComponent() {
	return <CanvasApp runtime={canvasRuntime} />;
}
