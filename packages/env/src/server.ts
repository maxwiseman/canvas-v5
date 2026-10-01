import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { devPluginOrigin } from "./dev-plugin-origin";

const devOrigin = devPluginOrigin(process.env);

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		CANVAS_SYNC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
		CANVAS_SYNC_VAPID_PRIVATE_KEY: z.string().min(1).optional(),
		CANVAS_SYNC_VAPID_SUBJECT: z.string().min(1).optional(),
		CANVAS_SYNC_CRON_SECRET: z.string().min(24).optional(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	runtimeEnv: {
		...process.env,
		...(devOrigin
			? { BETTER_AUTH_URL: devOrigin, CORS_ORIGIN: devOrigin }
			: {}),
	},
	emptyStringAsUndefined: true,
});
