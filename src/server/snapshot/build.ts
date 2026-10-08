// Pure: turns rows already read from the DB (see load.ts) into a DashboardSnapshot. No I/O.
import { reserveRecommendation } from "~/lib/advisor/reserve";
import type { LiveSample } from "~/lib/core/types";
import type {
  DashboardSnapshot,
  PeakHistory,
  TimelineHour,
  TouPeriod,
} from "~/lib/dashboard";
import { forecastHours } from "~/lib/forecast/baseline";
import { costToday, tariffAt, type Tariff } from "~/lib/tariff";
import { addDays, localDate, localMidnight } from "~/lib/time";

const HOUR = 3_600_000;
const SAMPLE_TOLERANCE = 30 * 60_000;

export type HourRow = {
  start: number;
  solarWh: number;
  loadWh: number;
  gridImportWh: number;
  gridExportWh: number;
  batteryChargeWh: number;
  batteryDischargeWh: number;
};

export type BuildInput = {
  now: number;
  source: DashboardSnapshot["source"];
  site: {
    name: string | null;
    timezone: string | null;
    temperatureUnit: string | null;
    latitude: number | null;
    longitude: number | null;
    usableCapacityWh: number | null;
    backupReservePct: number | null;
  };
  currency: string | null;
  tariff: Tariff | null;
  live: LiveSample;
  liveUnavailable: boolean;
  lastSampleTs: number | null;
  /** max(energy_intervals.start) for the site; falls back to the latest hour bucket when null/absent. */
  latestIntervalStart?: number | null;
  /** energy_intervals summed per UTC hour: today + the 7 days before. */
  hourly: HourRow[];
  samples: { ts: number; socPct: number }[];
  observed: { hour: number; ghiWm2: number }[];
  /** Latest-issued row per target hour. */
  forecast: {
    hour: number;
    tempC: number;
    cloudPct: number;
    ghiWm2: number;
    precipProbPct: number;
  }[];
  /** Computed by load.ts (peak.ts queries); the recommendation is derived from it here. */
  peakEstimate: {
    historyDays: number;
    today: PeakHistory | null;
    tomorrow: PeakHistory | null;
  };
};

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

export function buildSnapshot(i: BuildInput): DashboardSnapshot {
  const tz = i.site.timezone ?? "UTC";
  const updatedMs = Date.parse(i.live.ts);
  const updatedAt = new Date(updatedMs).toISOString();
  const today = localDate(updatedMs, tz);
  const tomorrow = addDays(today, 1);
  const t0 = localMidnight(today, tz);
  const t1 = localMidnight(tomorrow, tz);
  const t2 = localMidnight(addDays(today, 2), tz);
  const unit = i.site.temperatureUnit === "C" ? "C" : "F";
  const socNow = Math.round(i.live.socPct);
  const capacityWh = i.site.usableCapacityWh ?? 13_500;
  const periodAt = (ms: number): TouPeriod =>
    i.tariff ? tariffAt(i.tariff, ms, tz).period : "off-peak";

  const byHour = new Map(i.hourly.map((h) => [h.start, h]));
  const histFrom = localMidnight(addDays(today, -7), tz);
  const history = i.hourly
    .filter((h) => h.start >= histFrom && h.start < t0)
    .map((h) => ({ hour: h.start, solarWh: h.solarWh, loadWh: h.loadWh }));

  const hours: number[] = [];
  for (let t = t0; t < t2; t += HOUR) hours.push(t);
  const actualHours = hours.filter((h) => h < updatedMs);
  const forecastHrs = hours.filter((h) => h >= updatedMs);

  const socAt = (ms: number) => {
    let best: number | null = null;
    let bestD = SAMPLE_TOLERANCE + 1;
    for (const s of i.samples) {
      const d = Math.abs(s.ts - ms);
      if (d < bestD) {
        best = s.socPct;
        bestD = d;
      }
    }
    return best === null ? socNow : Math.round(best);
  };

  const actual: TimelineHour[] = actualHours.map((h) => {
    const r = byHour.get(h);
    return {
      hour: new Date(h).toISOString(),
      kind: "actual",
      loadWh: r?.loadWh ?? 0,
      solarWh: r?.solarWh ?? 0,
      socPct: socAt(h),
      period: periodAt(h),
      gridImportWh: r?.gridImportWh ?? 0,
      gridExportWh: r?.gridExportWh ?? 0,
      batteryChargeWh: r?.batteryChargeWh ?? 0,
      batteryDischargeWh: r?.batteryDischargeWh ?? 0,
    };
  });

  const forecast: TimelineHour[] = forecastHours({
    hours: forecastHrs,
    tz,
    history,
    observedGhi: i.observed,
    forecastGhi: i.forecast.map((f) => ({ hour: f.hour, ghiWm2: f.ghiWm2 })),
    startSocPct: socNow,
    capacityWh,
    reservePct: i.site.backupReservePct ?? 20,
  }).map((f) => ({
    ...f,
    kind: "forecast",
    period: periodAt(Date.parse(f.hour)),
  }));

  const todayActual = actual
    .filter((r) => localDate(Date.parse(r.hour), tz) === today)
    .map((r) => ({
      hour: r.hour,
      gridImportWh: r.gridImportWh ?? 0,
      gridExportWh: r.gridExportWh ?? 0,
    }));
  const cost = i.tariff
    ? costToday(i.tariff, todayActual, tz)
    : {
        periods: (["off-peak", "mid-peak", "peak"] as const).map((period) => ({
          period,
          importWh:
            period === "off-peak"
              ? sum(todayActual.map((h) => h.gridImportWh))
              : 0,
          costCents: 0,
        })),
        exportCreditCents: 0,
        netCents: 0,
      };

  const previousDays = Array.from({ length: 6 }, (_, k) => {
    const date = addDays(today, k - 6);
    const from = localMidnight(date, tz);
    const to = localMidnight(addDays(date, 1), tz);
    const rows = i.hourly.filter((h) => h.start >= from && h.start < to);
    return {
      date,
      solarWh: sum(rows.map((r) => r.solarWh)),
      loadWh: sum(rows.map((r) => r.loadWh)),
    };
  });

  const wx = i.forecast.filter((f) => f.hour >= t1 && f.hour < t2);
  let weatherTomorrow: DashboardSnapshot["weatherTomorrow"] = null;
  if (wx.length) {
    const cloud = sum(wx.map((f) => f.cloudPct)) / wx.length;
    const chance = Math.max(...wx.map((f) => f.precipProbPct));
    weatherTomorrow = {
      date: tomorrow,
      condition:
        chance >= 50
          ? "rain"
          : cloud < 25
            ? "clear"
            : cloud < 70
              ? "partly-cloudy"
              : "cloudy",
      highC: Math.round(Math.max(...wx.map((f) => f.tempC))),
      lowC: Math.round(Math.min(...wx.map((f) => f.tempC))),
      cloudCoverPct: Math.round(cloud),
      precipitationChancePct: Math.round(chance),
    };
  }

  const warnings: string[] = [];
  const latest =
    i.latestIntervalStart ??
    i.hourly.reduce((m, h) => Math.max(m, h.start), -Infinity);
  if (latest !== -Infinity && updatedMs - latest > 2 * HOUR)
    warnings.push(
      `Energy history is ${Math.floor((updatedMs - latest) / HOUR)} h behind`,
    );
  if (new Set(history.map((h) => localDate(h.hour, tz))).size < 7)
    warnings.push("Learning: forecasts improve after 7 days of data");
  if (i.site.latitude === null || i.site.longitude === null)
    warnings.push("Set SITE_LATITUDE and SITE_LONGITUDE for weather");
  if (i.liveUnavailable)
    warnings.push("Live reading unavailable: showing the last stored reading");
  if (!i.tariff) warnings.push("No tariff from Tesla");

  return {
    site: {
      name: i.site.name ?? "My home",
      timezone: tz,
      temperatureUnit: unit,
    },
    source: i.source,
    updatedAt,
    currency: i.currency ?? "USD",
    live: {
      solarW: Math.round(i.live.solarW),
      loadW: Math.round(i.live.loadW),
      batteryW: Math.round(i.live.batteryW),
      gridW: Math.round(i.live.gridW),
      socPct: socNow,
      usableCapacityWh: capacityWh,
      gridStatus: i.live.gridStatus,
    },
    tariffNow: i.tariff
      ? tariffAt(i.tariff, updatedMs, tz)
      : {
          period: "off-peak",
          importCentsPerKwh: 0,
          exportCentsPerKwh: 0,
          endsAt: new Date(t1).toISOString(),
        },
    recommendation: reserveRecommendation({
      historyDays: i.peakEstimate.historyDays,
      tomorrow: i.peakEstimate.tomorrow,
      usableCapacityWh: capacityWh,
      temperatureUnit: unit,
      tz,
      updatedMs,
      tariff: i.tariff,
    }),
    peakEstimate: i.peakEstimate,
    timeline: [...actual, ...forecast],
    costToday: cost,
    previousDays,
    accuracy: [],
    health: {
      lastPollAt: new Date(i.lastSampleTs ?? updatedMs).toISOString(),
      estRequestsPerMonth: 1440,
      warnings,
    },
    weatherTomorrow,
  };
}
