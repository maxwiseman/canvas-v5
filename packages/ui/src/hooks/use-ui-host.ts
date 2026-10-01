import { createContext, useContext } from "react";

// Explicit runtime context: an iframe alone does not imply ChatGPT.
export const UIHostContext = createContext<"default" | "chatgpt">("default");

export function useIsChatGPT() {
	return useContext(UIHostContext) === "chatgpt";
}
