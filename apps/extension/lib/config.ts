export const APP_BASE_URL =
	import.meta.env.VITE_CANVAS_V5_APP_ORIGIN?.replace(/\/$/, "") ??
	"https://canvas.maxw.app";

export const NEW_UI_ENABLED_STORAGE_KEY = "canvas-v5-new-ui-enabled";

export async function getNewUiEnabled() {
	const stored = await browser.storage.local.get(NEW_UI_ENABLED_STORAGE_KEY);
	return stored[NEW_UI_ENABLED_STORAGE_KEY] !== false;
}

export async function setNewUiEnabled(enabled: boolean) {
	await browser.storage.local.set({ [NEW_UI_ENABLED_STORAGE_KEY]: enabled });
}
