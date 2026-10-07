import {
  type DashboardSnapshot,
  type TimelineHour,
  type TouPeriod,
} from "~/lib/dashboard";
const HOUR = 3_600_000;
const UPDATED_AT = "2026-07-16T00:00:00Z"; // 17:00 PDT
const MIDNIGHT = Date.parse("2026-07-15T07:00:00Z"); // local midnight PDT

// Peak 16-21 local, mid-peak 15-16 and 21-24, else off-peak.
const periodOf = (localHour: number): TouPeriod =>
  localHour >= 16 && localHour < 21
    ? "peak"
    : localHour === 15 || localHour >= 21
      ? "mid-peak"
      : "off-peak";

// Deterministic summer shapes; tomorrow (second day) is cloudier.
const rows = Array.from({ length: 48 }, (_, i) => {
  const h = i % 24;
  const cloud = i >= 24 ? 0.55 : 1;
  const sun = Math.max(0, Math.sin(((h - 6) / 13) * Math.PI));
  return {
    t: MIDNIGHT + i * HOUR,
    h,
    solarWh: Math.round(5600 * sun * cloud),
    loadWh: Math.round(
      900 +
        700 * Math.max(0, Math.sin(((h - 13) / 10) * Math.PI)) +
        (h >= 16 && h < 21 ? 600 : 0),
    ),
  };
});

// One self-powered dispatch loop: surplus charges the battery (export the rest),
// deficit discharges it down to the reserve (import the rest). SoC is the start-of-hour value.
const cap = 13500;
const RESERVE_WH = 0.2 * cap;
const MAX_WH = 5000; // per hour
let energy = 0.55 * cap;
const timeline: TimelineHour[] = rows.map((r) => {
  const socPct = Math.round((energy / cap) * 100);
  const net = r.solarWh - r.loadWh;
  energy +=
    net > 0
      ? Math.min(net, MAX_WH, cap - energy)
      : -Math.min(-net, MAX_WH, energy - RESERVE_WH);
  const kind = r.t < Date.parse(UPDATED_AT) ? "actual" : "forecast";
  const row: TimelineHour = {
    hour: new Date(r.t).toISOString(),
    kind,
    loadWh: r.loadWh,
    solarWh: r.solarWh,
    socPct,
    period: periodOf(r.h),
  };
  if (kind === "forecast") {
    row.loadP10Wh = Math.round(r.loadWh * 0.85);
    row.loadP90Wh = Math.round(r.loadWh * 1.2);
    row.solarP10Wh = Math.round(r.solarWh * 0.7);
    row.solarP90Wh = Math.round(r.solarWh * 1.15);
  }
  return row;
});

// today and live derive from the actual rows; live power is the hour just completed, live SoC is now (first forecast row).
const actual = timeline.filter((r) => r.kind === "actual");
const nowRow = actual[actual.length - 1];
const nextRow = timeline[actual.length];
if (!nowRow || !nextRow)
  throw new Error("sample timeline needs actual and forecast rows");
// Per actual row: battery energy is the SoC drop to the next row (> 0 = discharge).
const flows = actual.map((r, i) => {
  const batteryWh = Math.round(
    ((r.socPct - (timeline[i + 1]?.socPct ?? r.socPct)) / 100) * cap,
  );
  return {
    period: r.period,
    gridWh: r.loadWh - r.solarWh - batteryWh,
    batteryWh,
  };
});
// Per-hour breakdown on actual rows (the sim already computes it).
actual.forEach((r, i) => {
  const f = flows[i];
  if (!f) return;
  r.gridImportWh = Math.max(f.gridWh, 0);
  r.gridExportWh = Math.max(-f.gridWh, 0);
  r.batteryChargeWh = Math.max(-f.batteryWh, 0);
  r.batteryDischargeWh = Math.max(f.batteryWh, 0);
});
const lastFlow = flows[flows.length - 1];
if (!lastFlow) throw new Error("no flows");
const total = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const gridExportWh = total(flows.map((f) => Math.max(-f.gridWh, 0)));
const IMPORT_RATE: Record<TouPeriod, number> = {
  "off-peak": 30,
  "mid-peak": 38,
  peak: 48,
}; // c/kWh
const EXPORT_RATE = 8;
const PERIOD_ORDER: TouPeriod[] = ["off-peak", "mid-peak", "peak"];
const periods: DashboardSnapshot["costToday"]["periods"] = PERIOD_ORDER.filter(
  (p) => actual.some((r) => r.period === p),
).map((period) => {
  const importWh = total(
    flows.filter((f) => f.period === period).map((f) => Math.max(f.gridWh, 0)),
  );
  return {
    period,
    importWh,
    costCents: Math.round((importWh * IMPORT_RATE[period]) / 1000),
  };
});
const exportCreditCents = Math.round((gridExportWh * EXPORT_RATE) / 1000);
// live approximates the instantaneous reading: hour-average power of the last completed hour, SoC at 17:00.
export const sampleSnapshot: DashboardSnapshot = {
  site: { name: "Home", timezone: "America/Los_Angeles", temperatureUnit: "F" },
  source: "fleet-api",
  updatedAt: UPDATED_AT,
  currency: "USD",
  live: {
    solarW: nowRow.solarWh,
    loadW: nowRow.loadWh,
    batteryW: lastFlow.batteryWh,
    gridW: lastFlow.gridWh,
    socPct: nextRow.socPct,
    usableCapacityWh: cap,
    gridStatus: "connected",
  },
  tariffNow: {
    period: nowRow.period,
    importCentsPerKwh: IMPORT_RATE[nowRow.period],
    exportCentsPerKwh: EXPORT_RATE,
    endsAt: "2026-07-16T04:00:00Z",
  },
  recommendation: {
    action: "Raise backup reserve to 65%",
    validFrom: "2026-07-16T04:00:00Z", // 21:00 local
    validTo: "2026-07-16T23:00:00Z",
    effectWh: 4000,
    savingsCents: 120,
    why: [
      "Tomorrow is forecast to be cloudy, so solar will cover far less than today.",
      "Your 4-9 PM peak is expected to need about 11 kWh.",
      "A higher reserve avoids buying that energy at peak rates.",
    ],
    confidence: "medium",
    wouldChange:
      "A sunnier forecast or a lower evening load would reduce the reserve needed.",
  },
  timeline,
  costToday: {
    periods,
    exportCreditCents,
    netCents: periods.reduce((a, p) => a + p.costCents, 0) - exportCreditCents,
  },
  previousDays: [9, 10, 11, 12, 13, 14].map((d, i) => ({
    date: `2026-07-${String(d).padStart(2, "0")}`,
    solarWh: 47500 - i * 500,
    loadWh: 24500 + i * 300,
  })),
  accuracy: [
    {
      target: "load",
      model: "load-v1",
      baseline: "seasonal-naive",
      maePct: 9,
      baselineMaePct: 14,
      days: 28,
    },
    {
      target: "solar",
      model: "solar-v1",
      baseline: "yesterday",
      maePct: 11,
      baselineMaePct: 22,
      days: 28,
    },
  ],
  health: { lastPollAt: UPDATED_AT, estRequestsPerMonth: 8640, warnings: [] },
  weatherTomorrow: {
    date: "2026-07-16",
    condition: "cloudy",
    highC: 24,
    lowC: 16,
    cloudCoverPct: 80,
    precipitationChancePct: 20,
  },
};
