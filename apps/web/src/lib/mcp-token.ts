import { createHash } from "node:crypto";

export function hashMcpToken(token: string) {
	return createHash("sha256").update(token).digest("hex");
}
