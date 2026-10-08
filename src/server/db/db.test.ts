import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "~/server/db";
import * as schema from "~/server/db/schema";

let dir: string;
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "voltops-"));
  db = openDb(join(dir, "test.db"));
  migrate(db, { migrationsFolder: "drizzle" });
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

const now = Date.now();
const sql = (q: string, ...p: unknown[]) => db.$client.prepare(q).run(...p);
const addSite = (ext: string) =>
  sql(
    "INSERT INTO sites (source, external_id, created_at, updated_at) VALUES ('fleet-api', ?, ?, ?)",
    ext,
    now,
    now,
  );

describe("schema exports", () => {
  it("exports the four tables", () => {
    expect(schema.admin).toBeDefined();
    expect(schema.credentials).toBeDefined();
    expect(schema.sites).toBeDefined();
    expect(schema.tariffSchedule).toBeDefined();
  });
});

describe("openDb + migrations", () => {
  it("applies migrations to a fresh file and creates the tables", () => {
    const names = (
      db.$client
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]
    ).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "admin",
        "credentials",
        "sites",
        "tariff_schedule",
      ]),
    );
    expect(names).not.toContain("users");
    expect(names).not.toContain("tesla_token");
  });

  it("applies pragmas: WAL, foreign_keys, busy_timeout", () => {
    expect(db.$client.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.$client.pragma("busy_timeout", { simple: true })).toBe(5000);
  });
});

describe("constraints", () => {
  it("allows admin id=1 but rejects a second admin row", () => {
    sql(
      "INSERT INTO admin (id, password_hash, created_at) VALUES (1, 'h', ?)",
      now,
    );
    expect(() =>
      sql(
        "INSERT INTO admin (id, password_hash, created_at) VALUES (2, 'h', ?)",
        now,
      ),
    ).toThrow();
  });

  it("rejects credentials with id != 1", () => {
    const ins = (id: number) =>
      sql(
        "INSERT INTO credentials (id, encrypted_refresh_token, iv, updated_at) VALUES (?, 'x', 'y', ?)",
        id,
        now,
      );
    ins(1);
    expect(() => ins(2)).toThrow();
  });

  it("enforces unique sites.external_id", () => {
    addSite("abc");
    expect(() => addSite("abc")).toThrow(/UNIQUE/i);
    expect(() => addSite("def")).not.toThrow();
  });

  it("cascades site deletion to tariff_schedule", () => {
    addSite("abc");
    const id = (
      db.$client
        .prepare("SELECT id FROM sites WHERE external_id='abc'")
        .get() as {
        id: number;
      }
    ).id;
    sql(
      "INSERT INTO tariff_schedule (site_id, content, updated_at) VALUES (?, '{}', ?)",
      id,
      now,
    );
    const count = () =>
      (
        db.$client
          .prepare("SELECT count(*) AS n FROM tariff_schedule")
          .get() as {
          n: number;
        }
      ).n;
    expect(count()).toBe(1);
    sql("DELETE FROM sites WHERE id=?", id);
    expect(count()).toBe(0);
  });
});
