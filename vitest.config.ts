import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

process.env.SKIP_ENV_VALIDATION = "1";

export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
