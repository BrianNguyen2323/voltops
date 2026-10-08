import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "~/server/db";

let dir: string;
let db: ReturnType<typeof openDb>;
let siteId: number;

const now = Date.now();
const run = (q: string, ...p: unknown[]) => db.$client.prepare(q).run(...p);
const count = (t: string) =>
  (db.$client.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number })
    .n;
const cols = (t: string) =>
  db.$client.prepare(`PRAGMA table_info(${t})`).all() as {
    name: string;
    notnull: number;
    pk: number;
  }[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "voltops-eh-"));
  db = openDb(join(dir, "test.db"));
  migrate(db, { migrationsFolder: "drizzle" });
  siteId = Number(
    run(
      "INSERT INTO sites (source, external_id, created_at, updated_at) VALUES ('fleet-api', 'abc', ?, ?)",
      now,
      now,
    ).lastInsertRowid,
  );
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

const insInterval = (site: number, start: number, solar = 1) =>
  run(
    "INSERT INTO energy_intervals (site_id, start, solar_wh, load_wh, grid_import_wh, grid_export_wh, battery_charge_wh, battery_discharge_wh) VALUES (?, ?, ?, 2, 3, 4, 5, 6)",
    site,
    start,
    solar,
  );
const insSample = (site: number, t: number) =>
  run(
    "INSERT INTO samples (site_id, ts, solar_w, load_w, battery_w, grid_w, soc_pct, grid_status) VALUES (?, ?, 1, 2, -3, 4, 55.5, 'Active')",
    site,
    t,
  );
const insObserved = (site: number, hour: number) =>
  run(
    "INSERT INTO weather_observed (site_id, hour, temp_c, cloud_pct, ghi_wm2, precip_mm) VALUES (?, ?, 1.5, 20, 300.5, 0)",
    site,
    hour,
  );
const insForecast = (site: number, issued: number, hour: number) =>
  run(
    "INSERT INTO weather_forecast (site_id, issued_at, hour, temp_c, cloud_pct, ghi_wm2, precip_mm, precip_prob_pct) VALUES (?, ?, ?, 1.5, 20, 300.5, 0, 10)",
    site,
    issued,
    hour,
  );

const tables: [string, string[], (s: number, a: number) => unknown][] = [
  ["energy_intervals", ["site_id", "start"], (s, a) => insInterval(s, a)],
  ["samples", ["site_id", "ts"], (s, a) => insSample(s, a)],
  ["weather_observed", ["site_id", "hour"], (s, a) => insObserved(s, a)],
  [
    "weather_forecast",
    ["site_id", "issued_at", "hour"],
    (s, a) => insForecast(s, a, a),
  ],
];

describe.each(tables)("%s", (table, pk, insert) => {
  it("exists with the expected primary key", () => {
    const c = cols(table);
    expect(
      c
        .filter((x) => x.pk > 0)
        .map((x) => x.name)
        .sort(),
    ).toEqual([...pk].sort());
  });

  it("has all columns not null", () => {
    const c = cols(table);
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((x) => x.notnull === 1 || x.pk > 0)).toBe(true);
  });

  it("inserts rows and rejects a duplicate primary key", () => {
    insert(siteId, 1000);
    expect(() => insert(siteId, 1000)).toThrow(/UNIQUE|PRIMARY/i);
    expect(() => insert(siteId, 2000)).not.toThrow();
    expect(count(table)).toBe(2);
  });

  it("rejects rows for a nonexistent site (FK)", () => {
    expect(() => insert(siteId + 999, 1000)).toThrow(/FOREIGN KEY/i);
  });

  it("cascades deletion with the site", () => {
    insert(siteId, 1000);
    expect(count(table)).toBe(1);
    run("DELETE FROM sites WHERE id=?", siteId);
    expect(count(table)).toBe(0);
  });
});

describe("energy_intervals", () => {
  it("same start for different sites is allowed", () => {
    const other = Number(
      run(
        "INSERT INTO sites (source, external_id, created_at, updated_at) VALUES ('fleet-api', 'def', ?, ?)",
        now,
        now,
      ).lastInsertRowid,
    );
    insInterval(siteId, 1000);
    expect(() => insInterval(other, 1000)).not.toThrow();
  });

  it("upserts on (site_id, start)", () => {
    insInterval(siteId, 1000, 1);
    run(
      "INSERT INTO energy_intervals (site_id, start, solar_wh, load_wh, grid_import_wh, grid_export_wh, battery_charge_wh, battery_discharge_wh) VALUES (?, 1000, 99, 2, 3, 4, 5, 6) ON CONFLICT (site_id, start) DO UPDATE SET solar_wh = excluded.solar_wh",
      siteId,
    );
    expect(count("energy_intervals")).toBe(1);
    expect(
      (
        db.$client.prepare("SELECT solar_wh FROM energy_intervals").get() as {
          solar_wh: number;
        }
      ).solar_wh,
    ).toBe(99);
  });

  it("rejects a null measurement", () => {
    expect(() =>
      run(
        "INSERT INTO energy_intervals (site_id, start, solar_wh) VALUES (?, 1000, 1)",
        siteId,
      ),
    ).toThrow(/NOT NULL/i);
  });
});

describe("weather_forecast", () => {
  it("keeps forecasts issued at different times for the same hour", () => {
    insForecast(siteId, 100, 5000);
    insForecast(siteId, 200, 5000);
    expect(count("weather_forecast")).toBe(2);
  });
});

describe("samples", () => {
  it("stores soc_pct as a real and keeps negative battery_w", () => {
    insSample(siteId, 1000);
    const r = db.$client
      .prepare("SELECT soc_pct, battery_w FROM samples")
      .get() as {
      soc_pct: number;
      battery_w: number;
    };
    expect(r).toEqual({ soc_pct: 55.5, battery_w: -3 });
  });
});

describe("sites new columns", () => {
  it("backup_reserve_pct and temperature_unit exist and are nullable", () => {
    const c = cols("sites");
    for (const n of ["backup_reserve_pct", "temperature_unit"]) {
      const col = c.find((x) => x.name === n);
      expect(col, n).toBeDefined();
      expect(col!.notnull).toBe(0);
    }
    const r = db.$client
      .prepare(
        "SELECT backup_reserve_pct, temperature_unit FROM sites WHERE id=?",
      )
      .get(siteId);
    expect(r).toEqual({ backup_reserve_pct: null, temperature_unit: null });
  });
});
