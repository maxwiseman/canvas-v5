import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
	modules: ["@wxt-dev/module-react"],
	vite: () => ({
		build: {
			minify: true,
			sourcemap: false,
		},
		plugins: [
			{
				name: "escape-chromium-noncharacters",
				enforce: "post",
				generateBundle(_options, bundle) {
					for (const file of Object.values(bundle)) {
						if (file.type === "chunk") {
							file.code = file.code.replaceAll("\uFFFF", "\\uFFFF");
						}
					}
				},
			},
			tailwindcss(),
		],
	}),
	manifest: () => {
		const configuredAppOrigin = process.env.VITE_CANVAS_V5_APP_ORIGIN;
		const appHostPermission = configuredAppOrigin
			? `${new URL(configuredAppOrigin).origin}/*`
			: undefined;
		return {
			permissions: ["alarms", "notifications", "storage"],
			host_permissions: [
				"*://*.instructure.com/*",
				"http://localhost:3000/*",
				"http://localhost:3001/*",
				...(appHostPermission ? [appHostPermission] : []),
			],
			name: "Canvas v5",
		};
	},
});
