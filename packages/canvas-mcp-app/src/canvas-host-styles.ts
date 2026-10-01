import {
	applyDocumentTheme,
	applyHostFonts,
	applyHostStyleVariables,
	type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

// Keep our existing semantic utilities; only supplied host tokens replace them.
export const hostTokenAliases = {
	"--background": "--color-background-primary",
	"--foreground": "--color-text-primary",
	"--card": "--color-background-primary",
	"--card-foreground": "--color-text-primary",
	"--popover": "--color-background-primary",
	"--popover-foreground": "--color-text-primary",
	"--primary": "--color-background-inverse",
	"--primary-foreground": "--color-text-inverse",
	"--secondary": "--color-background-secondary",
	"--secondary-foreground": "--color-text-primary",
	"--muted": "--color-background-secondary",
	"--muted-foreground": "--color-text-secondary",
	"--accent": "--color-background-tertiary",
	"--accent-foreground": "--color-text-primary",
	"--destructive": "--color-text-danger",
	"--border": "--color-border-primary",
	"--input": "--color-background-secondary",
	"--ring": "--color-ring-primary",
	"--sidebar": "--color-background-secondary",
	"--sidebar-foreground": "--color-text-primary",
	"--sidebar-primary": "--color-background-inverse",
	"--sidebar-primary-foreground": "--color-text-inverse",
	"--sidebar-accent": "--color-background-tertiary",
	"--sidebar-accent-foreground": "--color-text-primary",
	"--sidebar-border": "--color-border-primary",
	"--sidebar-ring": "--color-ring-primary",
	"--canvas-font-sans": "--font-sans",
} as const;

export function applyCanvasHostStyles(context: McpUiHostContext | undefined) {
	const root = document.documentElement;
	root.dataset.uiHost = "chatgpt";
	if (context?.theme) applyDocumentTheme(context.theme);
	const variables = context?.styles?.variables;
	if (variables) {
		applyHostStyleVariables(variables);
		for (const [alias, token] of Object.entries(hostTokenAliases)) {
			// Context notifications can be partial. Omitted tokens retain their value.
			if (!(token in variables)) continue;
			if (variables[token]) root.style.setProperty(alias, `var(${token})`);
			else root.style.removeProperty(alias);
		}
	}
	if (context?.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
}
