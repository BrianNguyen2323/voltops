import { z } from "zod";

export const server = {
  DATABASE_PATH: z.string().min(1).optional(),
  AUTH_DISABLED: z.enum(["true"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TESLA_CLIENT_ID: z.string().min(1),
  TESLA_CLIENT_SECRET: z.string().min(1),
  TESLA_REDIRECT_URI: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  VOLTOPS_SECRET_KEY: z.string().min(64),
};
