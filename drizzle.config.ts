import { config } from "dotenv";
import { type Config } from "drizzle-kit";

config({ path: ".env.local" });

export default {
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
  tablesFilter: ["voltops_*"],
} satisfies Config;
