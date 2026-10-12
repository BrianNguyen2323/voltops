import { z } from "zod";
import { server } from "~/env.schema.js";
import { eq } from "drizzle-orm";
import type { DataSource } from "~/lib/core/types";
import { addDays, localDate, localMidnight, localParts } from "~/lib/time";
import { fetchArchive, fetchWeather } from "~/lib/weather/open-meteo";
import type { openDb } from "~/server/db";
import * as s from "~/server/db/schema";
import { energyHistory } from "~/server/history";
import { syncSite } from "~/server/site-sync";

type Db = ReturnType<typeof openDb>;
type Site = typeof s.sites.$inferSelect;
export type Deps = {
  db: Db;
  source: DataSource;
  fetch: typeof fetch;
  now: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Local RFC3339 with offset for the instant `ms`. */
function rfc3339(ms: number, tz: string) {
  const p = localParts(ms, tz);
  const sec = Math.floor(ms / 1000) % 60;
  const off = Math.round(
    (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) -
      (ms - sec * 1000 - (ms % 1000))) /
      60_000,
  );
  const a = Math.abs(off);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(sec)}${off < 0 ? "-" : "+"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function dayRange(date: string, tz: string, endMs?: number) {
  return {
    start_date: rfc3339(localMidnight(date, tz), tz),
    end_date: rfc3339(endMs ?? localMidnight(addDays(date, 1), tz) - 1000, tz),
    time_zone: tz,
  };
}

export async function syncEnergy({ db, source, now }: Deps, site: Site) {
  const tz = site.timezone ?? "UTC";
  const today = localDate(now, tz);
  const history = energyHistory(db, site);
  let first: unknown;
  // today first, then newest to oldest; a failing day must not skip the rest
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) {
    try {
      const d = addDays(today, -i);
      if (i > 0 && history.isComplete(d)) continue;
      history.putIntervals(
        await source.getHistory(
          site.externalId,
          dayRange(d, tz, i === 0 ? now : undefined),
        ),
      );
    } catch (e) {
      first ??= e;
    }
  }
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrow the original caught value
  if (first) throw first;
}

export async function takeSample({ db, source }: Deps, site: Site) {
  const x = await source.getLiveStatus(site.externalId);
  db.insert(s.samples)
    .values({
      siteId: site.id,
      ts: new Date(x.ts),
      solarW: x.solarW,
      loadW: x.loadW,
      batteryW: x.batteryW,
      gridW: x.gridW,
      socPct: x.socPct,
      gridStatus: x.gridStatus,
    })
    .onConflictDoNothing()
    .run();
}

export async function syncWeather({ db, fetch, now }: Deps, site: Site) {
  if (site.latitude == null || site.longitude == null) return;
  const w = await fetchWeather({
    fetch,
    lat: site.latitude,
    lon: site.longitude,
    now,
  });
  energyHistory(db, site).putObserved(w.observed);
  db.transaction((tx) => {
    for (const r of w.forecast)
      tx.insert(s.weatherForecast)
        .values({
          siteId: site.id,
          issuedAt: new Date(now),
          hour: new Date(r.hour),
          tempC: r.tempC,
          cloudPct: r.cloudPct,
          ghiWm2: r.ghiWm2,
          precipMm: r.precipMm,
          precipProbPct: r.precipProbPct,
        })
        .onConflictDoNothing()
        .run();
  });
}

const GAP_DAYS = 92;
const DAY_MS = 24 * 3_600_000;

/** Backfill observed weather for past site-local days that have energy but incomplete weather. */
export async function fillWeatherGaps({ db, fetch, now }: Deps, site: Site) {
  if (site.latitude == null || site.longitude == null) return;
  const tz = site.timezone ?? "UTC";
  const today = localDate(now, tz);
  const history = energyHistory(db, site);
  // Open-Meteo runs with timezone=UTC, so past_days counts UTC days back
  const age = (d: string) =>
    Math.floor(now / DAY_MS) - Math.floor(localMidnight(d, tz) / DAY_MS);
  const gaps = history.weatherGaps(today);
  const recent = gaps.filter((d) => age(d) <= GAP_DAYS);
  const old = gaps.filter((d) => age(d) > GAP_DAYS);
  const keep = (set: string[]) => {
    const g = new Set(set);
    return (r: { hour: number }) => g.has(localDate(r.hour, tz));
  };
  if (recent.length) {
    const w = await fetchWeather({
      fetch,
      lat: site.latitude,
      lon: site.longitude,
      now,
      pastDays: Math.max(1, age(recent[0]!)),
      forecastDays: 1,
    });
    history.putObserved(w.observed.filter(keep(recent)));
  }
  if (old.length) {
    // one request: the archive end must include the hour after the last gap day (GHI shift in mapForecast)
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const w = await fetchArchive({
      fetch,
      lat: site.latitude,
      lon: site.longitude,
      now,
      start: day(localMidnight(old[0]!, tz)),
      end: day(localMidnight(addDays(old.at(-1)!, 1), tz)),
    });
    history.putObserved(w.observed.filter(keep(old)));
  }
}

/** "" counts as unset; "0" is a real 0. */
export function parseSiteSettings(env: Record<string, string | undefined>) {
  const pick = (k: string) => (env[k] === "" ? undefined : env[k]);
  return z
    .object({
      SITE_LATITUDE: server.SITE_LATITUDE,
      SITE_LONGITUDE: server.SITE_LONGITUDE,
      TEMPERATURE_UNIT: server.TEMPERATURE_UNIT,
    })
    .parse({
      SITE_LATITUDE: pick("SITE_LATITUDE"),
      SITE_LONGITUDE: pick("SITE_LONGITUDE"),
      TEMPERATURE_UNIT: pick("TEMPERATURE_UNIT"),
    });
}

export function isTeslaIdle(db: Db) {
  return (
    !db.select().from(s.credentials).get() ||
    !db.select().from(s.sites).where(eq(s.sites.source, "fleet-api")).get()
  );
}

export function applySiteSettings(
  db: Db,
  env: {
    SITE_LATITUDE?: number;
    SITE_LONGITUDE?: number;
    TEMPERATURE_UNIT?: "F" | "C";
  },
) {
  const set: Partial<typeof s.sites.$inferInsert> = {};
  if (env.SITE_LATITUDE != null) set.latitude = env.SITE_LATITUDE;
  if (env.SITE_LONGITUDE != null) set.longitude = env.SITE_LONGITUDE;
  if (env.TEMPERATURE_UNIT) set.temperatureUnit = env.TEMPERATURE_UNIT;
  // eslint-disable-next-line drizzle/enforce-update-with-where -- intentionally every site (single household)
  if (Object.keys(set).length) db.update(s.sites).set(set).run();
}

/** Runs at the start of every worker tick, so Sites created since the last tick get the env settings. */
export function prepareTick(
  db: Db,
  settings: Parameters<typeof applySiteSettings>[1],
) {
  applySiteSettings(db, settings);
}

/** Never logs externalId, tokens or bodies: only job, internal site id, error name and message. */
export async function guarded(job: string, site: Site, f: () => Promise<void>) {
  try {
    await f();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(
      `[worker] ${job} site=${site.id} ${err.name}: ${err.message}`,
    );
  }
}

export async function runTesla(deps: Deps) {
  for (const site of deps.db
    .select()
    .from(s.sites)
    .where(eq(s.sites.source, "fleet-api"))
    .all()) {
    await guarded("syncEnergy", site, () => syncEnergy(deps, site));
    await guarded("takeSample", site, () => takeSample(deps, site));
  }
}

export async function runWeather(deps: Deps) {
  for (const site of deps.db.select().from(s.sites).all()) {
    await guarded("syncWeather", site, () => syncWeather(deps, site));
    await guarded("fillWeatherGaps", site, () => fillWeatherGaps(deps, site));
  }
}

export async function runSiteSync(deps: Deps) {
  for (const site of deps.db
    .select()
    .from(s.sites)
    .where(eq(s.sites.source, "fleet-api"))
    .all())
    await guarded("site-sync", site, async () => {
      await syncSite(deps.db, deps.source, site.externalId);
    });
}
