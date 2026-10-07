import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gte } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataSource, LiveSample } from "~/lib/core/types";
import { checkSnapshot } from "~/lib/dashboard";
import { addDays, localDate, localMidnight } from "~/lib/time";
import { openDb } from "~/server/db";
import * as schema from "~/server/db/schema";
import type * as LoadMod from "./load";
import { mapCalendarHistory } from "~/lib/sources/fleet-api/map";
import calendarHistory from "../../../fixtures/fleet-api/calendar_history_energy.json";
import siteInfo from "../../../fixtures/fleet-api/site_info.json";

// Signatures under test (see handoff):
//   loadSnapshot({ db, source, now }, siteId: number): Promise<DashboardSnapshot>
//   firstSiteId(db): number | null
// loadSnapshot keeps a module-level 60 s live cache, so each test imports a fresh module.

const HOUR = 3_600_000;
const TZ = "America/Los_Angeles";
const NORMAL = Date.parse("2026-05-20T19:30:00Z");
const SPRING = Date.parse("2026-03-08T20:00:00Z");
const FALL = Date.parse("2026-11-01T20:00:00Z");

let dir: string;
let db: ReturnType<typeof openDb>;
let mod: typeof LoadMod;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "voltops-snap-"));
  db = openDb(join(dir, "test.db"));
  migrate(db, { migrationsFolder: "drizzle" });
  vi.resetModules();
  mod = await import("./load");
});
afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

// Balanced by construction: solar + 0 + gi = load + 0 + ge.
const hourRow = (start: number) => {
  const local = (new Date(start).getUTCHours() + 17) % 24;
  const solarWh =
    local >= 7 && local <= 18
      ? Math.round(3000 * Math.sin((Math.PI * (local - 6)) / 13))
      : 0;
  const loadWh = 600 + 40 * (local % 7) + (local >= 16 && local <= 21 ? 900 : 0);
  return {
    solarWh,
    loadWh,
    gridImportWh: Math.max(0, loadWh - solarWh),
    gridExportWh: Math.max(0, solarWh - loadWh),
    batteryChargeWh: 0,
    batteryDischargeWh: 0,
  };
};

const liveAt = (now: number): LiveSample => ({
  ts: new Date(now).toISOString(),
  solarW: 3000,
  loadW: 1000,
  batteryW: -1500,
  gridW: -500,
  socPct: 63.6,
  gridStatus: "connected",
});

const fakeSource = (
  now: number,
  id: DataSource["id"] = "fleet-api",
  fail = false,
) => {
  const getLiveStatus = vi.fn(async (_id: string) => {
    if (fail) throw new Error("boom");
    return liveAt(now);
  });
  const source: DataSource = {
    id,
    getLiveStatus,
    getHistory: vi.fn(async () => []),
  };
  return { source, getLiveStatus };
};

type Seed = {
  now: number;
  daysBefore?: number;
  tariff?: boolean;
  weather?: boolean;
  location?: boolean;
  sample?: boolean;
  source?: string;
  intervals?: boolean; // false: skip the synthetic energy_intervals
};

// Returns the site id.
function seed(o: Seed): number {
  const { now } = o;
  const today = localDate(now, TZ);
  const [site] = db
    .insert(schema.sites)
    .values({
      source: o.source ?? "fleet-api",
      externalId: "EXT-1",
      name: "Home",
      timezone: TZ,
      latitude: o.location === false ? null : 34,
      longitude: o.location === false ? null : -118,
      usableCapacityWh: 13500,
      backupReservePct: 20,
      temperatureUnit: "C",
    })
    .returning()
    .all();
  const siteId = site!.id;
  if (o.tariff !== false)
    db.insert(schema.tariffSchedule)
      .values({
        siteId,
        currency: "USD",
        content: (siteInfo as { response: { tariff_content: unknown } }).response
          .tariff_content,
      })
      .run();
  const from = localMidnight(addDays(today, -(o.daysBefore ?? 7)), TZ);
  const lastFull = Math.floor(now / HOUR) * HOUR - HOUR;
  const end = localMidnight(addDays(today, 2), TZ);
  const intervals = [];
  const observed = [];
  for (let t = from; t <= lastFull; t += HOUR) {
    const r = hourRow(t);
    intervals.push({ siteId, start: new Date(t), ...r });
    observed.push({
      siteId,
      hour: new Date(t),
      tempC: 15,
      cloudPct: 20,
      ghiWm2: r.solarWh / 5,
      precipMm: 0,
    });
  }
  if (intervals.length && o.intervals !== false) db.insert(schema.energyIntervals).values(intervals).run();
  if (o.weather !== false) {
    if (observed.length) db.insert(schema.weatherObserved).values(observed).run();
    const forecast = [];
    for (let t = Math.ceil(now / HOUR) * HOUR; t < end; t += HOUR)
      forecast.push({
        siteId,
        issuedAt: new Date(now - 3 * HOUR),
        hour: new Date(t),
        tempC: 15,
        cloudPct: 20,
        ghiWm2: 500,
        precipMm: 0,
        precipProbPct: 10,
      });
    db.insert(schema.weatherForecast).values(forecast).run();
  }
  if (o.sample !== false)
    db.insert(schema.samples)
      .values({
        siteId,
        ts: new Date(now - 5 * 60_000),
        solarW: 2000,
        loadW: 1200,
        batteryW: -300,
        gridW: -500,
        socPct: 70.4,
        gridStatus: "connected",
      })
      .run();
  return siteId;
}

const run = (now: number, siteId: number, source: DataSource) =>
  mod.loadSnapshot({ db, source, now }, siteId);

describe("loadSnapshot", () => {
  it("normal day: checkSnapshot clean, actual sums match the seeded intervals", async () => {
    const siteId = seed({ now: NORMAL });
    const { source } = fakeSource(NORMAL);
    const s = await run(NORMAL, siteId, source);
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.health.warnings).toEqual([]);
    expect(s.source).toBe("fleet-api");
    expect(s.site).toEqual({ name: "Home", timezone: TZ, temperatureUnit: "C" });
    expect(s.currency).toBe("USD");
    expect(s.timeline).toHaveLength(48);
    const mid = localMidnight("2026-05-20", TZ);
    const row = s.timeline.find((r) => Date.parse(r.hour) === mid + 6 * HOUR)!;
    expect(row).toMatchObject({ kind: "actual", ...hourRow(mid + 6 * HOUR) });
    const imp = s.timeline
      .filter((r) => r.kind === "actual" && Date.parse(r.hour) >= mid)
      .reduce((a, r) => a + (r.gridImportWh ?? 0), 0);
    expect(s.costToday.periods.reduce((a, p) => a + p.importWh, 0)).toBe(imp);
    expect(s.weatherTomorrow?.date).toBe("2026-05-21");
  });

  it("sums several energy_intervals rows within one UTC hour", async () => {
    const siteId = seed({ now: NORMAL });
    const mid = localMidnight("2026-05-20", TZ);
    db.insert(schema.energyIntervals)
      .values({
        siteId,
        start: new Date(mid + 6 * HOUR + 30 * 60_000),
        solarWh: 100,
        loadWh: 100,
        gridImportWh: 0,
        gridExportWh: 0,
        batteryChargeWh: 0,
        batteryDischargeWh: 0,
      })
      .run();
    const s = await run(NORMAL, siteId, fakeSource(NORMAL).source);
    const base = hourRow(mid + 6 * HOUR);
    const row = s.timeline.find((r) => Date.parse(r.hour) === mid + 6 * HOUR)!;
    expect(row.solarWh).toBe(base.solarWh + 100);
    expect(row.loadWh).toBe(base.loadWh + 100);
  });

  it("previousDays are the 6 local dates before today, oldest first", async () => {
    const siteId = seed({ now: NORMAL });
    const s = await run(NORMAL, siteId, fakeSource(NORMAL).source);
    expect(s.previousDays.map((d) => d.date)).toEqual([
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
      "2026-05-18",
      "2026-05-19",
    ]);
    let solar = 0;
    for (let t = localMidnight("2026-05-19", TZ); t < localMidnight("2026-05-20", TZ); t += HOUR)
      solar += hourRow(t).solarWh;
    expect(s.previousDays[5]?.solarWh).toBe(solar);
  });

  it.each([
    ["2026-03-08", SPRING, 47],
    ["2026-11-01", FALL, 49],
  ])("DST day %s: %i rows, checkSnapshot clean", async (_d, now, rows) => {
    const siteId = seed({ now });
    const s = await run(now, siteId, fakeSource(now).source);
    expect(s.timeline).toHaveLength(rows);
    expect(checkSnapshot(s)).toEqual([]);
  });

  it("cold start: 1 day of data gives the learning warning", async () => {
    const siteId = seed({ now: NORMAL, daysBefore: 1 });
    const s = await run(NORMAL, siteId, fakeSource(NORMAL).source);
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.health.warnings).toEqual([
      "Learning: forecasts improve after 7 days of data",
    ]);
  });

  it("no tariff row: off-peak and a warning", async () => {
    const siteId = seed({ now: NORMAL, tariff: false });
    const s = await run(NORMAL, siteId, fakeSource(NORMAL).source);
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.timeline.every((r) => r.period === "off-peak")).toBe(true);
    expect(s.tariffNow.importCentsPerKwh).toBe(0);
    expect(s.health.warnings).toEqual(["No tariff from Tesla"]);
  });

  it("no weather and no location: weatherTomorrow null plus the location warning", async () => {
    const siteId = seed({ now: NORMAL, weather: false, location: false });
    const s = await run(NORMAL, siteId, fakeSource(NORMAL).source);
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.weatherTomorrow).toBeNull();
    expect(s.health.warnings).toEqual([
      "Set SITE_LATITUDE and SITE_LONGITUDE for weather",
    ]);
  });

  it("the latest-issued forecast row wins for tomorrow's weather", async () => {
    const siteId = seed({ now: NORMAL });
    const t0 = localMidnight("2026-05-21", TZ);
    const row = (issuedAt: number, tempC: number) => ({
      siteId,
      issuedAt: new Date(issuedAt),
      hour: new Date(t0 + 12 * HOUR),
      tempC,
      cloudPct: 20,
      ghiWm2: 500,
      precipMm: 0,
      precipProbPct: 10,
    });
    db.insert(schema.weatherForecast)
      .values([row(NORMAL - HOUR, 31), row(NORMAL - 10 * HOUR, 40)])
      .run();
    const s = await run(NORMAL, siteId, fakeSource(NORMAL).source);
    expect(s.weatherTomorrow?.highC).toBe(31);
  });

  it("actual socPct comes from the nearest stored sample", async () => {
    const siteId = seed({ now: NORMAL });
    const mid = localMidnight("2026-05-20", TZ);
    db.insert(schema.samples)
      .values({
        siteId,
        ts: new Date(mid + 3 * HOUR + 60_000),
        solarW: 0,
        loadW: 500,
        batteryW: 500,
        gridW: 0,
        socPct: 55.4,
        gridStatus: "connected",
      })
      .run();
    const s = await run(NORMAL, siteId, fakeSource(NORMAL).source);
    const row = s.timeline.find((r) => Date.parse(r.hour) === mid + 3 * HOUR)!;
    expect(row.socPct).toBe(55);
  });

  it("live: caches getLiveStatus for 60 s per site", async () => {
    const siteId = seed({ now: NORMAL });
    const { source, getLiveStatus } = fakeSource(NORMAL);
    await run(NORMAL, siteId, source);
    await run(NORMAL + 30_000, siteId, source);
    expect(getLiveStatus).toHaveBeenCalledTimes(1);
    expect(getLiveStatus).toHaveBeenCalledWith("EXT-1");
    await run(NORMAL + 61_000, siteId, source);
    expect(getLiveStatus).toHaveBeenCalledTimes(2);
  });

  it("live failing: latest stored sample plus the warning", async () => {
    const siteId = seed({ now: NORMAL });
    const { source } = fakeSource(NORMAL, "fleet-api", true);
    const s = await run(NORMAL, siteId, source);
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.live).toMatchObject({
      solarW: 2000,
      loadW: 1200,
      batteryW: -300,
      gridW: -500,
      socPct: 70,
    });
    expect(s.updatedAt).toBe(new Date(NORMAL - 5 * 60_000).toISOString());
    expect(s.health.warnings).toContain(
      "Live reading unavailable: showing the last stored reading",
    );
  });

  it("non-fleet source: never calls getLiveStatus, uses the stored sample", async () => {
    const siteId = seed({ now: NORMAL, source: "replay" });
    const { source, getLiveStatus } = fakeSource(NORMAL, "replay");
    const s = await run(NORMAL, siteId, source);
    expect(getLiveStatus).not.toHaveBeenCalled();
    expect(s.source).toBe("replay");
    expect(s.live.socPct).toBe(70);
    expect(s.health.warnings).toContain(
      "Live reading unavailable: showing the last stored reading",
    );
  });

  it("live failing logs the class name only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const siteId = seed({ now: NORMAL });
    const { source } = fakeSource(NORMAL, "fleet-api", true);
    await run(NORMAL, siteId, source);
    expect(warn).toHaveBeenCalledWith(`[snapshot] live unavailable site=${siteId} Error`);
    const all = JSON.stringify(warn.mock.calls);
    expect(all).not.toContain("EXT-1");
    expect(all).not.toContain("boom");
    warn.mockRestore();
  });

  it("history lag uses the latest interval start, not the hour bucket", async () => {
    const now = Date.parse("2026-05-20T12:50:00Z");
    const siteId = seed({ now });
    db.delete(schema.energyIntervals)
      .where(gte(schema.energyIntervals.start, new Date("2026-05-20T10:00:00Z")))
      .run();
    db.insert(schema.energyIntervals)
      .values({
        siteId,
        start: new Date("2026-05-20T10:55:00Z"),
        solarWh: 0,
        loadWh: 0,
        gridImportWh: 0,
        gridExportWh: 0,
        batteryChargeWh: 0,
        batteryDischargeWh: 0,
      })
      .run();
    const s = await run(now, siteId, fakeSource(now).source);
    expect(s.health.warnings.filter((w) => w.startsWith("Energy history"))).toEqual([]);
  });

  it.each([
    ["normal day", NORMAL],
    ["2026-03-08", SPRING],
    ["2026-11-01", FALL],
  ])("fixture battery flow, %s: checkSnapshot clean", async (_d, now) => {
    const siteId = seed({ now, intervals: false });
    const iv = mapCalendarHistory(calendarHistory);
    const dayMid = Date.parse("2026-10-04T00:00:00-07:00"); // the fixture is one day
    const today = localDate(now, TZ);
    const lastFull = Math.floor(now / HOUR) * HOUR - HOUR;
    const rows = [];
    for (let k = 0; k <= 7; k++) {
      const mid = localMidnight(addDays(today, k - 7), TZ);
      for (const r of iv) {
        const start = mid + (Date.parse(r.start) - dayMid);
        if (start >= lastFull + HOUR) continue;
        rows.push({ ...r, siteId, start: new Date(start) });
      }
    }
    db.insert(schema.energyIntervals).values(rows).run();
    const s = await run(now, siteId, fakeSource(now).source);
    expect(checkSnapshot(s)).toEqual([]);
    expect(
      s.timeline.some(
        (r) =>
          r.kind === "actual" &&
          ((r.batteryChargeWh ?? 0) > 0 || (r.batteryDischargeWh ?? 0) > 0),
      ),
    ).toBe(true);
  });

  it("live failing with no stored sample throws", async () => {
    const siteId = seed({ now: NORMAL, sample: false });
    const { source } = fakeSource(NORMAL, "fleet-api", true);
    await expect(run(NORMAL, siteId, source)).rejects.toThrow();
  });
});

describe("firstSiteId", () => {
  it("is null with no sites", () => {
    expect(mod.firstSiteId(db)).toBeNull();
  });
  it("is the lowest id", () => {
    const now = Date.now();
    for (const ext of ["b", "a"])
      db.insert(schema.sites)
        .values({ source: "fleet-api", externalId: ext, createdAt: new Date(now) })
        .run();
    expect(mod.firstSiteId(db)).toBe(1);
  });
});
