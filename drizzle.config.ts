import { type Config } from "drizzle-kit";

export default {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- "" must fall back too
  dbCredentials: { url: process.env.DATABASE_PATH || "./data/voltops.db" },
} satisfies Config;
