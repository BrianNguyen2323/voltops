// The one module that reads and writes energy_intervals and weather_observed for a Site.
import { and, asc, count, eq, gte, lt, max, min, sql } from "drizzle-orm";
import type { EnergyInterval } from "~/lib/core/types";
import type { PeakHistory } from "~/lib/dashboard";
import { addDays, localDate, localMidnight, localTime } from "~/lib/time";
import type { openDb } from "~/server/db";
import * as s from "~/server/db/schema";

type Db = ReturnType<typeof openDb>;

export type HourEnergy = {
  start: number;
  solarWh: number;
  loadWh: number;
  gridImportWh: number;
  gridExportWh: number;
  batteryChargeWh: number;
  batteryDischargeWh: number;
};
export type ObservedHour = {
  hour: number;
  tempC: number;
  cloudPct: number;
  ghiWm2: number;
  precipMm: number;
};

const FIVE = 300_000;
const HOUR = 3_600_000;
const GAP_DAYS = 92;

// Bounds are JS-computed integers, so they're safe to inline as literals.
const lit = (n: number) => {
  if (!Number.isSafeInteger(n)) throw new Error(`bad bound ${n}`);
  return String(n);
};
const day = (d: string) => {
  if (!/^\d{4}-\d\d-\d\d$/.test(d)) throw new Error(`bad day ${d}`);
  return d;
};

export function energyHistory(
  db: Db,
  site: { id: number; timezone: string | null },
) {
  const tz = site.timezone ?? "UTC";
  const e = s.energyIntervals;
  const w = s.weatherObserved;
  const range = (from: string, to: string) => [
    localMidnight(from, tz),
    localMidnight(to, tz),
  ];
  const slots = (d: string) =>
    (localMidnight(addDays(d, 1), tz) - localMidnight(d, tz)) / FIVE;
  // The one "complete day" rule: at least the day's 5-min slot count (extra or misaligned rows still count).
  // completeDays applies the same rule in SQL as `COUNT(*) >= slots`.
  const isFull = (n: number, date: string) => n >= slots(date);

  const isComplete = (date: string) =>
    isFull(
      db
        .select({ n: count() })
        .from(e)
        .where(
          and(
            eq(e.siteId, site.id),
            gte(e.start, new Date(localMidnight(date, tz))),
            lt(e.start, new Date(localMidnight(addDays(date, 1), tz))),
          ),
        )
        .get()!.n,
      date,
    );

  return {
    putIntervals(rows: EnergyInterval[]) {
      for (const r of rows) {
        const v = {
          siteId: site.id,
          start: new Date(r.start),
          solarWh: r.solarWh,
          loadWh: r.loadWh,
          gridImportWh: r.gridImportWh,
          gridExportWh: r.gridExportWh,
          batteryChargeWh: r.batteryChargeWh,
          batteryDischargeWh: r.batteryDischargeWh,
        };
        db.insert(e)
          .values(v)
          .onConflictDoUpdate({ target: [e.siteId, e.start], set: v })
          .run();
      }
    },

    putObserved(rows: ObservedHour[]) {
      db.transaction((tx) => {
        for (const r of rows) {
          const v = {
            siteId: site.id,
            hour: new Date(r.hour),
            tempC: r.tempC,
            cloudPct: r.cloudPct,
            ghiWm2: r.ghiWm2,
            precipMm: r.precipMm,
          };
          tx.insert(w)
            .values(v)
            .onConflictDoUpdate({ target: [w.siteId, w.hour], set: v })
            .run();
        }
      });
    },

    hours(from: string, to: string): HourEnergy[] {
      const [a, b] = range(from, to);
      const bucket = sql<number>`cast(${e.start} / 3600000 as integer) * 3600000`;
      return db
        .select({
          start: bucket,
          solarWh: sql<number>`sum(${e.solarWh})`,
          loadWh: sql<number>`sum(${e.loadWh})`,
          gridImportWh: sql<number>`sum(${e.gridImportWh})`,
          gridExportWh: sql<number>`sum(${e.gridExportWh})`,
          batteryChargeWh: sql<number>`sum(${e.batteryChargeWh})`,
          batteryDischargeWh: sql<number>`sum(${e.batteryDischargeWh})`,
        })
        .from(e)
        .where(
          and(
            eq(e.siteId, site.id),
            gte(e.start, new Date(a!)),
            lt(e.start, new Date(b!)),
          ),
        )
        .groupBy(bucket)
        .orderBy(asc(bucket))
        .all()
        .map((h) => ({
          start: Number(h.start),
          solarWh: Number(h.solarWh),
          loadWh: Number(h.loadWh),
          gridImportWh: Number(h.gridImportWh),
          gridExportWh: Number(h.gridExportWh),
          batteryChargeWh: Number(h.batteryChargeWh),
          batteryDischargeWh: Number(h.batteryDischargeWh),
        }));
    },

    observed(from: string, to: string): ObservedHour[] {
      const [a, b] = range(from, to);
      return db
        .select()
        .from(w)
        .where(
          and(
            eq(w.siteId, site.id),
            gte(w.hour, new Date(a!)),
            lt(w.hour, new Date(b!)),
          ),
        )
        .orderBy(asc(w.hour))
        .all()
        .map((r) => ({
          hour: r.hour.getTime(),
          tempC: r.tempC,
          cloudPct: r.cloudPct,
          ghiWm2: r.ghiWm2,
          precipMm: r.precipMm,
        }));
    },

    isComplete,

    completeDays(before: string): string[] {
      const first = db
        .select({ m: min(e.start) })
        .from(e)
        .where(eq(e.siteId, site.id))
        .get()?.m;
      if (first == null) return [];
      const rows: string[] = [];
      for (
        let d = localDate(first.getTime(), tz);
        d < before;
        d = addDays(d, 1)
      ) {
        const a = localMidnight(d, tz);
        const b = localMidnight(addDays(d, 1), tz);
        rows.push(`('${day(d)}',${lit(a)},${lit(b)},${lit((b - a) / FIVE)})`);
      }
      if (!rows.length) return [];
      return db
        .all<{ day: string }>(
          sql`
    WITH days(day, a, b, slots) AS (VALUES ${sql.raw(rows.join(","))})
    SELECT day FROM days JOIN energy_intervals e ON e.site_id = ${site.id} AND e.start >= a AND e.start < b
    GROUP BY day HAVING COUNT(*) >= slots ORDER BY day`,
        )
        .map((r) => r.day);
    },

    weatherGaps(today: string): string[] {
      const from = localMidnight(addDays(today, -GAP_DAYS), tz);
      const to = localMidnight(today, tz);
      // distinct UTC hour buckets instead of every 5-min interval;
      // same local-date set for whole-hour time zones
      const energyDays = new Set(
        db
          .selectDistinct({
            hour: sql<number>`(${e.start} / ${HOUR}) * ${HOUR}`,
          })
          .from(e)
          .where(
            and(
              eq(e.siteId, site.id),
              gte(e.start, new Date(from)),
              lt(e.start, new Date(to)),
            ),
          )
          .all()
          .map((r) => localDate(Number(r.hour), tz)),
      );
      const have = new Map<string, number>();
      for (const r of db
        .select({ hour: w.hour })
        .from(w)
        .where(
          and(
            eq(w.siteId, site.id),
            gte(w.hour, new Date(from)),
            lt(w.hour, new Date(to)),
          ),
        )
        .all()) {
        const d = localDate(r.hour.getTime(), tz);
        have.set(d, (have.get(d) ?? 0) + 1);
      }
      return [...energyDays]
        .filter(
          (d) =>
            (have.get(d) ?? 0) <
            (localMidnight(addDays(d, 1), tz) - localMidnight(d, tz)) / HOUR,
        )
        .sort();
    },

    peakAverage(o: {
      days: string[];
      fromMin: number;
      toMin: number;
      highC: number;
    }): PeakHistory | null {
      if (!o.days.length) return null;
      const rows = o.days.map(
        (d) =>
          `('${day(d)}',${lit(localTime(d, o.fromMin, tz))},${lit(localTime(d, o.toMin, tz))},${lit(localMidnight(d, tz))},${lit(localMidnight(addDays(d, 1), tz))})`,
      );
      const q = (similar: boolean) =>
        db.get<{ n: number; avg: number | null }>(sql`
    WITH days(day, f, t, d0, d1) AS (VALUES ${sql.raw(rows.join(","))}),
    per AS (
      SELECT day, d0, d1, SUM(e.load_wh) AS wh FROM days
      JOIN energy_intervals e ON e.site_id = ${site.id} AND e.start >= f AND e.start < t
      GROUP BY day
    )
    SELECT COUNT(*) AS n, AVG(wh) AS avg FROM per
    WHERE ${similar ? sql`ABS((SELECT MAX(w.temp_c) FROM weather_observed w WHERE w.site_id = ${site.id} AND w.hour >= d0 AND w.hour < d1) - ${o.highC}) <= 3` : sql`1`}`);
      const all = q(false);
      const sim = q(true);
      const similarTempDays = sim?.n ?? 0;
      return {
        historyAvgWh: Math.round(all?.avg ?? 0),
        highC: o.highC,
        similarTempDays,
        similarTempAvgWh:
          similarTempDays < 3 ? null : Math.round(sim?.avg ?? 0),
      };
    },

    latestStart(): number | null {
      return (
        db
          .select({ t: max(e.start) })
          .from(e)
          .where(eq(e.siteId, site.id))
          .get()
          ?.t?.getTime() ?? null
      );
    },
  };
}
