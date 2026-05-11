import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    TESLA_CLIENT_ID: z.string().min(1),
    TESLA_CLIENT_SECRET: z.string().min(1),
    TESLA_REDIRECT_URI: z.string().url(),
    SESSION_SECRET: z.string().min(32),
    ENCRYPTION_KEY: z.string().min(64),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    TESLA_CLIENT_ID: process.env.TESLA_CLIENT_ID,
    TESLA_CLIENT_SECRET: process.env.TESLA_CLIENT_SECRET,
    TESLA_REDIRECT_URI: process.env.TESLA_REDIRECT_URI,
    SESSION_SECRET: process.env.SESSION_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
