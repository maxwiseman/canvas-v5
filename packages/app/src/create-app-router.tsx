import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function createCanvasAppRouter() {
	return createRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: "intent",
	});
}
