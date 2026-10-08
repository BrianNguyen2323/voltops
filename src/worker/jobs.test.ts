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
  fillWeatherGaps,
  isTeslaIdle,
  parseSiteSettings,
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
    .values({
      source: "fleet-api",
      externalId: "EXT-SECRET-1",
      timezone: TZ,
      ...o,
    })
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
const okFetch = () =>
  vi.fn(() =>
    Promise.resolve(new Response(FIXTURE)),
  ) as unknown as typeof fetch;
const mkDeps = (
  source: DataSource,
  now: number,
  f: typeof fetch = okFetch(),
) => ({
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
const days = (calls: { range: Range }[]) =>
  calls.map((c) => c.range.start_date.slice(0, 10)).sort();

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
    expect(dayRange("2026-10-05", TZ, NOW).end_date).toBe(
      "2026-10-05T11:00:00-07:00",
    );
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
    const today = calls.find((c) =>
      c.range.start_date.startsWith("2026-10-05"),
    )!;
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

  it("upserts idempotently and updates changed values", async () => {
    const site = addSite();
    const t = localMidnight("2026-10-05", TZ);
    let v = 10;
    const { source } = fakeSource({
      getHistory: vi.fn((_id: string, r: Range) =>
        Promise.resolve(
          r.start_date.startsWith("2026-10-05")
            ? [interval(t, v), interval(t + FIVE_MIN, v)]
            : [],
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
    expect(
      all.every(
        (r) => r.solarWh === 99 && r.loadWh === 2 && r.batteryDischargeWh === 6,
      ),
    ).toBe(true);
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
    const expected = await fetchWeather({
      fetch: okFetch(),
      lat: 34.05,
      lon: -118.24,
      now: FIXTURE_NOW,
    });
    await syncWeather(mkDeps(fakeSource().source, FIXTURE_NOW), site);
    await syncWeather(mkDeps(fakeSource().source, FIXTURE_NOW), site); // idempotent
    const obs = db.select().from(schema.weatherObserved).all();
    const fc = db.select().from(schema.weatherForecast).all();
    expect(obs.length).toBeGreaterThan(0);
    expect(obs).toHaveLength(expected.observed.length);
    expect(fc.length).toBeGreaterThan(0);
    expect(fc).toHaveLength(expected.forecast.length);
    expect(fc.every((r) => r.issuedAt.getTime() === FIXTURE_NOW)).toBe(true);
    expect(fc.map((r) => r.hour.getTime()).sort()).toEqual(
      expected.forecast.map((r) => r.hour).sort(),
    );
  });

  it("keeps earlier forecasts when run again later (forecast-as-issued)", async () => {
    const site = addSite({ latitude: 34.05, longitude: -118.24 });
    await syncWeather(mkDeps(fakeSource().source, FIXTURE_NOW), site);
    const n = db.select().from(schema.weatherForecast).all().length;
    await syncWeather(
      mkDeps(fakeSource().source, FIXTURE_NOW + 3 * 3_600_000),
      site,
    );
    const all = db.select().from(schema.weatherForecast).all();
    expect(new Set(all.map((r) => r.issuedAt.getTime())).size).toBe(2);
    expect(all.length).toBeGreaterThan(n);
  });
});

describe("applySiteSettings", () => {
  it("writes set values onto every site row", () => {
    addSite({ externalId: "a" });
    addSite({ externalId: "b" });
    applySiteSettings(db, {
      SITE_LATITUDE: 34.05,
      SITE_LONGITUDE: -118.24,
      TEMPERATURE_UNIT: "F",
    });
    const all = db.select().from(schema.sites).all();
    expect(all).toHaveLength(2);
    for (const s of all)
      expect(s).toMatchObject({
        latitude: 34.05,
        longitude: -118.24,
        temperatureUnit: "F",
      });
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
      vi.spyOn(console, m).mockImplementation(
        (...a: unknown[]) => void lines.push(a.map(String).join(" ")),
      );
    return lines;
  }

  it("a failing site does not stop the next; log has job/site/name/message, no externalId", async () => {
    const lines = captureLogs();
    const bad = addSite({ externalId: "EXT-SECRET-BAD" });
    const good = addSite({ externalId: "EXT-SECRET-GOOD" });
    const { source } = fakeSource({
      getLiveStatus: vi.fn((id: string) =>
        id === "EXT-SECRET-BAD"
          ? Promise.reject(new AuthExpired("token expired"))
          : Promise.resolve(live),
      ),
    });
    await runTesla(mkDeps(source, NOW));
    expect(
      db
        .select()
        .from(schema.samples)
        .all()
        .map((s) => s.siteId),
    ).toEqual([good.id]);
    expect(
      lines.some((l) =>
        l.includes(
          `[worker] takeSample site=${bad.id} AuthExpired: token expired`,
        ),
      ),
    ).toBe(true);
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
    expect(
      lines.some((l) =>
        l.includes(`[worker] syncEnergy site=${site.id} Error: boom`),
      ),
    ).toBe(true);
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
    const bad = addSite({
      externalId: "w1",
      source: "replay",
      latitude: 10,
      longitude: 10,
    });
    const good = addSite({
      externalId: "w2",
      latitude: 34.05,
      longitude: -118.24,
    });
    const f = vi.fn((url: string) =>
      Promise.resolve(
        url.includes("latitude=10.00")
          ? new Response("no", { status: 500 })
          : new Response(FIXTURE),
      ),
    );
    await runWeather(
      mkDeps(fakeSource().source, FIXTURE_NOW, f as unknown as typeof fetch),
    );
    expect(f).toHaveBeenCalledTimes(2);
    const sites = new Set(
      db
        .select()
        .from(schema.weatherObserved)
        .all()
        .map((r) => r.siteId),
    );
    expect([...sites]).toEqual([good.id]);
    expect(
      lines.some((l) =>
        l.includes(`[worker] syncWeather site=${bad.id} Error:`),
      ),
    ).toBe(true);
  });
});

// Contract (new exports in jobs.ts): parseSiteSettings(env: Record<string, string | undefined>)
// -> { SITE_LATITUDE?, SITE_LONGITUDE?, TEMPERATURE_UNIT? }, "" treated as unset;
// isTeslaIdle(db) -> true when no credentials row OR no fleet-api site (main.ts logs the idle line once).
describe("B011 syncEnergy order and per-day isolation", () => {
  const rec = (
    calls: { id: string; range: Range }[],
    fail: (d: string) => boolean,
  ) =>
    vi.fn((id: string, r: Range) => {
      calls.push({ id, range: r });
      return fail(r.start_date.slice(0, 10))
        ? Promise.reject(new Error(`rate ${r.start_date.slice(0, 10)}`))
        : Promise.resolve([] as EnergyInterval[]);
    });

  it("fetches today first, then past days newest to oldest", async () => {
    const site = addSite();
    const { source, calls } = fakeSource();
    await syncEnergy(mkDeps(source, NOW), site);
    expect(calls.map((c) => c.range.start_date.slice(0, 10))).toEqual(
      Array.from({ length: 8 }, (_, i) => addDays("2026-10-05", -i)),
    );
  });

  it("a failing past day does not stop the others or today; first error rethrown", async () => {
    const site = addSite();
    const calls: { id: string; range: Range }[] = [];
    const { source } = fakeSource({
      getHistory: rec(calls, (d) => d === "2026-10-04" || d === "2026-10-02"),
    });
    await expect(syncEnergy(mkDeps(source, NOW), site)).rejects.toThrow(
      "rate 2026-10-04",
    );
    expect(calls).toHaveLength(8);
    expect(days(calls)).toContain("2026-10-05");
  });

  it("today failing does not skip the backfill days", async () => {
    const site = addSite();
    const calls: { id: string; range: Range }[] = [];
    const { source } = fakeSource({
      getHistory: rec(calls, (d) => d === "2026-10-05"),
    });
    await expect(syncEnergy(mkDeps(source, NOW), site)).rejects.toThrow(
      "rate 2026-10-05",
    );
    expect(calls).toHaveLength(8);
  });

  it("runTesla logs the failure once and still fetches today", async () => {
    const lines: string[] = [];
    for (const m of ["log", "warn", "error", "info"] as const)
      vi.spyOn(console, m).mockImplementation(
        (...a: unknown[]) => void lines.push(a.map(String).join(" ")),
      );
    const site = addSite();
    const calls: { id: string; range: Range }[] = [];
    const { source } = fakeSource({
      getHistory: rec(calls, (d) => d === "2026-10-04" || d === "2026-10-03"),
    });
    await runTesla(mkDeps(source, NOW));
    expect(days(calls)).toContain("2026-10-05");
    expect(
      lines.filter((l) => l.includes(`[worker] syncEnergy site=${site.id}`)),
    ).toHaveLength(1);
  });
});

describe("B011 parseSiteSettings", () => {
  it("empty strings count as unset, not 0", () => {
    const r = parseSiteSettings({
      SITE_LATITUDE: "",
      SITE_LONGITUDE: "",
      TEMPERATURE_UNIT: "",
    });
    expect(r.SITE_LATITUDE).toBeUndefined();
    expect(r.SITE_LONGITUDE).toBeUndefined();
    expect(r.TEMPERATURE_UNIT).toBeUndefined();
  });
  it("parses real values, including a genuine 0", () => {
    expect(
      parseSiteSettings({
        SITE_LATITUDE: "37.5",
        SITE_LONGITUDE: "0",
        TEMPERATURE_UNIT: "C",
      }),
    ).toMatchObject({
      SITE_LATITUDE: 37.5,
      SITE_LONGITUDE: 0,
      TEMPERATURE_UNIT: "C",
    });
  });
  it("blank coords do not overwrite a site's coords", () => {
    const site = addSite({ latitude: 40, longitude: -100 });
    applySiteSettings(
      db,
      parseSiteSettings({ SITE_LATITUDE: "", SITE_LONGITUDE: "" }),
    );
    const row = db
      .select()
      .from(schema.sites)
      .all()
      .find((x) => x.id === site.id)!;
    expect([row.latitude, row.longitude]).toEqual([40, -100]);
  });
});

describe("B011 isTeslaIdle", () => {
  const cred = () =>
    db
      .insert(schema.credentials)
      .values({ id: 1, encryptedRefreshToken: "x", iv: "y" })
      .run();
  it("idle with a fleet-api site but no credentials row", () => {
    addSite();
    expect(isTeslaIdle(db)).toBe(true);
  });
  it("idle with credentials but no fleet-api site", () => {
    cred();
    addSite({ source: "replay", externalId: "r" });
    expect(isTeslaIdle(db)).toBe(true);
  });
  it("not idle with credentials and a fleet-api site", () => {
    cred();
    addSite();
    expect(isTeslaIdle(db)).toBe(false);
  });
  it("weather still runs for sites with lat/lon when idle", async () => {
    addSite({ latitude: 37, longitude: -122 });
    expect(isTeslaIdle(db)).toBe(true);
    const f = okFetch();
    await runWeather(mkDeps(fakeSource().source, FIXTURE_NOW, f));
    expect(f).toHaveBeenCalled();
  });
});

// B017 weather gap-fill. Contract: fillWeatherGaps(deps, site) exported from ./jobs.
describe("B017 fillWeatherGaps", () => {
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  const LL = { latitude: 34.05, longitude: -118.24 };

  /** Fake Open-Meteo: UTC hourly series from (UTC midnight of now) - past_days, for past_days + forecast_days days. */
  function meteo(now: number) {
    return vi.fn((url: string) => {
      const p = new URL(url).searchParams;
      const past = Number(p.get("past_days"));
      const fut = Number(p.get("forecast_days"));
      const t0 = Math.floor(now / DAY) * DAY - past * DAY;
      const time = Array.from(
        { length: (past + fut) * 24 },
        (_, i) => (t0 + i * HOUR) / 1000,
      );
      const col = (v: number) => time.map(() => v);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            hourly: {
              time,
              temperature_2m: col(10),
              cloud_cover: col(50),
              shortwave_radiation: col(100),
              precipitation: col(0),
              precipitation_probability: col(0),
            },
          }),
        ),
      );
    });
  }
  type Meteo = ReturnType<typeof meteo>;
  const asFetch = (f: Meteo) => f as unknown as typeof fetch;
  const urlOf = (f: Meteo, i = 0) =>
    new URL(String((f.mock.calls[i] as unknown[])[0]));
  const run = (f: Meteo, now: number, site: Site) =>
    fillWeatherGaps(mkDeps(fakeSource().source, now, asFetch(f)), site);

  function seedWeather(siteId: number, date: string, n: number) {
    const start = localMidnight(date, TZ);
    db.insert(schema.weatherObserved)
      .values(
        Array.from({ length: n }, (_, i) => ({
          siteId,
          hour: new Date(start + i * HOUR),
          tempC: 1,
          cloudPct: 1,
          ghiWm2: 1,
          precipMm: 0,
        })),
      )
      .run();
  }
  const seedEnergy = (siteId: number, date: string) => fillDay(siteId, date, 1);
  const obsHours = (siteId: number) =>
    db
      .select()
      .from(schema.weatherObserved)
      .all()
      .filter((r) => r.siteId === siteId)
      .map((r) => r.hour.getTime())
      .sort((a, b) => a - b);
  const dayHours = (date: string, n = 24) =>
    Array.from({ length: n }, (_, i) => localMidnight(date, TZ) + i * HOUR);

  it("energy on 3 past days, weather on 1: one call, past_days to oldest gap, rows only for gap days, no forecast rows", async () => {
    const site = addSite(LL);
    for (const d of ["2026-10-02", "2026-10-03", "2026-10-04"])
      seedEnergy(site.id, d);
    seedWeather(site.id, "2026-10-04", 24);
    const f = meteo(NOW);
    await run(f, NOW, site);
    expect(f).toHaveBeenCalledTimes(1);
    const p = urlOf(f).searchParams;
    expect(p.get("past_days")).toBe("3");
    expect(p.get("forecast_days")).toBe("1");
    expect(obsHours(site.id)).toEqual([
      ...dayHours("2026-10-02"),
      ...dayHours("2026-10-03"),
      ...dayHours("2026-10-04"),
    ]);
    expect(db.select().from(schema.weatherForecast).all()).toHaveLength(0);
  });

  it("does not touch full days or today", async () => {
    const site = addSite(LL);
    seedEnergy(site.id, "2026-10-03");
    seedEnergy(site.id, "2026-10-04");
    seedWeather(site.id, "2026-10-04", 24);
    await run(meteo(NOW), NOW, site);
    const rows = db.select().from(schema.weatherObserved).all();
    const d4 = new Set(dayHours("2026-10-04"));
    expect(
      rows.filter((r) => d4.has(r.hour.getTime())).every((r) => r.tempC === 1),
    ).toBe(true);
    expect(
      rows.some((r) => r.hour.getTime() >= localMidnight("2026-10-05", TZ)),
    ).toBe(false);
  });

  it("an energy-less day between two gap days is not written", async () => {
    const site = addSite(LL);
    seedEnergy(site.id, "2026-10-02");
    seedEnergy(site.id, "2026-10-04");
    const f = meteo(NOW);
    await run(f, NOW, site);
    expect(urlOf(f).searchParams.get("past_days")).toBe("3");
    expect(obsHours(site.id)).toEqual([
      ...dayHours("2026-10-02"),
      ...dayHours("2026-10-04"),
    ]);
  });

  it("window is 92 days: day 92 back is filled, day 93 and 100 back are ignored", async () => {
    const site = addSite(LL);
    seedEnergy(site.id, addDays("2026-10-05", -92));
    seedEnergy(site.id, addDays("2026-10-05", -93));
    seedEnergy(site.id, addDays("2026-10-05", -100));
    const f = meteo(NOW);
    await run(f, NOW, site);
    expect(urlOf(f).searchParams.get("past_days")).toBe("92");
    expect(obsHours(site.id)).toEqual(dayHours(addDays("2026-10-05", -92)));
  });

  it("no gap: fetch is not called", async () => {
    const site = addSite(LL);
    seedEnergy(site.id, "2026-10-04");
    seedWeather(site.id, "2026-10-04", 24);
    const f = meteo(NOW);
    await run(f, NOW, site);
    expect(f).not.toHaveBeenCalled();
  });

  it("no lat/lon: fetch is not called", async () => {
    const site = addSite();
    seedEnergy(site.id, "2026-10-04");
    const f = meteo(NOW);
    await run(f, NOW, site);
    expect(f).not.toHaveBeenCalled();
    expect(obsHours(site.id)).toHaveLength(0);
  });

  it("is idempotent: a second run makes no call and changes nothing", async () => {
    const site = addSite(LL);
    seedEnergy(site.id, "2026-10-03");
    seedEnergy(site.id, "2026-10-04");
    const f = meteo(NOW);
    await run(f, NOW, site);
    const before = db.select().from(schema.weatherObserved).all();
    expect(before).toHaveLength(48);
    await run(f, NOW, site);
    expect(f).toHaveBeenCalledTimes(1);
    expect(db.select().from(schema.weatherObserved).all()).toEqual(before);
  });

  it("runWeather runs the gap-fill after syncWeather", async () => {
    const site = addSite(LL);
    seedEnergy(site.id, "2026-10-02");
    const f = meteo(NOW);
    await runWeather(mkDeps(fakeSource().source, NOW, asFetch(f)));
    expect(f).toHaveBeenCalledTimes(2);
    expect(urlOf(f, 0).searchParams.get("past_days")).toBe("1");
    expect(urlOf(f, 1).searchParams.get("past_days")).toBe("3");
    expect(obsHours(site.id)).toEqual(
      expect.arrayContaining(dayHours("2026-10-02")),
    );
  });

  it("runWeather keeps going when the gap-fill throws, and logs it via guarded", async () => {
    const lines: string[] = [];
    for (const m of ["log", "warn", "error", "info"] as const)
      vi.spyOn(console, m).mockImplementation(
        (...a: unknown[]) => void lines.push(a.map(String).join(" ")),
      );
    const bad = addSite({ ...LL, externalId: "bad" });
    seedEnergy(bad.id, "2026-10-02");
    const good = addSite({ latitude: 10, longitude: 10, externalId: "good" });
    const ok = meteo(NOW);
    const f = vi.fn((url: string) =>
      url.includes("forecast_days=1")
        ? Promise.resolve(new Response("x", { status: 500 }))
        : ok(url),
    );
    await runWeather(
      mkDeps(fakeSource().source, NOW, f as unknown as typeof fetch),
    );
    expect(
      lines.some((l) =>
        l.includes(
          `[worker] fillWeatherGaps site=${bad.id} Error: open-meteo: 500`,
        ),
      ),
    ).toBe(true);
    expect(obsHours(good.id).length).toBeGreaterThan(0);
  });

  // B018: past_days counts UTC days, so a site behind UTC in the evening is a UTC day ahead.
  it("B018 evening local (03:00 UTC next day): past_days covers the oldest gap day's whole span", async () => {
    const now = Date.UTC(2026, 9, 6, 3, 0, 0); // 2026-10-05 20:00 PDT
    const site = addSite(LL);
    seedEnergy(site.id, "2026-10-02"); // 3 local days back, spans 10-02 07:00Z .. 10-03 07:00Z
    const f = meteo(now);
    await run(f, now, site);
    expect(f).toHaveBeenCalledTimes(1);
    expect(urlOf(f).searchParams.get("past_days")).toBe("4");
    expect(obsHours(site.id)).toEqual(dayHours("2026-10-02"));
    await run(f, now, site);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
