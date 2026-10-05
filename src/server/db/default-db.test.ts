/**
 * CONTRACT: `db` from ~/server/db is a lazy Proxy; first property access opens
 * env DATABASE_PATH (B001 carry-over nit 4). Importing must not create the file.
 * (Likely already passes: it is a regression guard for the existing Proxy.)
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, expect, it, vi } from "vitest";

const g = globalThis as unknown as {
  __voltopsDb?: { $client: { close(): void } };
};
let dir: string;
afterEach(() => {
  g.__voltopsDb?.$client.close();
  delete g.__voltopsDb;
  rmSync(dir, { recursive: true, force: true });
});

it("default db export opens DATABASE_PATH lazily and works", async () => {
  dir = mkdtempSync(join(tmpdir(), "voltops-default-"));
  const path = join(dir, "sub", "d.db");
  process.env.DATABASE_PATH = path;
  const { db } = await import("~/server/db");
  expect(existsSync(path)).toBe(false);
  migrate(db, { migrationsFolder: "drizzle" });
  expect(existsSync(path)).toBe(true);
  db.$client
    .prepare("INSERT INTO admin (id, password_hash) VALUES (1, 'x')")
    .run();
  expect(db.$client.prepare("SELECT count(*) c FROM admin").get()).toEqual({
    c: 1,
  });
});

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
