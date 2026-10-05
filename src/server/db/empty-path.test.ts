/** B005: an empty DATABASE_PATH must fall back to ./data/voltops.db, not a temp DB. */
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const g = globalThis as unknown as {
  __voltopsDb?: { $client: { close(): void } };
};
const cwd = process.cwd();
let dir: string;
afterEach(() => {
  g.__voltopsDb?.$client.close();
  delete g.__voltopsDb;
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
});

it("default db with DATABASE_PATH='' opens ./data/voltops.db", async () => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "voltops-empty-")));
  process.chdir(dir);
  process.env.DATABASE_PATH = "";
  vi.resetModules();
  const { db } = await import("~/server/db");
  db.$client.prepare("CREATE TABLE t (x)").run();
  expect(existsSync(join(dir, "data", "voltops.db"))).toBe(true);
  expect(db.$client.name).not.toBe("");
});
