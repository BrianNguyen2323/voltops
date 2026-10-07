import { createEnv } from "@t3-oss/env-nextjs";
import { server } from "./env.schema.js";

export const env = createEnv({
  server,
  client: {},
  // Server vars are read live from process.env (no client vars to inline).
  runtimeEnv: /** @type {never} */ (process.env),
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
