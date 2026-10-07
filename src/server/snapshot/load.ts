// Reads everything a snapshot needs from the DB (and the live source), then calls buildSnapshot.
import { and, asc, desc, eq, gte, lt, min, sql } from "drizzle-orm";
import type { DataSource, LiveSample } from "~/lib/core/types";
import type { DashboardSnapshot } from "~/lib/dashboard";
import { parseTariff } from "~/lib/tariff";
import { addDays, localDate, localMidnight } from "~/lib/time";
import type { db as appDb } from "~/server/db";
import * as s from "~/server/db/schema";
import { buildSnapshot } from "./build";

type Db = typeof appDb;
const LIVE_TTL = 60_000;

// ponytail: per-process cache, one entry per site; fine for a single-household server.
const liveCache = new Map<number, { at: number; live: LiveSample }>();

export function firstSiteId(db: Db): number | null {
  return db.select({ id: min(s.sites.id) }).from(s.sites).get()?.id ?? null;
}

export async function loadSnapshot(
  { db, source, now }: { db: Db; source: DataSource; now: number },
  siteId: number,
): Promise<DashboardSnapshot> {
  const site = db.select().from(s.sites).where(eq(s.sites.id, siteId)).get();
  if (!site) throw new Error(`site ${siteId} not found`);

  const stored = () => {
    const r = db
      .select()
      .from(s.samples)
      .where(eq(s.samples.siteId, siteId))
      .orderBy(desc(s.samples.ts))
      .limit(1)
      .get();
    return r ?? null;
  };

  let live: LiveSample | undefined;
  let liveUnavailable = false;
  if (site.source === "fleet-api") {
    const hit = liveCache.get(siteId);
    if (hit && now - hit.at >= 0 && now - hit.at < LIVE_TTL) live = hit.live;
    else
      try {
        live = await source.getLiveStatus(site.externalId);
        liveCache.set(siteId, { at: now, live });
      } catch {
        liveUnavailable = true;
      }
  } else liveUnavailable = true;
  const lastRow = stored();
  if (!live) {
    if (!lastRow) throw new Error("no live reading and no stored sample");
    live = {
      ts: lastRow.ts.toISOString(),
      solarW: lastRow.solarW,
      loadW: lastRow.loadW,
      batteryW: lastRow.batteryW,
      gridW: lastRow.gridW,
      socPct: lastRow.socPct,
      gridStatus: lastRow.gridStatus === "islanded" ? "islanded" : "connected",
    };
  }

  const tz = site.timezone ?? "UTC";
  const today = localDate(Date.parse(live.ts), tz);
  const from = new Date(localMidnight(addDays(today, -7), tz));
  const t0 = new Date(localMidnight(today, tz));
  const t2 = new Date(localMidnight(addDays(today, 2), tz));

  const e = s.energyIntervals;
  const hourBucket = sql<number>`cast(${e.start} / 3600000 as integer) * 3600000`;
  const hourly = db
    .select({
      start: hourBucket,
      solarWh: sql<number>`sum(${e.solarWh})`,
      loadWh: sql<number>`sum(${e.loadWh})`,
      gridImportWh: sql<number>`sum(${e.gridImportWh})`,
      gridExportWh: sql<number>`sum(${e.gridExportWh})`,
      batteryChargeWh: sql<number>`sum(${e.batteryChargeWh})`,
      batteryDischargeWh: sql<number>`sum(${e.batteryDischargeWh})`,
    })
    .from(e)
    .where(and(eq(e.siteId, siteId), gte(e.start, from), lt(e.start, t2)))
    .groupBy(hourBucket)
    .all();

  const samples = db
    .select({ ts: s.samples.ts, socPct: s.samples.socPct })
    .from(s.samples)
    .where(and(eq(s.samples.siteId, siteId), gte(s.samples.ts, t0), lt(s.samples.ts, t2)))
    .all()
    .map((r) => ({ ts: r.ts.getTime(), socPct: r.socPct }));

  const observed = db
    .select({ hour: s.weatherObserved.hour, ghiWm2: s.weatherObserved.ghiWm2 })
    .from(s.weatherObserved)
    .where(
      and(
        eq(s.weatherObserved.siteId, siteId),
        gte(s.weatherObserved.hour, from),
        lt(s.weatherObserved.hour, t0),
      ),
    )
    .all()
    .map((r) => ({ hour: r.hour.getTime(), ghiWm2: r.ghiWm2 }));

  // Oldest issue first, so the Map keeps the latest-issued row per target hour.
  const latest = new Map<number, (typeof s.weatherForecast.$inferSelect)>();
  for (const r of db
    .select()
    .from(s.weatherForecast)
    .where(
      and(
        eq(s.weatherForecast.siteId, siteId),
        gte(s.weatherForecast.hour, t0),
        lt(s.weatherForecast.hour, t2),
      ),
    )
    .orderBy(asc(s.weatherForecast.issuedAt))
    .all())
    latest.set(r.hour.getTime(), r);
  const forecast = [...latest.values()].map((r) => ({
    hour: r.hour.getTime(),
    tempC: r.tempC,
    cloudPct: r.cloudPct,
    ghiWm2: r.ghiWm2,
    precipProbPct: r.precipProbPct,
  }));

  const sched = db
    .select()
    .from(s.tariffSchedule)
    .where(eq(s.tariffSchedule.siteId, siteId))
    .get();

  return buildSnapshot({
    now,
    source: site.source as DashboardSnapshot["source"],
    site,
    currency: sched?.currency ?? null,
    tariff: sched ? parseTariff(sched.content) : null,
    live,
    liveUnavailable,
    lastSampleTs: lastRow?.ts.getTime() ?? null,
    hourly: hourly.map((h) => ({
      start: Number(h.start),
      solarWh: Number(h.solarWh),
      loadWh: Number(h.loadWh),
      gridImportWh: Number(h.gridImportWh),
      gridExportWh: Number(h.gridExportWh),
      batteryChargeWh: Number(h.batteryChargeWh),
      batteryDischargeWh: Number(h.batteryDischargeWh),
    })),
    samples,
    observed,
    forecast,
  });
}
