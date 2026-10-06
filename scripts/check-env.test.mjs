/**
 * B007 contract for scripts/check-env.mjs:
 *   export function checkEnv(envObject) -> string[]   (error lines "KEY: <zod message>", never values)
 *   CLI (entry point only): prints lines, exit 1 on errors, 0 (silent) on good env;
 *   SKIP_ENV_VALIDATION set -> exit 0.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkEnv } from "./check-env.mjs";

const script = fileURLToPath(new URL("./check-env.mjs", import.meta.url));

const good = {
  TESLA_CLIENT_ID: "client-id-value",
  TESLA_CLIENT_SECRET: "client-secret-value",
  TESLA_REDIRECT_URI: "http://localhost:3000/api/auth/callback",
  SESSION_SECRET: "s".repeat(32),
  VOLTOPS_SECRET_KEY: "ab".repeat(32),
};

test("valid env -> no errors", () => {
  assert.deepEqual(checkEnv(good), []);
});

test("missing key -> line naming it", () => {
  const { TESLA_CLIENT_ID: _, ...env } = good;
  const lines = checkEnv(env);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^TESLA_CLIENT_ID: /);
});

test("empty string is treated as missing", () => {
  const lines = checkEnv({ ...good, TESLA_CLIENT_SECRET: "" });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^TESLA_CLIENT_SECRET: /);
});

test("SESSION_SECRET shorter than 32 -> error", () => {
  const lines = checkEnv({ ...good, SESSION_SECRET: "tooshort" });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^SESSION_SECRET: /);
});

test("ENCRYPTION_KEY without VOLTOPS_SECRET_KEY -> rename hint", () => {
  const { VOLTOPS_SECRET_KEY: _, ...env } = good;
  const lines = checkEnv({ ...env, ENCRYPTION_KEY: "e".repeat(64) });
  assert.ok(
    lines.includes(
      "VOLTOPS_SECRET_KEY missing (old name: ENCRYPTION_KEY — rename it)",
    ),
    lines.join("\n"),
  );
});

test("no output line contains an input value", () => {
  const env = {
    ...good,
    SESSION_SECRET: "leakcheck-short",
    TESLA_REDIRECT_URI: "not-a-url-leakcheck",
    VOLTOPS_SECRET_KEY: "leakcheck-key",
    ENCRYPTION_KEY: "leakcheck-old-key",
  };
  const out = checkEnv(env).join("\n");
  assert.ok(out.length > 0);
  assert.ok(!out.includes("leakcheck"), out);
  assert.ok(!out.includes(good.TESLA_CLIENT_SECRET), out);
});

const run = (env) =>
  spawnSync(process.execPath, [script], {
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
  });

test("CLI exits 1 on bad env, names key, hides value", () => {
  const r = run({ ...good, SESSION_SECRET: "leakcheck-short" });
  assert.equal(r.status, 1);
  const out = r.stdout + r.stderr;
  assert.match(out, /SESSION_SECRET/);
  assert.ok(!out.includes("leakcheck-short"), out);
});

test("CLI exits 0 and prints nothing on good env", () => {
  const r = run(good);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout + r.stderr, "");
});

test("CLI exits 0 with SKIP_ENV_VALIDATION even if env is bad", () => {
  const r = run({ SKIP_ENV_VALIDATION: "1" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
