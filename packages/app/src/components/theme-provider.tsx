import { ScriptOnce } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useRef, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
	children: React.ReactNode;
	defaultTheme?: Theme;
	storageKey?: string;
};

type ThemeProviderState = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
};

function getThemeScript(storageKey: string, defaultTheme: Theme) {
	const key = JSON.stringify(storageKey);
	const fallback = JSON.stringify(defaultTheme);

	return `(function(){try{var t=localStorage.getItem(${key});if(t!=='light'&&t!=='dark'&&t!=='system'){t=${fallback}}var d=matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(d?'dark':'light'):t;var e=document.documentElement;e.classList.add(r);e.style.colorScheme=r}catch(e){}})();`;
}

const ThemeProviderContext = createContext<ThemeProviderState>({
	theme: "system",
	setTheme: () => {},
});

function resolveTheme(theme: Theme) {
	if (theme !== "system") return theme;
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function getThemeRoots(marker: HTMLElement | null) {
	const rootNode = marker?.getRootNode();

	if (rootNode instanceof ShadowRoot) {
		const roots = [
			marker?.parentElement,
			rootNode.host instanceof HTMLElement ? rootNode.host : null,
		];
		return roots.filter((root): root is HTMLElement => root !== null);
	}

	return [document.documentElement];
}

function applyTheme(theme: Theme, roots: HTMLElement[]) {
	const resolved = resolveTheme(theme);

	for (const root of roots) {
		root.classList.remove("light", "dark");
		root.classList.add(resolved);
		root.style.colorScheme = resolved;
	}
}

export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = "theme",
}: ThemeProviderProps) {
	const [theme, setThemeState] = useState<Theme>(defaultTheme);
	const [mounted, setMounted] = useState(false);
	const markerRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const stored = localStorage.getItem(storageKey);
		setThemeState(
			stored === "light" || stored === "dark" || stored === "system"
				? stored
				: defaultTheme,
		);
		setMounted(true);
	}, [defaultTheme, storageKey]);

	useEffect(() => {
		if (!mounted) return;
		applyTheme(theme, getThemeRoots(markerRef.current));
	}, [theme, mounted]);

	useEffect(() => {
		if (!mounted || theme !== "system") return;

		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () =>
			applyTheme("system", getThemeRoots(markerRef.current));
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [theme, mounted]);

	const setTheme = (next: Theme) => {
		localStorage.setItem(storageKey, next);
		setThemeState(next);
	};

	return (
		<ThemeProviderContext value={{ theme, setTheme }}>
			<span ref={markerRef} hidden style={{ display: "none" }} />
			<ScriptOnce>{getThemeScript(storageKey, defaultTheme)}</ScriptOnce>
			{children}
		</ThemeProviderContext>
	);
}

export function useTheme() {
	const context = useContext(ThemeProviderContext);
	if (context === undefined)
		throw new Error("useTheme must be used within a ThemeProvider");
	return context;
}
