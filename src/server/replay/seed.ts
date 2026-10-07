import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { mapCalendarHistory } from "~/lib/sources/fleet-api/map";
import { addDays, localDate, localMidnight } from "~/lib/time";
import { mapForecast } from "~/lib/weather/open-meteo";
import type { db as Db } from "~/server/db";
import * as s from "~/server/db/schema";

const TZ = "America/Los_Angeles";
const HOUR = 3_600_000;
const STEP = 300_000;
const CAP_WH = 27000;
// fixtures/open-meteo/README.md
const FETCHED = 1791340007841;

const read = (p: string): unknown => JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));

type Tariff = { name?: string; utility?: string; currency?: string };

/** Replace the demo site with the fixture day copied over the last 8 local days. Synchronous, one transaction. */
export function seedReplay(db: typeof Db, now: number): void {
  const fixture = mapCalendarHistory(read("fixtures/fleet-api/calendar_history_energy.json"));
  const tariff = (read("fixtures/fleet-api/site_info.json") as { response: { tariff_content: Tariff } })
    .response.tariff_content;
  const weather = mapForecast(read("fixtures/open-meteo/forecast.json"), FETCHED);

  const fixMidnight = localMidnight(localDate(Date.parse(fixture[0]!.start), TZ), TZ);
  const slots = fixture.map((i) => ({ i, off: Date.parse(i.start) - fixMidnight }));
  const today = localDate(now, TZ);
  const first = localMidnight(addDays(today, -7), TZ);

  const rows: (typeof s.energyIntervals.$inferInsert)[] = [];
  for (let d = -7; d <= 0; d++) {
    const lm = localMidnight(addDays(today, d), TZ);
    for (const { i, off } of slots) {
      // Elapsed time since local midnight (brief); on a 23 h day the last hour spills into tomorrow, so skip it.
      const start = lm + off;
      if (localDate(start, TZ) !== addDays(today, d)) continue;
      if (start + STEP > now) continue;
      rows.push({
        siteId: 0, start: new Date(start), solarWh: i.solarWh, loadWh: i.loadWh,
        gridImportWh: i.gridImportWh, gridExportWh: i.gridExportWh,
        batteryChargeWh: i.batteryChargeWh, batteryDischargeWh: i.batteryDischargeWh,
      });
    }
  }
  rows.sort((a, b) => a.start.getTime() - b.start.getTime());

  db.transaction((tx) => {
    tx.delete(s.sites).where(eq(s.sites.source, "replay")).run();
    const { id: siteId } = tx
      .insert(s.sites)
      .values({
        source: "replay", externalId: "replay", name: "Demo home", timezone: TZ,
        usableCapacityWh: CAP_WH, backupReservePct: 20, latitude: 34.05, longitude: -118.24,
        temperatureUnit: "F", createdAt: new Date(now), updatedAt: new Date(now),
      })
      .returning({ id: s.sites.id })
      .get();
    tx.insert(s.tariffSchedule)
      .values({
        siteId, tariffId: "replay", name: tariff.name ?? null, utility: tariff.utility ?? null,
        currency: "USD", content: tariff, updatedAt: new Date(now),
      })
      .run();
    for (const r of rows) tx.insert(s.energyIntervals).values({ ...r, siteId }).run();

    // Hourly samples: flows from the hour's first interval (x12 = Wh per 5 min to W), SoC integrated.
    let k = 0;
    let soc = 50;
    const sample = (ts: number) => {
      while (k < rows.length && rows[k]!.start.getTime() < ts) {
        const r = rows[k++]!;
        soc = Math.min(100, Math.max(0, soc + ((r.batteryChargeWh - r.batteryDischargeWh) / CAP_WH) * 100));
      }
      // first interval in [ts, ts+HOUR), else the latest one before
      const iv = k < rows.length && rows[k]!.start.getTime() < ts + HOUR ? rows[k]! : rows[Math.max(0, k - 1)]!;
      tx.insert(s.samples)
        .values({
          siteId, ts: new Date(ts), solarW: iv.solarWh * 12, loadW: iv.loadWh * 12,
          batteryW: (iv.batteryDischargeWh - iv.batteryChargeWh) * 12,
          gridW: (iv.gridImportWh - iv.gridExportWh) * 12, socPct: soc, gridStatus: "connected",
        })
        .run();
    };
    let t = first;
    for (; t <= now; t += HOUR) sample(t);
    if (t - HOUR !== now) sample(now);

    // Shift weather by whole hours so the fixture's fetch day lands on today.
    const shift = localMidnight(today, TZ) - localMidnight(localDate(FETCHED, TZ), TZ);
    for (const w of weather.observed)
      tx.insert(s.weatherObserved).values({ siteId, hour: new Date(w.hour + shift), tempC: w.tempC, cloudPct: w.cloudPct, ghiWm2: w.ghiWm2, precipMm: w.precipMm }).run();
    for (const w of weather.forecast)
      tx.insert(s.weatherForecast).values({ siteId, issuedAt: new Date(now), hour: new Date(w.hour + shift), tempC: w.tempC, cloudPct: w.cloudPct, ghiWm2: w.ghiWm2, precipMm: w.precipMm, precipProbPct: w.precipProbPct }).run();
  });
}
