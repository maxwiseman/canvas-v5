import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
	plugins: [react(), viteSingleFile()],
	build: {
		cssMinify: true,
		emptyOutDir: true,
		minify: true,
		outDir: "src/generated",
		rollupOptions: {
			input: "assignment-widget.html",
		},
	},
});
