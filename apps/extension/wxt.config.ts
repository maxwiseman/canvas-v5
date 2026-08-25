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
		const configuredAppOrigin =
			process.env.VITE_CANVAS_V5_APP_ORIGIN ?? "https://canvas.maxw.app";
		const appHostPermission = `${new URL(configuredAppOrigin).origin}/*`;
		const releaseVersion = process.env.EXTENSION_VERSION;
		return {
			...(releaseVersion ? { version: releaseVersion } : {}),
			permissions: ["alarms", "notifications", "storage", "tabs"],
			host_permissions: [
				"*://*.instructure.com/*",
				"http://localhost:3000/*",
				"http://localhost:3001/*",
				appHostPermission,
			],
			name: "Canvas v5",
		};
	},
});
