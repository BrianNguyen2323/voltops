import { z } from "zod";

export const server = {
  DATABASE_PATH: z.string().min(1).optional(),
  AUTH_DISABLED: z.enum(["true"], { errorMap: () => ({ message: 'must be "true" or unset' }) }).optional(),
  NODE_ENV: z.enum(["development", "test", "production"], { errorMap: () => ({ message: "must be development, test or production" }) }).default("development"),
  TESLA_CLIENT_ID: z.string().min(1),
  TESLA_CLIENT_SECRET: z.string().min(1),
  TESLA_REDIRECT_URI: z.string().url(),
  TESLA_FLEET_BASE_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32),
  VOLTOPS_SECRET_KEY: z.string().min(64),
  SITE_LATITUDE: z.coerce.number().min(-90).max(90).optional(),
  SITE_LONGITUDE: z.coerce.number().min(-180).max(180).optional(),
  TEMPERATURE_UNIT: z.enum(["F", "C"]).optional(),
};
