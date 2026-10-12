// Reads everything a snapshot needs from the DB (and the live source), then calls buildSnapshot.
import { and, asc, desc, eq, gte, lt, min } from "drizzle-orm";
import type { DataSource, LiveSample } from "~/lib/core/types";
import type { DashboardSnapshot } from "~/lib/dashboard";
import { dayHighC, peakWindow } from "~/lib/advisor/reserve";
import { env } from "~/env";
import { server } from "~/env.schema.js";
import { parseTariff } from "~/lib/tariff";
import { addDays, localDate, localMidnight } from "~/lib/time";
import type { db as appDb } from "~/server/db";
import * as s from "~/server/db/schema";
import { buildSnapshot } from "./build";
import { energyHistory } from "~/server/history";

type Db = typeof appDb;

// Parsed here (not trusted from ~/env) because SKIP_ENV_VALIDATION leaves raw strings; "" or invalid = unset.
const panelEnv = (k: "SITE_PANEL_COUNT" | "SITE_PANEL_WATTS") => {
  const v: unknown = env[k];
  return server[k].safeParse(v === "" ? undefined : v).data ?? null;
};
const LIVE_TTL = 60_000;

// ponytail: per-process cache, one entry per site; fine for a single-household server.
const liveCache = new Map<number, { at: number; live: LiveSample }>();

export function firstSiteId(db: Db): number | null {
  return (
    db
      .select({ id: min(s.sites.id) })
      .from(s.sites)
      .get()?.id ?? null
  );
}

export async function loadSnapshot(
  { db, source, now }: { db: Db; source: DataSource; now: number },
  siteId: number,
): Promise<DashboardSnapshot> {
  const site = db.select().from(s.sites).where(eq(s.sites.id, siteId)).get();
  if (!site) throw new Error(`site ${siteId} not found`);

  let live: LiveSample | undefined;
  let liveUnavailable = false;
  if (site.source === "fleet-api") {
    const hit = liveCache.get(siteId);
    if (hit && now - hit.at >= 0 && now - hit.at < LIVE_TTL) live = hit.live;
    else
      try {
        live = await source.getLiveStatus(site.externalId);
        liveCache.set(siteId, { at: now, live });
      } catch (e) {
        console.warn(
          `[snapshot] live unavailable site=${site.id} ${e instanceof Error ? e.name : "Error"}`,
        );
        liveUnavailable = true;
      }
  } else liveUnavailable = true;
  const lastRow =
    db
      .select()
      .from(s.samples)
      .where(eq(s.samples.siteId, siteId))
      .orderBy(desc(s.samples.ts))
      .limit(1)
      .get() ?? null;
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
  const t0 = new Date(localMidnight(today, tz));
  const t2 = new Date(localMidnight(addDays(today, 2), tz));

  const history = energyHistory(db, site);
  const hourly = history.hours(addDays(today, -7), addDays(today, 2));
  const latestIntervalStart = history.latestStart();

  const samples = db
    .select({ ts: s.samples.ts, socPct: s.samples.socPct })
    .from(s.samples)
    .where(
      and(
        eq(s.samples.siteId, siteId),
        gte(s.samples.ts, t0),
        lt(s.samples.ts, t2),
      ),
    )
    .all()
    .map((r) => ({ ts: r.ts.getTime(), socPct: r.socPct }));

  // One read of observed weather covers both the GHI history (before today) and temps (today, tomorrow).
  const wx = history.observed(addDays(today, -7), addDays(today, 2));
  const observed = wx
    .filter((r) => r.hour < t0.getTime())
    .map((r) => ({ hour: r.hour, ghiWm2: r.ghiWm2 }));

  // Oldest issue first, so the Map keeps the latest-issued row per target hour.
  const latest = new Map<number, typeof s.weatherForecast.$inferSelect>();
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

  const observedTemps = wx
    .filter((r) => r.hour >= t0.getTime())
    .map((r) => ({ hour: r.hour, tempC: r.tempC }));

  const sched = db
    .select()
    .from(s.tariffSchedule)
    .where(eq(s.tariffSchedule.siteId, siteId))
    .get();

  const tariff = sched ? parseTariff(sched.content) : null;
  const days = history.completeDays(today);
  const peakDay = (date: string) => {
    const w = peakWindow(tariff, date, tz);
    const highC = dayHighC(date, tz, observedTemps, forecast);
    return w && highC !== null
      ? history.peakAverage({
          days,
          fromMin: w.fromMin,
          toMin: w.toMin,
          highC,
        })
      : null;
  };

  return buildSnapshot({
    now,
    source: site.source as DashboardSnapshot["source"],
    site,
    systemExtras: {
      panelCount: panelEnv("SITE_PANEL_COUNT"),
      panelWatts: panelEnv("SITE_PANEL_WATTS"),
      bestHour: history.bestSolarHour(),
      plan: { utility: sched?.utility ?? null, name: sched?.name ?? null },
      changes: db
        .select()
        .from(s.siteEvents)
        .where(eq(s.siteEvents.siteId, siteId))
        .orderBy(desc(s.siteEvents.at))
        .limit(5)
        .all()
        .map((r) => ({ at: r.at.getTime(), text: r.text })),
    },
    currency: sched?.currency ?? null,
    tariff,
    live,
    liveUnavailable,
    lastSampleTs: lastRow?.ts.getTime() ?? null,
    latestIntervalStart,
    hourly,
    samples,
    observed,
    forecast,
    peakEstimate: {
      historyDays: days.length,
      today: peakDay(today),
      tomorrow: peakDay(addDays(today, 1)),
    },
  });
}
