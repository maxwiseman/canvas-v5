import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
	plugins: [tailwindcss(), react(), viteSingleFile()],
	build: {
		emptyOutDir: false,
		outDir: "src/generated",
		rollupOptions: { input: "canvas-app.html" },
	},
});
