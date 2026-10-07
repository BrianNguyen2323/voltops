import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataSource, EnergyInterval, LiveSample } from "~/lib/core/types";
import { AuthExpired } from "~/lib/core/types";
import { addDays, localMidnight } from "~/lib/time";
import { fetchWeather } from "~/lib/weather/open-meteo";
import { openDb } from "~/server/db";
import * as schema from "~/server/db/schema";
import {
  applySiteSettings,
  dayRange,
  runTesla,
  runWeather,
  syncEnergy,
  syncWeather,
  takeSample,
} from "./jobs";

// Contract assumed beyond the brief's named exports: runTesla(deps) and runWeather(deps)
// are the per-site, error-isolating loops; deps = { db, source, fetch, now }.

const TZ = "America/Los_Angeles";
const FIVE_MIN = 300_000;
const FIXTURE = readFileSync("fixtures/open-meteo/forecast.json", "utf8");
const FIXTURE_NOW = 1791340007841;
// 2026-10-05 11:00 PDT
const NOW = Date.UTC(2026, 9, 5, 18, 0, 0);

let dir: string;
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "voltops-worker-"));
  db = openDb(join(dir, "test.db"));
  migrate(db, { migrationsFolder: "drizzle" });
});
afterEach(() => {
  vi.restoreAllMocks();
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

type Site = typeof schema.sites.$inferSelect;
function addSite(o: Partial<typeof schema.sites.$inferInsert> = {}): Site {
  return db
    .insert(schema.sites)
    .values({ source: "fleet-api", externalId: "EXT-SECRET-1", timezone: TZ, ...o })
    .returning()
    .get();
}

const interval = (startMs: number, solarWh = 1): EnergyInterval => ({
  start: new Date(startMs).toISOString(),
  solarWh,
  loadWh: 2,
  gridImportWh: 3,
  gridExportWh: 4,
  batteryChargeWh: 5,
  batteryDischargeWh: 6,
});
const live: LiveSample = {
  ts: "2026-10-05T18:00:00.000Z",
  solarW: 1000,
  loadW: 500,
  batteryW: -200,
  gridW: -300,
  socPct: 55.5,
  gridStatus: "connected",
};

type Range = { start_date: string; end_date: string; time_zone: string };
function fakeSource(over: Partial<DataSource> = {}) {
  const calls: { id: string; range: Range }[] = [];
  const getLiveStatus = vi.fn((_id: string) => Promise.resolve(live));
  const source: DataSource = {
    id: "fleet-api",
    getLiveStatus,
    getHistory: vi.fn((id: string, range: Range) => {
      calls.push({ id, range });
      return Promise.resolve([] as EnergyInterval[]);
    }),
    ...over,
  };
  return { source, calls, getLiveStatus };
}
const okFetch = () => vi.fn(() => Promise.resolve(new Response(FIXTURE))) as unknown as typeof fetch;
const mkDeps = (source: DataSource, now: number, f: typeof fetch = okFetch()) => ({
  db,
  source,
  fetch: f,
  now,
});

function fillDay(siteId: number, date: string, n: number) {
  const start = localMidnight(date, TZ);
  db.insert(schema.energyIntervals)
    .values(
      Array.from({ length: n }, (_, i) => ({
        siteId,
        start: new Date(start + i * FIVE_MIN),
        solarWh: 1,
        loadWh: 1,
        gridImportWh: 1,
        gridExportWh: 1,
        batteryChargeWh: 1,
        batteryDischargeWh: 1,
      })),
    )
    .run();
}
/** Fill the 7 days before `today` with 288 intervals, except those in `skip`. */
function fillPrev(siteId: number, today: string, skip: string[] = []) {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, -i);
    if (!skip.includes(d)) fillDay(siteId, d, 288);
  }
}
const days = (calls: { range: Range }[]) => calls.map((c) => c.range.start_date.slice(0, 10)).sort();

describe("dayRange", () => {
  it("normal day: local midnight to 1 s before next midnight", () => {
    expect(dayRange("2026-10-04", TZ)).toEqual({
      start_date: "2026-10-04T00:00:00-07:00",
      end_date: "2026-10-04T23:59:59-07:00",
      time_zone: TZ,
    });
  });
  it("spring-forward day: offset changes between start and end", () => {
    const r = dayRange("2026-03-08", TZ);
    expect(r.start_date).toBe("2026-03-08T00:00:00-08:00");
    expect(r.end_date).toBe("2026-03-08T23:59:59-07:00");
  });
  it("fall-back day: offset changes between start and end", () => {
    const r = dayRange("2026-11-01", TZ);
    expect(r.start_date).toBe("2026-11-01T00:00:00-07:00");
    expect(r.end_date).toBe("2026-11-01T23:59:59-08:00");
  });
  it("uses endMs as end when given", () => {
    expect(dayRange("2026-10-05", TZ, NOW).end_date).toBe("2026-10-05T11:00:00-07:00");
  });
});

describe("syncEnergy", () => {
  it("empty db: fetches today (end = now) and the 7 previous days", async () => {
    const site = addSite();
    const { source, calls } = fakeSource();
    await syncEnergy(mkDeps(source, NOW), site);
    expect(calls).toHaveLength(8);
    expect(calls.every((c) => c.id === "EXT-SECRET-1")).toBe(true);
    const d = days(calls);
    expect(d[0]).toBe("2026-09-28");
    expect(d[7]).toBe("2026-10-05");
    const today = calls.find((c) => c.range.start_date.startsWith("2026-10-05"))!;
    expect(today.range.end_date).toBe("2026-10-05T11:00:00-07:00");
    expect(today.range.time_zone).toBe(TZ);
  });

  it("skips complete past days, refetches incomplete ones, always fetches today", async () => {
    const site = addSite();
    fillDay(site.id, "2026-10-05", 288); // today, full: still fetched
    fillPrev(site.id, "2026-10-05", ["2026-10-03"]);
    fillDay(site.id, "2026-10-03", 287); // one short
    const { source, calls } = fakeSource();
    await syncEnergy(mkDeps(source, NOW), site);
    expect(days(calls)).toEqual(["2026-10-03", "2026-10-05"]);
  });

  it("spring-forward day is complete at 276 intervals", async () => {
    const site = addSite();
    const now = Date.UTC(2026, 2, 9, 18, 0, 0); // 2026-03-09 11:00 PDT
    fillPrev(site.id, "2026-03-09", ["2026-03-08"]);
    fillDay(site.id, "2026-03-08", 276);
    const { source, calls } = fakeSource();
    await syncEnergy(mkDeps(source, now), site);
    expect(days(calls)).toEqual(["2026-03-09"]);
  });

  it("fall-back day is complete at 300 intervals, not 288", async () => {
    const now = Date.UTC(2026, 10, 2, 19, 0, 0); // 2026-11-02 11:00 PST
    const a = addSite({ externalId: "a" });
    fillPrev(a.id, "2026-11-02", ["2026-11-01"]);
    fillDay(a.id, "2026-11-01", 288);
    const sa = fakeSource();
    await syncEnergy(mkDeps(sa.source, now), a);
    expect(days(sa.calls)).toEqual(["2026-11-01", "2026-11-02"]);

    const b = addSite({ externalId: "b" });
    fillPrev(b.id, "2026-11-02", ["2026-11-01"]);
    fillDay(b.id, "2026-11-01", 300);
    const sb = fakeSource();
    await syncEnergy(mkDeps(sb.source, now), b);
    expect(days(sb.calls)).toEqual(["2026-11-02"]);
  });

  it("upserts idempotently and updates changed values", async () => {
    const site = addSite();
    const t = localMidnight("2026-10-05", TZ);
    let v = 10;
    const { source } = fakeSource({
      getHistory: vi.fn((_id: string, r: Range) =>
        Promise.resolve(
          r.start_date.startsWith("2026-10-05") ? [interval(t, v), interval(t + FIVE_MIN, v)] : [],
        ),
      ),
    });
    await syncEnergy(mkDeps(source, NOW), site);
    await syncEnergy(mkDeps(source, NOW), site);
    expect(db.select().from(schema.energyIntervals).all()).toHaveLength(2);
    v = 99;
    await syncEnergy(mkDeps(source, NOW), site);
    const all = db.select().from(schema.energyIntervals).all();
    expect(all).toHaveLength(2);
    expect(all.every((r) => r.solarWh === 99 && r.loadWh === 2 && r.batteryDischargeWh === 6)).toBe(true);
    expect(all.map((r) => r.start.getTime()).sort()).toEqual([t, t + FIVE_MIN]);
  });
});

describe("takeSample", () => {
  it("inserts the live sample once (on conflict do nothing)", async () => {
    const site = addSite();
    const { source, getLiveStatus } = fakeSource();
    await takeSample(mkDeps(source, NOW), site);
    await takeSample(mkDeps(source, NOW), site);
    expect(getLiveStatus).toHaveBeenCalledWith("EXT-SECRET-1");
    const r = db.select().from(schema.samples).all();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      siteId: site.id,
      ts: new Date(live.ts),
      solarW: 1000,
      loadW: 500,
      batteryW: -200,
      gridW: -300,
      socPct: 55.5,
      gridStatus: "connected",
    });
  });
});

describe("syncWeather", () => {
  it("skips sites without lat/lon", async () => {
    const site = addSite();
    const f = okFetch();
    await syncWeather(mkDeps(fakeSource().source, FIXTURE_NOW, f), site);
    expect(f).not.toHaveBeenCalled();
    expect(db.select().from(schema.weatherObserved).all()).toHaveLength(0);
    expect(db.select().from(schema.weatherForecast).all()).toHaveLength(0);
  });

  it("stores observed rows and forecast rows issued at now", async () => {
    const site = addSite({ latitude: 34.05, longitude: -118.24 });
    const expected = await fetchWeather({ fetch: okFetch(), lat: 34.05, lon: -118.24, now: FIXTURE_NOW });
    await syncWeather(mkDeps(fakeSource().source, FIXTURE_NOW), site);
    await syncWeather(mkDeps(fakeSource().source, FIXTURE_NOW), site); // idempotent
    const obs = db.select().from(schema.weatherObserved).all();
    const fc = db.select().from(schema.weatherForecast).all();
    expect(obs.length).toBeGreaterThan(0);
    expect(obs).toHaveLength(expected.observed.length);
    expect(fc.length).toBeGreaterThan(0);
    expect(fc).toHaveLength(expected.forecast.length);
    expect(fc.every((r) => r.issuedAt.getTime() === FIXTURE_NOW)).toBe(true);
    expect(fc.map((r) => r.hour.getTime()).sort()).toEqual(expected.forecast.map((r) => r.hour).sort());
  });

  it("keeps earlier forecasts when run again later (forecast-as-issued)", async () => {
    const site = addSite({ latitude: 34.05, longitude: -118.24 });
    await syncWeather(mkDeps(fakeSource().source, FIXTURE_NOW), site);
    const n = db.select().from(schema.weatherForecast).all().length;
    await syncWeather(mkDeps(fakeSource().source, FIXTURE_NOW + 3 * 3_600_000), site);
    const all = db.select().from(schema.weatherForecast).all();
    expect(new Set(all.map((r) => r.issuedAt.getTime())).size).toBe(2);
    expect(all.length).toBeGreaterThan(n);
  });
});

describe("applySiteSettings", () => {
  it("writes set values onto every site row", () => {
    addSite({ externalId: "a" });
    addSite({ externalId: "b" });
    applySiteSettings(db, { SITE_LATITUDE: 34.05, SITE_LONGITUDE: -118.24, TEMPERATURE_UNIT: "F" });
    const all = db.select().from(schema.sites).all();
    expect(all).toHaveLength(2);
    for (const s of all) expect(s).toMatchObject({ latitude: 34.05, longitude: -118.24, temperatureUnit: "F" });
  });
  it("leaves columns alone when the env vars are unset", () => {
    addSite({ latitude: 1.5, longitude: 2.5, temperatureUnit: "C" });
    applySiteSettings(db, {});
    expect(db.select().from(schema.sites).get()).toMatchObject({
      latitude: 1.5,
      longitude: 2.5,
      temperatureUnit: "C",
    });
  });
  it("applies only the vars that are set", () => {
    addSite({ latitude: 1.5, longitude: 2.5 });
    applySiteSettings(db, { TEMPERATURE_UNIT: "C" });
    expect(db.select().from(schema.sites).get()).toMatchObject({
      latitude: 1.5,
      longitude: 2.5,
      temperatureUnit: "C",
    });
  });
});

describe("error isolation", () => {
  function captureLogs() {
    const lines: string[] = [];
    for (const m of ["log", "warn", "error", "info"] as const)
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
    return lines;
  }

  it("a failing site does not stop the next; log has job/site/name/message, no externalId", async () => {
    const lines = captureLogs();
    const bad = addSite({ externalId: "EXT-SECRET-BAD" });
    const good = addSite({ externalId: "EXT-SECRET-GOOD" });
    const { source } = fakeSource({
      getLiveStatus: vi.fn((id: string) =>
        id === "EXT-SECRET-BAD" ? Promise.reject(new AuthExpired("token expired")) : Promise.resolve(live),
      ),
    });
    await runTesla(mkDeps(source, NOW));
    expect(db.select().from(schema.samples).all().map((s) => s.siteId)).toEqual([good.id]);
    expect(lines.some((l) => l.includes(`[worker] takeSample site=${bad.id} AuthExpired: token expired`))).toBe(true);
    expect(lines.join("\n")).not.toContain("EXT-SECRET");
  });

  it("a failing syncEnergy does not stop takeSample for the same site", async () => {
    const lines = captureLogs();
    const site = addSite();
    const { source } = fakeSource({
      getHistory: vi.fn(() => Promise.reject(new Error("boom"))),
    });
    await runTesla(mkDeps(source, NOW));
    expect(db.select().from(schema.samples).all()).toHaveLength(1);
    expect(lines.some((l) => l.includes(`[worker] syncEnergy site=${site.id} Error: boom`))).toBe(true);
    expect(lines.join("\n")).not.toContain("EXT-SECRET");
  });

  it("Tesla jobs run only for fleet-api sites", async () => {
    addSite({ source: "replay", externalId: "other" });
    const { source, calls, getLiveStatus } = fakeSource();
    await runTesla(mkDeps(source, NOW));
    expect(calls).toHaveLength(0);
    expect(getLiveStatus).not.toHaveBeenCalled();
  });

  it("weather runs for every site with lat/lon; a failing site does not stop the next", async () => {
    const lines = captureLogs();
    addSite({ externalId: "w0" }); // no lat/lon: skipped
    const bad = addSite({ externalId: "w1", source: "replay", latitude: 10, longitude: 10 });
    const good = addSite({ externalId: "w2", latitude: 34.05, longitude: -118.24 });
    const f = vi.fn((url: string) =>
      Promise.resolve(url.includes("latitude=10.00") ? new Response("no", { status: 500 }) : new Response(FIXTURE)),
    );
    await runWeather(mkDeps(fakeSource().source, FIXTURE_NOW, f as unknown as typeof fetch));
    expect(f).toHaveBeenCalledTimes(2);
    const sites = new Set(db.select().from(schema.weatherObserved).all().map((r) => r.siteId));
    expect([...sites]).toEqual([good.id]);
    expect(lines.some((l) => l.includes(`[worker] syncWeather site=${bad.id} Error:`))).toBe(true);
  });
});
