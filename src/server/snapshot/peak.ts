// Peak-window history, both averages in SQL over a days CTE (SQLite has no time zones, so JS computes day bounds).
import { eq, min, sql } from "drizzle-orm";
import type { PeakHistory } from "~/lib/dashboard";
import { addDays, localDate, localMidnight, localTime } from "~/lib/time";
import type { db as appDb } from "~/server/db";
import * as s from "~/server/db/schema";

type Db = typeof appDb;
const FIVE = 300_000;

// Bounds are JS-computed integers, so they're safe to inline as literals.
const lit = (n: number) => {
  if (!Number.isSafeInteger(n)) throw new Error(`bad bound ${n}`);
  return String(n);
};

/** Complete site-local days before `today`, oldest first (YYYY-MM-DD). */
export function completeDays(db: Db, siteId: number, tz: string, today: string): string[] {
  const first = db.select({ m: min(s.energyIntervals.start) }).from(s.energyIntervals)
    .where(eq(s.energyIntervals.siteId, siteId)).get()?.m;
  if (first == null) return [];
  const rows: string[] = [];
  for (let d = localDate(first.getTime(), tz); d < today; d = addDays(d, 1)) {
    const a = localMidnight(d, tz), b = localMidnight(addDays(d, 1), tz);
    rows.push(`('${d}',${lit(a)},${lit(b)},${lit((b - a) / FIVE)})`);
  }
  if (!rows.length) return [];
  return db.all<{ day: string }>(sql`
    WITH days(day, a, b, slots) AS (VALUES ${sql.raw(rows.join(","))})
    SELECT day FROM days JOIN energy_intervals e ON e.site_id = ${siteId} AND e.start >= a AND e.start < b
    GROUP BY day HAVING COUNT(*) = slots ORDER BY day`).map((r) => r.day);
}

/** null when days is empty. fromMin/toMin = local minutes after midnight. */
export function peakHistory(
  db: Db,
  siteId: number,
  o: { tz: string; days: string[]; fromMin: number; toMin: number; highC: number },
): PeakHistory | null {
  if (!o.days.length) return null;
  const rows = o.days.map((d) =>
    `('${d}',${lit(localTime(d, o.fromMin, o.tz))},${lit(localTime(d, o.toMin, o.tz))},${lit(localMidnight(d, o.tz))},${lit(localMidnight(addDays(d, 1), o.tz))})`);
  const q = (similar: boolean) => db.get<{ n: number; avg: number | null }>(sql`
    WITH days(day, f, t, d0, d1) AS (VALUES ${sql.raw(rows.join(","))}),
    per AS (
      SELECT day, d0, d1, SUM(e.load_wh) AS wh FROM days
      JOIN energy_intervals e ON e.site_id = ${siteId} AND e.start >= f AND e.start < t
      GROUP BY day
    )
    SELECT COUNT(*) AS n, AVG(wh) AS avg FROM per
    WHERE ${similar ? sql`(SELECT MAX(w.temp_c) FROM weather_observed w WHERE w.site_id = ${siteId} AND w.hour >= d0 AND w.hour < d1) BETWEEN ${o.highC - 3} AND ${o.highC + 3}` : sql`1`}`);
  const all = q(false), sim = q(true);
  const similarTempDays = sim?.n ?? 0;
  return {
    historyAvgWh: Math.round(all?.avg ?? 0),
    highC: o.highC,
    similarTempDays,
    similarTempAvgWh: similarTempDays < 3 ? null : Math.round(sim?.avg ?? 0),
  };
}
