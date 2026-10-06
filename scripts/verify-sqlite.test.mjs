/**
 * B003 contract for scripts/verify-tesla-gets.mjs (SQLite token store):
 *
 *   export function sqliteTokenStore(path)
 *     -> { loadToken(), saveToken(t), close() }
 *     Opens better-sqlite3 at `path` (busy_timeout=5000). Table `credentials`, row id=1.
 *     loadToken(): async; returns { encryptedRefreshToken, iv } from the row.
 *       No row -> throws Error with message exactly
 *       `No Tesla credentials in ${path}. Connect Tesla in the app first.`
 *     saveToken({ encryptedRefreshToken, iv, accessTokenExpiresAt: Date }): async; UPDATEs
 *       row id=1: encrypted_refresh_token, iv, access_token_expires_at (int ms UTC),
 *       updated_at (int ms). Other columns (scope) untouched. Never inserts.
 *   export const missingEnv(env) -> required = TESLA_CLIENT_ID, TESLA_CLIENT_SECRET,
 *     VOLTOPS_SECRET_KEY (in that order). DATABASE_PATH is optional (default ./data/voltops.db);
 *     DATABASE_URL and ENCRYPTION_KEY are no longer required/listed.
 *   main() uses sqliteTokenStore(env.DATABASE_PATH ?? "./data/voltops.db") and
 *     env.VOLTOPS_SECRET_KEY as the encryption key; usage comment updated.
 *
 * NOTE: the two pre-existing missingEnv tests in verify-tesla-gets.test.mjs were edited to the new
 * required-env list (unavoidable contract change); the other 35 are untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import * as mod from "./verify-tesla-gets.mjs";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

function tempDb({ seed } = {}) {
  const path = join(mkdtempSync(join(tmpdir(), "voltops-b003-")), "t.db");
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_PATH: path },
    stdio: "pipe",
  });
  if (seed) {
    const db = new Database(path);
    db.prepare(
      "INSERT INTO credentials (id, encrypted_refresh_token, iv, scope, access_token_expires_at, updated_at) VALUES (1, ?, ?, 'openid', 1000, 2000)",
    ).run("CIPHER-OLD", "IV-OLD");
    db.close();
  }
  return path;
}
const readRow = (path) => {
  const db = new Database(path, { readonly: true });
  const r = db.prepare("SELECT * FROM credentials WHERE id = 1").get();
  db.close();
  return r;
};

test("sqliteTokenStore is exported", () => {
  assert.equal(typeof mod.sqliteTokenStore, "function");
});

test("loadToken maps the credentials row to { encryptedRefreshToken, iv }", async () => {
  const path = tempDb({ seed: true });
  const store = mod.sqliteTokenStore(path);
  try {
    const row = await store.loadToken();
    assert.equal(row.encryptedRefreshToken, "CIPHER-OLD");
    assert.equal(row.iv, "IV-OLD");
  } finally {
    store.close();
  }
});

test("saveToken updates the same row (ms ints, scope kept, no extra rows)", async () => {
  const path = tempDb({ seed: true });
  const store = mod.sqliteTokenStore(path);
  const before = Date.now();
  const exp = new Date(1_900_000_000_000);
  try {
    await store.saveToken({ encryptedRefreshToken: "CIPHER-NEW", iv: "IV-NEW", accessTokenExpiresAt: exp });
    const loaded = await store.loadToken();
    assert.equal(loaded.encryptedRefreshToken, "CIPHER-NEW");
    assert.equal(loaded.iv, "IV-NEW");
  } finally {
    store.close();
  }
  const r = readRow(path);
  assert.equal(r.encrypted_refresh_token, "CIPHER-NEW");
  assert.equal(r.iv, "IV-NEW");
  assert.equal(r.access_token_expires_at, 1_900_000_000_000);
  assert.ok(Number.isInteger(r.updated_at) && r.updated_at >= before);
  assert.equal(r.scope, "openid");
  const db = new Database(path, { readonly: true });
  assert.equal(db.prepare("SELECT count(*) c FROM credentials").get().c, 1);
  db.close();
});

test("loadToken with no row throws the exact error", async () => {
  const path = tempDb();
  const store = mod.sqliteTokenStore(path);
  try {
    await assert.rejects(store.loadToken(), {
      message: `No Tesla credentials in ${path}. Connect Tesla in the app first.`,
    });
  } finally {
    store.close();
  }
});

test("sqliteTokenStore with non-existent path throws and no file is created", () => {
  const path = join(tmpdir(), `voltops-nonexistent-${Date.now()}.db`);
  assert.throws(() => {
    mod.sqliteTokenStore(path);
  });
  assert.equal(existsSync(path), false, "file should not be created");
});

test("missingEnv lists VOLTOPS_SECRET_KEY, not ENCRYPTION_KEY/DATABASE_URL", () => {
  const all = ["TESLA_CLIENT_ID", "TESLA_CLIENT_SECRET", "VOLTOPS_SECRET_KEY"];
  assert.deepEqual(mod.missingEnv({}), all);
  assert.deepEqual(mod.missingEnv({ ENCRYPTION_KEY: "x", DATABASE_URL: "y" }), all);
});

test("script source no longer references postgres / DATABASE_URL / ENCRYPTION_KEY", () => {
  const src = readFileSync(new URL("./verify-tesla-gets.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /postgres|DATABASE_URL|ENCRYPTION_KEY|voltops_tesla_token/);
});
