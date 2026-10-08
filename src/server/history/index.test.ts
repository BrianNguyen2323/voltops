import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EnergyInterval } from "~/lib/core/types";
import { addDays, localMidnight, localTime } from "~/lib/time";
import { openDb } from "~/server/db";
import * as schema from "~/server/db/schema";
import { energyHistory, type ObservedHour } from "./index";

const TZ = "America/Los_Angeles";
const H = 3_600_000;
const FIVE = 300_000;
const FROM = 960; // 16:00
const TO = 1260; // 21:00

let dir: string;
let db: ReturnType<typeof openDb>;
let siteId: number;
let otherId: number;

const mkSite = (externalId: string) =>
  db
    .insert(schema.sites)
    .values({ source: "fleet-api", externalId, timezone: TZ })
    .returning({ id: schema.sites.id })
    .all()[0]!.id;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "voltops-history-"));
  db = openDb(join(dir, "test.db"));
  migrate(db, { migrationsFolder: "drizzle" });
  siteId = mkSite("EXT-1");
  otherId = mkSite("EXT-2");
});
afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

const hist = (id = siteId, timezone: string | null = TZ) =>
  energyHistory(db, { id, timezone });
type Hist = ReturnType<typeof hist>;

const iv = (t: number, load = 2): EnergyInterval => ({
  start: new Date(t).toISOString(),
  solarWh: 1,
  loadWh: load,
  gridImportWh: 3,
  gridExportWh: 4,
  batteryChargeWh: 5,
  batteryDischargeWh: 6,
});

/** Every 5-min slot of local `date` (minus `skip` from the end); `load(t)` gives loadWh. Returns the count. */
function seedDay(
  h: Hist,
  date: string,
  {
    tz = TZ,
    skip = 0,
    load = () => 2,
  }: { tz?: string; skip?: number; load?: (t: number) => number } = {},
) {
  const from = localMidnight(date, tz);
  const to = localMidnight(addDays(date, 1), tz);
  const rows: EnergyInterval[] = [];
  for (let t = from; t < to - skip * FIVE; t += FIVE) rows.push(iv(t, load(t)));
  h.putIntervals(rows);
  return rows.length;
}

const obs = (hour: number, tempC = 10): ObservedHour => ({
  hour,
  tempC,
  cloudPct: 20,
  ghiWm2: 300,
  precipMm: 0.5,
});

/** Hourly observed weather across local `date`; max temp = `high` (hour index 14). */
function seedWeather(h: Hist, date: string, high: number) {
  const from = localMidnight(date, TZ);
  const to = localMidnight(addDays(date, 1), TZ);
  const rows: ObservedHour[] = [];
  for (let t = from, i = 0; t < to; t += H, i++)
    rows.push(obs(t, i === 14 ? high : high - 5));
  h.putObserved(rows);
}

describe("upserts", () => {
  it("putIntervals overwrites all 6 Wh columns on (site, start) and leaves other Sites alone", () => {
    const t = Date.parse("2026-05-10T12:00:00Z");
    const a = hist();
    const b = hist(otherId);
    a.putIntervals([iv(t)]);
    b.putIntervals([iv(t, 99)]);
    a.putIntervals([
      {
        start: new Date(t).toISOString(),
        solarWh: 11,
        loadWh: 12,
        gridImportWh: 13,
        gridExportWh: 14,
        batteryChargeWh: 15,
        batteryDischargeWh: 16,
      },
    ]);
    expect(a.hours("2026-05-10", "2026-05-11")).toEqual([
      {
        start: t,
        solarWh: 11,
        loadWh: 12,
        gridImportWh: 13,
        gridExportWh: 14,
        batteryChargeWh: 15,
        batteryDischargeWh: 16,
      },
    ]);
    expect(b.hours("2026-05-10", "2026-05-11")[0]?.loadWh).toBe(99);
    expect(db.select().from(schema.energyIntervals).all()).toHaveLength(2);
  });

  it("putObserved overwrites all 4 columns on (site, hour) and leaves other Sites alone", () => {
    const t = Date.parse("2026-05-10T12:00:00Z");
    const a = hist();
    const b = hist(otherId);
    a.putObserved([obs(t, 10)]);
    b.putObserved([obs(t, 30)]);
    a.putObserved([
      { hour: t, tempC: 21, cloudPct: 22, ghiWm2: 23, precipMm: 24 },
    ]);
    expect(a.observed("2026-05-10", "2026-05-11")).toEqual([
      { hour: t, tempC: 21, cloudPct: 22, ghiWm2: 23, precipMm: 24 },
    ]);
    expect(b.observed("2026-05-10", "2026-05-11")).toEqual([obs(t, 30)]);
  });
});

describe("hours", () => {
  it("sums each UTC hour bucket, ascending, over [localMidnight(from), localMidnight(to))", () => {
    const h = hist();
    // written out of order, 12 slots/hour
    seedDay(h, "2026-05-11");
    seedDay(h, "2026-05-10");
    seedDay(h, "2026-05-12");
    const r = h.hours("2026-05-10", "2026-05-12");
    expect(r).toHaveLength(48);
    expect(r[0]?.start).toBe(localMidnight("2026-05-10", TZ));
    expect(r[47]?.start).toBe(localMidnight("2026-05-12", TZ) - H);
    expect(r.map((x) => x.start)).toEqual(
      [...r.map((x) => x.start)].sort((x, y) => x - y),
    );
    expect(r[5]).toEqual({
      start: localMidnight("2026-05-10", TZ) + 5 * H,
      solarWh: 12,
      loadWh: 24,
      gridImportWh: 36,
      gridExportWh: 48,
      batteryChargeWh: 60,
      batteryDischargeWh: 72,
    });
  });

  it("sums a partial hour and excludes intervals outside the range", () => {
    const h = hist();
    const m = localMidnight("2026-05-10", TZ);
    h.putIntervals([
      iv(m - FIVE, 100),
      iv(m, 1),
      iv(m + FIVE, 2),
      iv(m + 2 * H, 7),
    ]);
    h.putIntervals([iv(localMidnight("2026-05-11", TZ), 100)]);
    const r = h.hours("2026-05-10", "2026-05-11");
    expect(r.map((x) => [x.start, x.loadWh])).toEqual([
      [m, 3],
      [m + 2 * H, 7],
    ]);
  });

  it("returns 23 hours on 2026-03-08 and 25 on 2026-11-01", () => {
    const h = hist();
    seedDay(h, "2026-03-08");
    seedDay(h, "2026-11-01");
    const spring = h.hours("2026-03-08", "2026-03-09");
    const fall = h.hours("2026-11-01", "2026-11-02");
    expect(spring).toHaveLength(23);
    expect(fall).toHaveLength(25);
    expect(spring.every((x) => x.loadWh === 24)).toBe(true);
    expect(fall.every((x) => x.loadWh === 24)).toBe(true);
    expect(spring[0]?.start).toBe(localMidnight("2026-03-08", TZ));
    expect(fall[24]?.start).toBe(localMidnight("2026-11-02", TZ) - H);
  });

  it("is empty with no data or for another Site's data", () => {
    seedDay(hist(otherId), "2026-05-10");
    expect(hist().hours("2026-05-10", "2026-05-11")).toEqual([]);
  });
});

describe("observed", () => {
  it("returns the range [localMidnight(from), localMidnight(to)) ascending", () => {
    const h = hist();
    seedWeather(h, "2026-05-11", 20);
    seedWeather(h, "2026-05-10", 20);
    seedWeather(h, "2026-05-12", 20);
    const r = h.observed("2026-05-10", "2026-05-12");
    expect(r).toHaveLength(48);
    expect(r[0]?.hour).toBe(localMidnight("2026-05-10", TZ));
    expect(r[47]?.hour).toBe(localMidnight("2026-05-12", TZ) - H);
    expect(r.map((x) => x.hour)).toEqual(
      [...r.map((x) => x.hour)].sort((x, y) => x - y),
    );
    expect(r[14]).toEqual({
      hour: r[14]!.hour,
      tempC: 20,
      cloudPct: 20,
      ghiWm2: 300,
      precipMm: 0.5,
    });
  });

  it("returns 23 and 25 hours on the DST days", () => {
    const h = hist();
    seedWeather(h, "2026-03-08", 10);
    seedWeather(h, "2026-11-01", 10);
    expect(h.observed("2026-03-08", "2026-03-09")).toHaveLength(23);
    expect(h.observed("2026-11-01", "2026-11-02")).toHaveLength(25);
  });
});

describe("isComplete", () => {
  it("is true for a full day, false for one missing an interval or empty", () => {
    const h = hist();
    expect(seedDay(h, "2026-05-10")).toBe(288);
    seedDay(h, "2026-05-11", { skip: 1 });
    expect(h.isComplete("2026-05-10")).toBe(true);
    expect(h.isComplete("2026-05-11")).toBe(false);
    expect(h.isComplete("2026-05-12")).toBe(false);
  });

  it("expects 276 and 300 slots on the DST days", () => {
    const h = hist();
    expect(seedDay(h, "2026-03-08")).toBe(276);
    expect(seedDay(h, "2026-11-01")).toBe(300);
    expect(h.isComplete("2026-03-08")).toBe(true);
    expect(h.isComplete("2026-11-01")).toBe(true);
    const h2 = hist(otherId);
    seedDay(h2, "2026-03-08", { skip: 12 }); // 264 of 276
    seedDay(h2, "2026-11-01", { skip: 12 }); // 288 of 300
    expect(h2.isComplete("2026-03-08")).toBe(false);
    expect(h2.isComplete("2026-11-01")).toBe(false);
  });

  it("counts only its own Site's intervals", () => {
    seedDay(hist(otherId), "2026-05-10");
    expect(hist().isComplete("2026-05-10")).toBe(false);
  });

  it("treats a day with every slot plus a misaligned extra row as complete, in isComplete and completeDays", () => {
    const h = hist();
    seedDay(h, "2026-05-10");
    h.putIntervals([iv(localMidnight("2026-05-10", TZ) + 2 * 60_000)]); // 289 rows, start at :02
    expect(h.isComplete("2026-05-10")).toBe(true);
    expect(h.completeDays("2026-05-11")).toEqual(["2026-05-10"]);
  });
});

describe("completeDays", () => {
  it("lists full days before `before`, oldest first, excluding `before` even if full", () => {
    const h = hist();
    seedDay(h, "2026-05-13"); // today, full
    seedDay(h, "2026-05-12");
    seedDay(h, "2026-05-11", { skip: 1 }); // incomplete
    seedDay(h, "2026-05-10");
    expect(h.completeDays("2026-05-13")).toEqual(["2026-05-10", "2026-05-12"]);
  });

  it("uses 276/300 slots on DST days", () => {
    const h = hist();
    seedDay(h, "2026-11-01");
    seedDay(h, "2026-03-08");
    seedDay(h, "2026-05-10");
    expect(h.completeDays("2026-11-02")).toEqual([
      "2026-03-08",
      "2026-05-10",
      "2026-11-01",
    ]);
    const h2 = hist(otherId);
    seedDay(h2, "2026-03-08", { skip: 12 });
    expect(h2.completeDays("2026-05-01")).toEqual([]);
  });

  it("is empty without data", () => {
    expect(hist().completeDays("2026-05-13")).toEqual([]);
  });

  it("works across 10 years of history", () => {
    const h = hist();
    seedDay(h, "2016-05-10");
    seedDay(h, "2026-05-10");
    expect(h.completeDays("2026-05-11")).toEqual(["2016-05-10", "2026-05-10"]);
  });
});

describe("weatherGaps", () => {
  const today = "2026-05-20";

  it("flags days with energy but no or partial weather; not full or energy-less days", () => {
    const h = hist();
    h.putIntervals([iv(localMidnight("2026-05-10", TZ) + H)]); // energy, no weather: gap
    h.putIntervals([iv(localMidnight("2026-05-11", TZ) + H)]); // partial weather: gap
    h.putObserved([obs(localMidnight("2026-05-11", TZ))]);
    h.putIntervals([iv(localMidnight("2026-05-12", TZ) + H)]); // full weather: no gap
    seedWeather(h, "2026-05-12", 15);
    seedWeather(h, "2026-05-13", 15); // weather only, no energy: no gap
    h.putIntervals([iv(localMidnight("2026-05-14", TZ) + H)]); // 23 of 24 hours: gap
    seedWeather(h, "2026-05-14", 15);
    db.delete(schema.weatherObserved)
      .where(
        and(
          eq(schema.weatherObserved.siteId, siteId),
          eq(
            schema.weatherObserved.hour,
            new Date(localMidnight("2026-05-14", TZ) + 5 * H),
          ),
        ),
      )
      .run();
    expect(h.weatherGaps(today)).toEqual([
      "2026-05-10",
      "2026-05-11",
      "2026-05-14",
    ]);
  });

  it("excludes today and days older than 92 days, includes today-92", () => {
    const h = hist();
    for (const d of [
      today,
      addDays(today, -1),
      addDays(today, -92),
      addDays(today, -93),
    ]) {
      h.putIntervals([iv(localMidnight(d, TZ) + H)]);
    }
    expect(h.weatherGaps(today)).toEqual([
      addDays(today, -92),
      addDays(today, -1),
    ]);
  });

  it("uses the day's hour count on DST days", () => {
    const h = hist();
    h.putIntervals([
      iv(localMidnight("2026-03-08", TZ) + H),
      iv(localMidnight("2026-11-01", TZ) + H),
    ]);
    seedWeather(h, "2026-03-08", 10); // 23 hours: full
    seedWeather(h, "2026-11-01", 10); // 25 hours: full
    expect(h.weatherGaps("2026-11-02")).toEqual([]);
    const h2 = hist(otherId);
    h2.putIntervals([iv(localMidnight("2026-03-08", TZ) + H)]);
    h2.putObserved(
      Array.from({ length: 22 }, (_, i) =>
        obs(localMidnight("2026-03-08", TZ) + i * H),
      ),
    );
    expect(h2.weatherGaps("2026-03-09")).toEqual(["2026-03-08"]);
  });

  it("counts only its own Site's weather", () => {
    const h = hist();
    h.putIntervals([iv(localMidnight("2026-05-12", TZ) + H)]);
    seedWeather(hist(otherId), "2026-05-12", 15);
    expect(h.weatherGaps(today)).toEqual(["2026-05-12"]);
  });
});

describe("peakAverage", () => {
  const winLoad = (date: string, w: number) => {
    const f = localTime(date, FROM, TZ);
    const t = localTime(date, TO, TZ);
    return (s: number) => (s >= f && s < t ? w : 1);
  };
  const seedPeak = (date: string, w: number, high?: number) => {
    const h = hist();
    seedDay(h, date, { load: winLoad(date, w) });
    if (high !== undefined) seedWeather(h, date, high);
  };
  const opts = (days: string[], highC = 20) => ({
    days,
    fromMin: FROM,
    toMin: TO,
    highC,
  });

  it("averages hand-computed window sums, incl. DST days", () => {
    seedPeak("2026-05-10", 10); // 60 slots * 10 = 600
    seedPeak("2026-05-11", 20); // 1200
    seedPeak("2026-03-08", 30); // 1800
    seedPeak("2026-11-01", 40); // 2400
    const days = ["2026-03-08", "2026-05-10", "2026-05-11", "2026-11-01"];
    const r = hist().peakAverage(opts(days));
    expect(r?.historyAvgWh).toBe(1500);
    expect(r?.highC).toBe(20);
  });

  it("ignores intervals outside the window and rounds to an integer", () => {
    // six days of 600 and one of 660: (3600 + 660) / 7 = 608.57 -> 609
    const days = [1, 2, 3, 4, 5, 6, 7].map((d) => `2026-05-0${d}`);
    days.forEach((d, i) => seedPeak(d, i === 6 ? 11 : 10));
    expect(hist().peakAverage(opts(days))?.historyAvgWh).toBe(609);
  });

  it("returns null when days is empty", () => {
    seedPeak("2026-05-10", 10);
    expect(hist().peakAverage(opts([]))).toBeNull();
  });

  describe("similar temperature", () => {
    const days = [
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
    ];
    beforeEach(() => {
      seedPeak("2026-05-01", 10, 20.0); // 600
      seedPeak("2026-05-02", 20, 23.0); // 1200, +3 in
      seedPeak("2026-05-03", 31, 17.0); // 1860, -3 in
      seedPeak("2026-05-04", 1000, 23.1); // out
      seedPeak("2026-05-05", 1000, 16.9); // out
      seedPeak("2026-05-06", 1000); // no weather: never matches
    });

    it("includes |diff| = 3 exactly, excludes 3.1, skips days without weather", () => {
      expect(hist().peakAverage(opts(days, 20))).toEqual({
        historyAvgWh: 30610,
        highC: 20,
        similarTempDays: 3,
        similarTempAvgWh: 1220,
      });
    });

    it("gives null average when fewer than 3 days match, with the right count", () => {
      // highC 23.1 matches 23.1 and 23.0 only (20.0 is 3.1 away)
      const r = hist().peakAverage(opts(days, 23.1));
      expect(r?.similarTempDays).toBe(2);
      expect(r?.similarTempAvgWh).toBeNull();
      const none = hist().peakAverage(opts(days, 40));
      expect(none?.similarTempDays).toBe(0);
      expect(none?.similarTempAvgWh).toBeNull();
    });
  });

  it("handles 3,653 days and averages only days with data", () => {
    seedPeak("2026-05-10", 10, 20); // 600
    seedPeak("2026-05-11", 20); // 1200
    const days: string[] = [];
    for (let i = 3652; i >= 0; i--) days.push(addDays("2026-05-11", -i));
    expect(days).toHaveLength(3653);
    const r = hist().peakAverage(opts(days));
    expect(r?.historyAvgWh).toBe(900);
    expect(r?.similarTempDays).toBe(1);
    expect(r?.similarTempAvgWh).toBeNull();
  });
});

describe("latestStart", () => {
  it("is null with no data, then the max start in ms of this Site", () => {
    const h = hist();
    expect(h.latestStart()).toBeNull();
    const a = Date.parse("2026-05-10T12:00:00Z");
    const b = Date.parse("2026-05-10T12:05:00Z");
    h.putIntervals([iv(b), iv(a)]);
    hist(otherId).putIntervals([iv(b + H)]);
    expect(h.latestStart()).toBe(b);
  });
});

describe("timezone null", () => {
  it("behaves as UTC", () => {
    const h = hist(siteId, null);
    expect(seedDay(h, "2026-03-08", { tz: "UTC" })).toBe(288);
    seedDay(h, "2026-03-09", { tz: "UTC", skip: 1 });
    expect(h.isComplete("2026-03-08")).toBe(true);
    expect(h.isComplete("2026-03-09")).toBe(false);
    expect(h.completeDays("2026-03-10")).toEqual(["2026-03-08"]);
    const r = h.hours("2026-03-08", "2026-03-09");
    expect(r).toHaveLength(24);
    expect(r[0]?.start).toBe(Date.parse("2026-03-08T00:00:00Z"));
    h.putObserved([obs(Date.parse("2026-03-08T00:00:00Z"))]);
    expect(h.observed("2026-03-08", "2026-03-09")).toHaveLength(1);
    expect(h.weatherGaps("2026-03-10")).toEqual(["2026-03-08", "2026-03-09"]);
  });
});
