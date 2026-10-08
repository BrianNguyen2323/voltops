import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDays, localMidnight } from "~/lib/time";
import { openDb } from "~/server/db";
import * as schema from "~/server/db/schema";
import { completeDays, peakHistory } from "./peak";

const TZ = "America/Los_Angeles";
const H = 3_600_000;
const FIVE = 300_000;
const FROM = 960; // 16:00
const TO = 1260; // 21:00

let dir: string;
let db: ReturnType<typeof openDb>;
let siteId: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "voltops-peak-"));
  db = openDb(join(dir, "test.db"));
  migrate(db, { migrationsFolder: "drizzle" });
  const [site] = db
    .insert(schema.sites)
    .values({ source: "fleet-api", externalId: "EXT-1", timezone: TZ })
    .returning({ id: schema.sites.id })
    .all();
  siteId = site!.id;
});
afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Seeds every 5-min slot of local `date` (minus `skip` slots from the end).
 * Slots inside the hard-coded UTC window [16:00, 21:00) local get `w` Wh, others 1 Wh.
 * `offsetH` = hours local is behind UTC at 16:00 that day (7 PDT, 8 PST).
 */
function seedDay(date: string, w: number, offsetH: number, skip = 0) {
  const from = localMidnight(date, TZ);
  const to = localMidnight(addDays(date, 1), TZ);
  const winFrom = Date.parse(`${date}T16:00:00Z`) + offsetH * H;
  const winTo = winFrom + 5 * H;
  const rows = [];
  for (let t = from; t < to - skip * FIVE; t += FIVE) {
    rows.push({
      siteId,
      start: new Date(t),
      solarWh: 0,
      gridImportWh: 0,
      gridExportWh: 0,
      batteryChargeWh: 0,
      batteryDischargeWh: 0,
      loadWh: t >= winFrom && t < winTo ? w : 1,
    });
  }
  for (let i = 0; i < rows.length; i += 500) {
    db.insert(schema.energyIntervals)
      .values(rows.slice(i, i + 500))
      .run();
  }
  return rows.length;
}

/** Hourly observed weather across local `date`, max temp = `high`. */
function seedWeather(date: string, high: number) {
  const from = localMidnight(date, TZ);
  const to = localMidnight(addDays(date, 1), TZ);
  const rows = [];
  for (let t = from, i = 0; t < to; t += H, i++) {
    rows.push({
      siteId,
      hour: new Date(t),
      tempC: i === 14 ? high : high - 5,
      cloudPct: 0,
      ghiWm2: 0,
      precipMm: 0,
    });
  }
  db.insert(schema.weatherObserved).values(rows).run();
}

const opts = (days: string[], highC = 20) => ({
  tz: TZ,
  days,
  fromMin: FROM,
  toMin: TO,
  highC,
});

describe("completeDays", () => {
  it("counts a full day, rejects one missing an interval, excludes today even if full", () => {
    expect(seedDay("2026-05-10", 1, 7)).toBe(288);
    seedDay("2026-05-11", 1, 7, 1); // 287 slots
    seedDay("2026-05-12", 1, 7);
    seedDay("2026-05-13", 1, 7); // today
    expect(completeDays(db, siteId, TZ, "2026-05-13")).toEqual([
      "2026-05-10",
      "2026-05-12",
    ]);
  });

  it("uses 276/300 slots on DST days", () => {
    expect(seedDay("2026-03-08", 1, 7)).toBe(276);
    expect(seedDay("2026-11-01", 1, 8)).toBe(300);
    seedDay("2026-05-10", 1, 7);
    expect(completeDays(db, siteId, TZ, "2026-11-02")).toEqual([
      "2026-03-08",
      "2026-05-10",
      "2026-11-01",
    ]);
  });

  it("rejects a DST day with the wrong slot count", () => {
    seedDay("2026-03-08", 1, 7, 12); // 264 of 276
    expect(completeDays(db, siteId, TZ, "2026-05-01")).toEqual([]);
  });

  it("is empty without data", () => {
    expect(completeDays(db, siteId, TZ, "2026-05-13")).toEqual([]);
  });
});

describe("peakHistory: query 1 (historyAvgWh)", () => {
  it("averages hand-computed window sums, incl. DST days with shifted UTC offsets", () => {
    seedDay("2026-05-10", 10, 7); // 60 slots * 10 = 600
    seedDay("2026-05-11", 20, 7); // 1200
    seedDay("2026-03-08", 30, 7); // 1800 (PDT at 16:00; 276 slots)
    seedDay("2026-11-01", 40, 8); // 2400 (PST at 16:00; 300 slots)
    const days = ["2026-03-08", "2026-05-10", "2026-05-11", "2026-11-01"];
    const r = peakHistory(db, siteId, opts(days));
    expect(r?.historyAvgWh).toBe(1500);
    expect(r?.highC).toBe(20);
  });

  it("ignores intervals outside the window and rounds to an integer", () => {
    // six days of 600 and one of 660: (3600 + 660) / 7 = 608.57 -> 609
    // (outside-window slots hold 1 Wh each and must not leak in)
    const days = [1, 2, 3, 4, 5, 6, 7].map((d) => `2026-05-0${d}`);
    days.forEach((d, i) => seedDay(d, i === 6 ? 11 : 10, 7));
    expect(peakHistory(db, siteId, opts(days))?.historyAvgWh).toBe(609);
  });

  it("returns null when days is empty", () => {
    seedDay("2026-05-10", 10, 7);
    expect(peakHistory(db, siteId, opts([]))).toBeNull();
  });
});

describe("peakHistory: query 2 (similar temperature)", () => {
  const days = [
    "2026-05-01",
    "2026-05-02",
    "2026-05-03",
    "2026-05-04",
    "2026-05-05",
    "2026-05-06",
  ];
  beforeEach(() => {
    seedDay("2026-05-01", 10, 7);
    seedWeather("2026-05-01", 20.0); // 600
    seedDay("2026-05-02", 20, 7);
    seedWeather("2026-05-02", 23.0); // 1200, +3 in
    seedDay("2026-05-03", 31, 7);
    seedWeather("2026-05-03", 17.0); // 1860, -3 in
    seedDay("2026-05-04", 1000, 7);
    seedWeather("2026-05-04", 23.1); // out
    seedDay("2026-05-05", 1000, 7);
    seedWeather("2026-05-05", 16.9); // out
    seedDay("2026-05-06", 1000, 7); // no weather: never matches
  });

  it("includes |diff| = 3 exactly, excludes 3.1, skips days without weather", () => {
    const r = peakHistory(db, siteId, opts(days, 20));
    expect(r).toEqual({
      historyAvgWh: 30610,
      highC: 20,
      similarTempDays: 3,
      similarTempAvgWh: 1220,
    });
  });

  it("gives null average when fewer than 3 days match, with the right count", () => {
    // highC 23.1 matches 23.1 and 23.0 only (20.0 is 3.1 away)
    const r = peakHistory(db, siteId, opts(days, 23.1));
    expect(r?.similarTempDays).toBe(2);
    expect(r?.similarTempAvgWh).toBeNull();
    const none = peakHistory(db, siteId, opts(days, 40));
    expect(none?.similarTempDays).toBe(0);
    expect(none?.similarTempAvgWh).toBeNull();
  });
});

describe("peakHistory: scale", () => {
  it("handles 3,653 day bounds and still averages only days with data", () => {
    seedDay("2026-05-10", 10, 7); // 600
    seedDay("2026-05-11", 20, 7); // 1200
    seedWeather("2026-05-10", 20);
    const days: string[] = [];
    for (let i = 3652; i >= 0; i--) days.push(addDays("2026-05-11", -i));
    expect(days).toHaveLength(3653);
    const r = peakHistory(db, siteId, opts(days));
    expect(r?.historyAvgWh).toBe(900);
    expect(r?.similarTempDays).toBe(1);
    expect(r?.similarTempAvgWh).toBeNull();
  });
});
