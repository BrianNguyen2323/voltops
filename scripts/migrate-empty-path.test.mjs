// B005: empty DATABASE_PATH must fall back to ./data/voltops.db (not a temp DB);
// docker-smoke.sh's dummy .env must carry an empty DATABASE_PATH= line.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("migrate.mjs with DATABASE_PATH='' creates ./data/voltops.db", () => {
  const dir = mkdtempSync(join(tmpdir(), "voltops-mig-"));
  try {
    cpSync(join(root, "drizzle"), join(dir, "drizzle"), { recursive: true });
    const r = spawnSync(
      process.execPath,
      [join(root, "scripts", "migrate.mjs")],
      { cwd: dir, env: { ...process.env, DATABASE_PATH: "" }, encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(dir, "data", "voltops.db")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("docker-smoke.sh dummy .env has an empty DATABASE_PATH= line", () => {
  const sh = readFileSync(join(root, "scripts", "docker-smoke.sh"), "utf8");
  assert.match(sh, /^DATABASE_PATH=$/m);
});
