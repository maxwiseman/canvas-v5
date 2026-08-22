import { Button } from "@canvas-v5/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { CanvasHTML } from "../components/canvas-html";
import { useTheme } from "../components/theme-provider";

export const Route = createFileRoute("/dev-canvas-html-colors")({
	component: CanvasHtmlColorsPreview,
});

const previewHtml = `
<h2>Teacher-authored course page</h2>
<p>This paragraph inherits Canvas V5's normal prose colors.</p>

<div style="background-color: #ffffff; padding: 18px; border: 2px solid #d1d5db; border-radius: 10px;">
  <strong>White announcement panel</strong>
  <p>This text is inherited, which used to turn white on a white background in dark mode.</p>
</div>

<div style="background-color: #fff4b8; color: #3b2f00; padding: 18px; border-left: 6px solid #e8ae00; margin-top: 18px;">
  <strong>Important deadline</strong>
  <p>This yellow callout has both an authored foreground and background.</p>
</div>

<div style="background-color: #dbeafe; color: #17375e; padding: 18px; border: 2px solid #60a5fa; margin-top: 18px;">
  <strong>Helpful course note</strong>
  <p>The blue identity should survive without glowing in dark mode.</p>
</div>

<div style="background-color: #12345a; color: white; padding: 18px; margin-top: 18px;">
  <strong>Already-dark panel</strong>
  <p>This was already readable and should remain recognizably dark blue.</p>
</div>

<table bgcolor="#f3f4f6" style="color: #222222; margin-top: 18px; width: 100%; border-color: #9ca3af;" border="1" cellpadding="10">
  <tbody>
    <tr><th bgcolor="#e5e7eb">Item</th><th bgcolor="#e5e7eb">Status</th></tr>
    <tr><td>Reading response</td><td style="color: #08783f;">Ready</td></tr>
    <tr><td>Lab report</td><td style="color: #b42318;">Needs attention</td></tr>
  </tbody>
</table>
`;

function CanvasHtmlColorsPreview() {
	const { theme, setTheme } = useTheme();

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10">
			<div className="mb-8 flex flex-wrap items-center justify-between gap-4">
				<div>
					<p className="text-muted-foreground text-sm">Canvas HTML preview</p>
					<h1 className="font-semibold text-2xl">Adaptive authored colors</h1>
				</div>
				<div className="flex gap-2">
					<Button
						variant={theme === "light" ? "default" : "outline"}
						onClick={() => setTheme("light")}
					>
						Light
					</Button>
					<Button
						variant={theme === "dark" ? "default" : "outline"}
						onClick={() => setTheme("dark")}
					>
						Dark
					</Button>
				</div>
			</div>
			<CanvasHTML>{previewHtml}</CanvasHTML>
		</div>
	);
}
