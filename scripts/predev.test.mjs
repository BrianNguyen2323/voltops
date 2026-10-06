// B008: package.json `predev` must migrate a fresh DB before `next dev`.
// Runs in a temp cwd (scripts/ + drizzle/ copied, node_modules junctioned) so no real .env or ./data is touched.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

const root = resolve(import.meta.dirname, "..");
const PREDEV = "node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate.mjs";

test("package.json scripts.predev is the migrate command", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts.predev, PREDEV);
});

test("predev command creates the credentials table and is idempotent", () => {
  const dir = mkdtempSync(join(tmpdir(), "voltops-predev-"));
  try {
    cpSync(join(root, "scripts"), join(dir, "scripts"), { recursive: true });
    cpSync(join(root, "drizzle"), join(dir, "drizzle"), { recursive: true });
    symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "junction");
    const db = join(dir, "t.db");
    const [cmd, ...args] = PREDEV.split(" ");
    const run = () =>
      execFileSync(process.execPath, args, {
        cwd: dir,
        env: { ...process.env, DATABASE_PATH: db },
        timeout: 30_000,
        stdio: "pipe",
      });
    assert.equal(cmd, "node");
    run();
    assert.ok(existsSync(db));
    const c = new Database(db, { readonly: true });
    try {
      const row = c.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='credentials'").get();
      assert.ok(row, "credentials table missing");
    } finally {
      c.close();
    }
    run();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
