import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
	modules: ["@wxt-dev/module-react"],
	manifest: {
		host_permissions: [
			"*://*.instructure.com/*",
			"http://localhost:3000/*",
			"http://localhost:3001/*",
		],
		name: "Canvas v5",
	},
});
