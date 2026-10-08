import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gte } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataSource, LiveSample } from "~/lib/core/types";
import { checkSnapshot, peakEstimateWh, reservePlan } from "~/lib/dashboard";
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
  const loadWh =
    600 + 40 * (local % 7) + (local >= 16 && local <= 21 ? 900 : 0);
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
  slots?: boolean; // true: 5-min energy_intervals (complete days) instead of hourly rows
  unit?: "C" | "F";
  obsTemp?: (t: number) => number; // observed temp_c per hour (default 15)
  fcTemp?: (t: number) => number; // forecast temp_c per hour (default 15)
  extra?: (date: string) => number; // slots only: extra load Wh per 5-min slot on that local date
};

const STEP = 300_000;
// Slots only: the seeded 5-min load, so tests can hand-compute the peak-window sums.
let slotLoads: { t: number; load: number }[] = [];

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
      temperatureUnit: o.unit ?? "C",
    })
    .returning()
    .all();
  const siteId = site!.id;
  if (o.tariff !== false)
    db.insert(schema.tariffSchedule)
      .values({
        siteId,
        currency: "USD",
        content: (siteInfo as { response: { tariff_content: unknown } })
          .response.tariff_content,
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
      tempC: o.obsTemp?.(t) ?? 15,
      cloudPct: 20,
      ghiWm2: r.solarWh / 5,
      precipMm: 0,
    });
  }
  slotLoads = [];
  if (o.slots) {
    const rows = [];
    for (let t = from; t < lastFull + HOUR; t += STEP) {
      const h = hourRow(Math.floor(t / HOUR) * HOUR);
      const solarWh = Math.floor(h.solarWh / 12);
      const loadWh =
        Math.floor(h.loadWh / 12) + (o.extra?.(localDate(t, TZ)) ?? 0);
      slotLoads.push({ t, load: loadWh });
      rows.push({
        siteId,
        start: new Date(t),
        solarWh,
        loadWh,
        gridImportWh: Math.max(0, loadWh - solarWh),
        gridExportWh: Math.max(0, solarWh - loadWh),
        batteryChargeWh: 0,
        batteryDischargeWh: 0,
      });
    }
    for (let i = 0; i < rows.length; i += 500)
      db.insert(schema.energyIntervals)
        .values(rows.slice(i, i + 500))
        .run();
  } else if (intervals.length && o.intervals !== false)
    db.insert(schema.energyIntervals).values(intervals).run();
  if (o.weather !== false) {
    if (observed.length)
      db.insert(schema.weatherObserved).values(observed).run();
    const forecast = [];
    for (let t = Math.ceil(now / HOUR) * HOUR; t < end; t += HOUR)
      forecast.push({
        siteId,
        issuedAt: new Date(now - 3 * HOUR),
        hour: new Date(t),
        tempC: o.fcTemp?.(t) ?? 15,
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
    expect(s.site).toEqual({
      name: "Home",
      timezone: TZ,
      temperatureUnit: "C",
    });
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
    for (
      let t = localMidnight("2026-05-19", TZ);
      t < localMidnight("2026-05-20", TZ);
      t += HOUR
    )
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
    expect(warn).toHaveBeenCalledWith(
      `[snapshot] live unavailable site=${siteId} Error`,
    );
    const all = JSON.stringify(warn.mock.calls);
    expect(all).not.toContain("EXT-1");
    expect(all).not.toContain("boom");
    warn.mockRestore();
  });

  it("history lag uses the latest interval start, not the hour bucket", async () => {
    const now = Date.parse("2026-05-20T12:50:00Z");
    const siteId = seed({ now });
    db.delete(schema.energyIntervals)
      .where(
        gte(schema.energyIntervals.start, new Date("2026-05-20T10:00:00Z")),
      )
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
    expect(
      s.health.warnings.filter((w) => w.startsWith("Energy history")),
    ).toEqual([]);
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

// ---- B016: peakEstimate + recommendation, from 5-min seeded history ----

const SUMMER_FRI = Date.parse("2026-07-17T19:30:00Z"); // tomorrow = Saturday: summer weekend has no ON_PEAK

// Peak window is 16:00-21:00 local: 16:00 is 8 h and 21:00 is 3 h before the next local midnight (DST-safe).
const peakSum = (date: string) => {
  const end = localMidnight(addDays(date, 1), TZ);
  return slotLoads
    .filter((r) => r.t >= end - 8 * HOUR && r.t < end - 3 * HOUR)
    .reduce((a, r) => a + r.load, 0);
};
const mean = (xs: number[]) =>
  Math.round(xs.reduce((a, x) => a + x, 0) / xs.length);
const prior = (now: number, n = 7) =>
  Array.from({ length: n }, (_, i) => addDays(localDate(now, TZ), i - n));
const endOf = (date: string) =>
  new Date(localMidnight(addDays(date, 1), TZ) - 3 * HOUR).toISOString(); // 21:00 local

describe("loadSnapshot peakEstimate and recommendation", () => {
  const snap = async (now: number, o: Partial<Seed> = {}) => {
    const siteId = seed({ now, slots: true, ...o });
    return run(now, siteId, fakeSource(now).source);
  };

  it("7 complete days, weekday tomorrow: both days set, reserve advice set", async () => {
    const s = await snap(NORMAL);
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.peakEstimate.historyDays).toBe(7);
    const avg = mean(prior(NORMAL).map(peakSum));
    const want = {
      historyAvgWh: avg,
      highC: 15,
      similarTempDays: 7,
      similarTempAvgWh: avg,
    };
    expect(s.peakEstimate.today).toEqual(want);
    expect(s.peakEstimate.tomorrow).toEqual(want);
    const r = s.recommendation!;
    expect(r.reserve).toEqual(reservePlan(peakEstimateWh(want), 13500, 20));
    expect(r.action).toBe(`Raise backup reserve to ${r.reserve!.targetPct}%`);
    expect(r.effectWh).toBe(r.reserve!.coveredWh);
    expect(r.validTo).toBe(endOf("2026-05-21")); // tomorrow 21:00 local
    expect(r.validFrom).toBe(endOf("2026-05-20")); // today's window end is later than updatedAt
    // peak 52.028 c/kWh, lowest off-peak 35.776 c/kWh
    const want$ = Math.round((r.effectWh * (52.028 - 35.776)) / 1000);
    expect(Math.abs(r.savingsCents - want$)).toBeLessThanOrEqual(1);
    expect(r.savingsCents).toBeGreaterThan(0);
    expect(r.confidence).toBe("medium");
    const kwh = (avg / 1000).toFixed(1);
    expect(r.why).toEqual([
      `Usual peak use: ${kwh} kWh over 7 days`,
      `On days near 15°C: ${kwh} kWh over 7 days`,
      "Tomorrow's forecast high: 15°C",
    ]);
    expect(r.wouldChange).toBe(
      "A different forecast high for tomorrow, or a tariff change.",
    );
  });

  it("validFrom is updatedAt once today's peak window is over", async () => {
    const now = Date.parse("2026-05-21T05:30:00Z"); // 22:30 PDT on 5/20
    const s = await snap(now);
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.recommendation?.validFrom).toBe(new Date(now).toISOString());
    expect(s.recommendation?.validTo).toBe(endOf("2026-05-21"));
  });

  it("6 complete days: peakEstimate is filled but there is no recommendation", async () => {
    const s = await snap(NORMAL, { daysBefore: 6 });
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.peakEstimate.historyDays).toBe(6);
    expect(s.peakEstimate.tomorrow).not.toBeNull();
    expect(s.peakEstimate.today).not.toBeNull();
    expect(s.recommendation).toBeNull();
  });

  it("hourly-only history has no complete days: historyDays 0, both days null", async () => {
    const siteId = seed({ now: NORMAL });
    const s = await run(NORMAL, siteId, fakeSource(NORMAL).source);
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.peakEstimate).toEqual({
      historyDays: 0,
      today: null,
      tomorrow: null,
    });
    expect(s.recommendation).toBeNull();
  });

  it("tomorrow a Saturday (summer, no ON_PEAK): tomorrow null, no recommendation", async () => {
    const s = await snap(SUMMER_FRI);
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.peakEstimate.historyDays).toBe(7);
    expect(s.peakEstimate.today).not.toBeNull(); // Friday is ON_PEAK
    expect(s.peakEstimate.tomorrow).toBeNull();
    expect(s.recommendation).toBeNull();
  });

  it("no weather rows: both days null, no recommendation, historyDays still counted", async () => {
    const s = await snap(NORMAL, { weather: false });
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.peakEstimate).toEqual({
      historyDays: 7,
      today: null,
      tomorrow: null,
    });
    expect(s.recommendation).toBeNull();
  });

  it("no tariff: both days null, no recommendation", async () => {
    const s = await snap(NORMAL, { tariff: false });
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.peakEstimate.today).toBeNull();
    expect(s.peakEstimate.tomorrow).toBeNull();
    expect(s.recommendation).toBeNull();
  });

  it("today's highC uses observed temps for past hours", async () => {
    const mid = localMidnight("2026-05-20", TZ);
    const s = await snap(NORMAL, { obsTemp: (t) => (t >= mid ? 30 : 15) });
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.peakEstimate.today?.highC).toBe(30); // observed 30 > forecast 15
    expect(s.peakEstimate.tomorrow?.highC).toBe(15);
  });

  it("an observed temp beats a forecast row for the same past hour", async () => {
    const siteId = seed({ now: NORMAL, slots: true });
    const mid = localMidnight("2026-05-20", TZ);
    db.insert(schema.weatherForecast)
      .values({
        siteId,
        issuedAt: new Date(NORMAL - HOUR),
        hour: new Date(mid + 3 * HOUR),
        tempC: 45,
        cloudPct: 20,
        ghiWm2: 0,
        precipMm: 0,
        precipProbPct: 0,
      })
      .run();
    const s = await run(NORMAL, siteId, fakeSource(NORMAL).source);
    expect(s.peakEstimate.today?.highC).toBe(15);
  });

  it("a past hour without an observed temp falls back to the latest forecast", async () => {
    const siteId = seed({ now: NORMAL, slots: true });
    const mid = localMidnight("2026-05-20", TZ);
    db.delete(schema.weatherObserved)
      .where(gte(schema.weatherObserved.hour, new Date(mid)))
      .run();
    db.insert(schema.weatherForecast)
      .values({
        siteId,
        issuedAt: new Date(NORMAL - HOUR),
        hour: new Date(mid + 3 * HOUR),
        tempC: 45,
        cloudPct: 20,
        ghiWm2: 0,
        precipMm: 0,
        precipProbPct: 0,
      })
      .run();
    const s = await run(NORMAL, siteId, fakeSource(NORMAL).source);
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.peakEstimate.today?.highC).toBe(45);
  });

  it("only 2 days near tomorrow's high: no similar average, low confidence, deg F wording", async () => {
    const hot = new Set(prior(NORMAL).slice(0, 5)); // 5 of 7 days are 35 C and heavier
    const s = await snap(NORMAL, {
      unit: "F",
      obsTemp: (t) => (hot.has(localDate(t, TZ)) ? 35 : 15),
      extra: (d) => (hot.has(d) ? 100 : 0),
    });
    expect(checkSnapshot(s)).toEqual([]);
    const avg = mean(prior(NORMAL).map(peakSum));
    expect(s.peakEstimate.tomorrow).toEqual({
      historyAvgWh: avg,
      highC: 15,
      similarTempDays: 2,
      similarTempAvgWh: null,
    });
    expect(s.recommendation?.confidence).toBe("low");
    expect(s.recommendation?.reserve?.peakWh).toBe(avg);
    expect(s.recommendation?.why).toEqual([
      `Usual peak use: ${(avg / 1000).toFixed(1)} kWh over 7 days`,
      "Not enough days near 59°F yet (2 so far)",
      "Tomorrow's forecast high: 59°F",
    ]);
  });

  it("similar-temperature days average only the matching days", async () => {
    const hot = new Set(prior(NORMAL).slice(0, 2)); // 2 hot heavy days, 5 days at 15 C
    const s = await snap(NORMAL, {
      obsTemp: (t) => (hot.has(localDate(t, TZ)) ? 35 : 15),
      extra: (d) => (hot.has(d) ? 100 : 0),
    });
    expect(checkSnapshot(s)).toEqual([]);
    const days = prior(NORMAL);
    const t = s.peakEstimate.tomorrow!;
    expect(t.historyAvgWh).toBe(mean(days.map(peakSum)));
    expect(t.similarTempDays).toBe(5);
    expect(t.similarTempAvgWh).toBe(
      mean(days.filter((d) => !hot.has(d)).map(peakSum)),
    );
    expect(t.similarTempAvgWh!).toBeLessThan(t.historyAvgWh);
    expect(s.recommendation?.confidence).toBe("medium");
    expect(s.recommendation?.reserve?.peakWh).toBe(peakEstimateWh(t));
  });

  it.each([
    ["2026-03-08", SPRING],
    ["2026-11-01", FALL],
  ])(
    "DST day %s: recommendation windows are local 21:00, checkSnapshot clean",
    async (d, now) => {
      const s = await snap(now);
      expect(checkSnapshot(s)).toEqual([]);
      expect(s.peakEstimate.historyDays).toBe(7);
      expect(s.recommendation?.validTo).toBe(endOf(addDays(d, 1)));
      expect(s.recommendation?.validFrom).toBe(endOf(d));
    },
  );
});

describe("firstSiteId", () => {
  it("is null with no sites", () => {
    expect(mod.firstSiteId(db)).toBeNull();
  });
  it("is the lowest id", () => {
    const now = Date.now();
    for (const ext of ["b", "a"])
      db.insert(schema.sites)
        .values({
          source: "fleet-api",
          externalId: ext,
          createdAt: new Date(now),
        })
        .run();
    expect(mod.firstSiteId(db)).toBe(1);
  });
});
