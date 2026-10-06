import { pathToFileURL } from "node:url";
import { z } from "zod";
import { server } from "../src/env.schema.js";

const schema = z.object(server);

export function checkEnv(env) {
  const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  const r = schema.safeParse(clean);
  if (r.success) return [];
  return r.error.issues.map((i) => {
    const key = i.path[0];
    if (key === "VOLTOPS_SECRET_KEY" && clean.VOLTOPS_SECRET_KEY === undefined && clean.ENCRYPTION_KEY)
      return "VOLTOPS_SECRET_KEY missing (old name: ENCRYPTION_KEY — rename it)";
    return `${key}: ${i.message}`;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && !process.env.SKIP_ENV_VALIDATION) {
  const lines = checkEnv(process.env);
  if (lines.length) {
    console.error(lines.join("\n"));
    process.exit(1);
  }
}
