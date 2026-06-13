import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import { env } from "@canvas-v5/env/server";

const TOKEN_FORMAT_VERSION = "v1";

export function encryptCanvasToken(secret: string) {
	const key = createEncryptionKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([
		cipher.update(secret, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return [
		TOKEN_FORMAT_VERSION,
		iv.toString("base64url"),
		tag.toString("base64url"),
		encrypted.toString("base64url"),
	].join(":");
}

export function decryptCanvasToken(encryptedSecret: string) {
	const [version, ivValue, tagValue, encryptedValue] =
		encryptedSecret.split(":");
	if (
		version !== TOKEN_FORMAT_VERSION ||
		!ivValue ||
		!tagValue ||
		!encryptedValue
	) {
		throw new Error("Unsupported Canvas token format.");
	}

	const decipher = createDecipheriv(
		"aes-256-gcm",
		createEncryptionKey(),
		Buffer.from(ivValue, "base64url"),
	);
	decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
	return Buffer.concat([
		decipher.update(Buffer.from(encryptedValue, "base64url")),
		decipher.final(),
	]).toString("utf8");
}

function createEncryptionKey() {
	return createHash("sha256").update(env.BETTER_AUTH_SECRET).digest();
}
