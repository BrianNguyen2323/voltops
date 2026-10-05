import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_PATH: z.string().min(1).optional(),
    AUTH_DISABLED: z.enum(["true"]).optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    TESLA_CLIENT_ID: z.string().min(1),
    TESLA_CLIENT_SECRET: z.string().min(1),
    TESLA_REDIRECT_URI: z.string().url(),
    SESSION_SECRET: z.string().min(32),
    VOLTOPS_SECRET_KEY: z.string().min(64),
  },
  client: {},
  runtimeEnv: {
    DATABASE_PATH: process.env.DATABASE_PATH,
    AUTH_DISABLED: process.env.AUTH_DISABLED,
    NODE_ENV: process.env.NODE_ENV,
    TESLA_CLIENT_ID: process.env.TESLA_CLIENT_ID,
    TESLA_CLIENT_SECRET: process.env.TESLA_CLIENT_SECRET,
    TESLA_REDIRECT_URI: process.env.TESLA_REDIRECT_URI,
    SESSION_SECRET: process.env.SESSION_SECRET,
    VOLTOPS_SECRET_KEY: process.env.VOLTOPS_SECRET_KEY,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
