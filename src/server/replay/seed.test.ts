import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asc, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataSource } from "~/lib/core/types";
import { checkSnapshot, peakEstimateWh, reservePlan } from "~/lib/dashboard";
import { mapCalendarHistory } from "~/lib/sources/fleet-api/map";
import { addDays, localDate, localMidnight } from "~/lib/time";
import { mapForecast } from "~/lib/weather/open-meteo";
import { openDb } from "~/server/db";
import * as s from "~/server/db/schema";
import { loadSnapshot } from "~/server/snapshot/load";
import { seedReplay } from "./seed";

// Signature under test (see handoff):
//   seedReplay(db: typeof import("~/server/db").db, now: number): void   (synchronous, one transaction)

const TZ = "America/Los_Angeles";
const HOUR = 3_600_000;
const STEP = 300_000;
const FETCHED = 1791340007841; // fixtures/open-meteo/README.md
const NORMAL = Date.parse("2026-10-06T19:32:10Z");
const FALL = Date.parse("2026-11-01T20:07:00Z"); // 25 h local day
const SPRING = Date.parse("2026-03-08T20:07:00Z"); // 23 h local day
const AFTER_SPRING = Date.parse("2026-03-09T20:07:00Z"); // 3/8 is inside today-7..today

const read = (p: string): unknown =>
  JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));
const fixture = mapCalendarHistory(
  read("fixtures/fleet-api/calendar_history_energy.json"),
);
const fixtureDay = localDate(Date.parse(fixture[0]!.start), TZ);
const offsets = fixture.map(
  (i) => Date.parse(i.start) - localMidnight(fixtureDay, TZ),
);

let dir: string;
let db: ReturnType<typeof openDb>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "voltops-replay-"));
  db = openDb(join(dir, "test.db"));
  migrate(db, { migrationsFolder: "drizzle" });
});
afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

const siteOf = () =>
  db.select().from(s.sites).where(eq(s.sites.source, "replay")).all();
const intervals = (id: number) =>
  db
    .select()
    .from(s.energyIntervals)
    .where(eq(s.energyIntervals.siteId, id))
    .orderBy(asc(s.energyIntervals.start))
    .all();
const samplesOf = (id: number) =>
  db
    .select()
    .from(s.samples)
    .where(eq(s.samples.siteId, id))
    .orderBy(asc(s.samples.ts))
    .all();
const counts = (id: number) => [
  intervals(id).length,
  samplesOf(id).length,
  db.select().from(s.weatherForecast).all().length,
  db.select().from(s.weatherObserved).all().length,
];

describe.each([
  ["normal day", NORMAL],
  ["fall-back day", FALL],
  ["spring-forward day", SPRING],
])("seedReplay (%s)", (_n, now) => {
  const today = localDate(now, TZ);
  const first = localMidnight(addDays(today, -7), TZ);

  beforeEach(() => seedReplay(db, now));

  it("creates the demo site and tariff", () => {
    const [site] = siteOf();
    expect(site).toMatchObject({
      source: "replay",
      externalId: "replay",
      name: "Demo home",
      timezone: TZ,
      usableCapacityWh: 27000,
      backupReservePct: 20,
      latitude: 34.05,
      longitude: -118.24,
      temperatureUnit: "F",
    });
    const t = db
      .select()
      .from(s.tariffSchedule)
      .where(eq(s.tariffSchedule.siteId, site!.id))
      .get();
    const info = (
      read("fixtures/fleet-api/site_info.json") as {
        response: { tariff_content: unknown };
      }
    ).response;
    expect(t).toMatchObject({
      tariffId: "replay",
      currency: "USD",
      content: info.tariff_content,
    });
  });

  it("copies the fixture onto 8 local dates, balanced, never after now", () => {
    const rows = intervals(siteOf()[0]!.id);
    const dates = new Set(rows.map((r) => localDate(r.start.getTime(), TZ)));
    expect([...dates].sort()).toEqual(
      Array.from({ length: 8 }, (_, i) => addDays(today, i - 7)),
    );
    for (const r of rows) {
      expect(r.solarWh + r.batteryDischargeWh + r.gridImportWh).toBe(
        r.loadWh + r.batteryChargeWh + r.gridExportWh,
      );
      expect(r.start.getTime() + STEP).toBeLessThanOrEqual(now);
    }
    // Today: exactly the slots that have completed by now.
    const lm = localMidnight(today, TZ);
    const todayRows = rows.filter(
      (r) => localDate(r.start.getTime(), TZ) === today,
    );
    expect(todayRows.length).toBe(
      offsets.filter((o) => lm + o + STEP <= now).length,
    );
    // First day starts at its local midnight + the fixture's first offset, same Wh.
    expect(rows[0]!.start.getTime()).toBe(first + offsets[0]!);
    expect(rows[0]!.solarWh).toBe(fixture[0]!.solarWh);
    expect(rows[0]!.loadWh).toBe(fixture[0]!.loadWh);
  });

  it("writes hourly balanced samples with SoC 0-100 and a final sample at now", () => {
    const id = siteOf()[0]!.id;
    const rows = samplesOf(id);
    const ts = rows.map((r) => r.ts.getTime());
    expect(ts[0]).toBe(first);
    expect(ts.at(-1)).toBe(now);
    const hours = ts.slice(0, -1);
    expect(hours).toEqual(
      Array.from({ length: hours.length }, (_, i) => first + i * HOUR),
    );
    expect(hours.at(-1)! + HOUR).toBeGreaterThan(now);
    for (const r of rows) {
      expect(
        Math.abs(r.solarW + r.batteryW + r.gridW - r.loadW),
      ).toBeLessThanOrEqual(50);
      expect(r.socPct).toBeGreaterThanOrEqual(0);
      expect(r.socPct).toBeLessThanOrEqual(100);
      expect(r.gridStatus).toBe("connected");
    }
    const iv = intervals(id)[0]!;
    expect(rows[0]).toMatchObject({
      solarW: iv.solarWh * 12,
      loadW: iv.loadWh * 12,
      batteryW: (iv.batteryDischargeWh - iv.batteryChargeWh) * 12,
      gridW: (iv.gridImportWh - iv.gridExportWh) * 12,
    });
  });

  it("places weather on today/tomorrow, forecast issued at now", () => {
    const id = siteOf()[0]!.id;
    const src = mapForecast(read("fixtures/open-meteo/forecast.json"), FETCHED);
    const fc = db
      .select()
      .from(s.weatherForecast)
      .where(eq(s.weatherForecast.siteId, id))
      .all();
    const ob = db
      .select()
      .from(s.weatherObserved)
      .where(eq(s.weatherObserved.siteId, id))
      .all();
    expect(fc.length).toBe(src.forecast.length);
    expect(ob.length).toBe(src.observed.length);
    expect(fc.every((r) => r.issuedAt.getTime() === now)).toBe(true);
    const firstFc = Math.min(...fc.map((r) => r.hour.getTime()));
    const shift = firstFc - src.forecast[0]!.hour;
    expect(Math.abs(shift % HOUR)).toBe(0);
    expect(localDate(FETCHED + shift, TZ)).toBe(today);
    const days = new Set(fc.map((r) => localDate(r.hour.getTime(), TZ)));
    expect(days.has(today)).toBe(true);
    expect(days.has(addDays(today, 1))).toBe(true);
  });

  it("re-seeding replaces rather than duplicates", () => {
    const before = counts(siteOf()[0]!.id);
    seedReplay(db, now);
    expect(siteOf()).toHaveLength(1);
    expect(counts(siteOf()[0]!.id)).toEqual(before);
    expect(db.select().from(s.tariffSchedule).all()).toHaveLength(1);
  });

  it("produces a snapshot that passes checkSnapshot", async () => {
    const source: DataSource = {
      id: "fleet-api",
      getLiveStatus: vi.fn(async () => {
        throw new Error("replay must not touch the source");
      }),
      getHistory: vi.fn(async () => []),
    };
    const snap = await loadSnapshot({ db, source, now }, siteOf()[0]!.id);
    expect(checkSnapshot(snap)).toEqual([]);
    // 7 complete days (today-7 .. today-1) of the 27 kWh demo home: the advice shows up.
    expect(snap.peakEstimate.historyDays).toBe(7);
    expect(snap.peakEstimate.today).not.toBeNull();
    expect(snap.peakEstimate.tomorrow).not.toBeNull();
    expect(snap.recommendation?.reserve).toEqual(
      reservePlan(peakEstimateWh(snap.peakEstimate.tomorrow!), 27000, 20),
    );
    expect(snap.recommendation?.action).toBe(
      `Raise backup reserve to ${snap.recommendation?.reserve?.targetPct}%`,
    );
  });
});

describe("seedReplay misc", () => {
  it("skips non-existent slots on a 23 h day (3/8 has 276 intervals)", () => {
    seedReplay(db, AFTER_SPRING);
    const rows = intervals(siteOf()[0]!.id).filter(
      (r) => localDate(r.start.getTime(), TZ) === "2026-03-08",
    );
    expect(rows).toHaveLength(276);
  });

  it("leaves other sources' sites alone", () => {
    db.insert(s.sites).values({ source: "fleet-api", externalId: "x1" }).run();
    seedReplay(db, NORMAL);
    expect(
      db.select().from(s.sites).where(eq(s.sites.source, "fleet-api")).all(),
    ).toHaveLength(1);
  });
});
