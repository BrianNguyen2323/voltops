// Contract for the /home dashboard. Canonical units (CLAUDE.md section 5): W, Wh, integer cents, ISO-8601 UTC.
export type TouPeriod = "off-peak" | "mid-peak" | "peak";
export type DashboardData = {
  site: { name: string; timezone: string };
  source: "fleet-api" | "local-gateway" | "replay";
  updatedAt: string;
  currency: string;
  live: {
    solarW: number;
    loadW: number;
    batteryW: number;
    gridW: number;
    socPct: number;
    usableCapacityWh: number;
    gridStatus: "connected" | "islanded";
  };
  tariffNow: {
    period: TouPeriod;
    importCentsPerKwh: number;
    exportCentsPerKwh: number;
    endsAt: string;
  };
  recommendation: null | {
    action: string;
    validFrom: string;
    validTo: string;
    effectWh: number;
    savingsCents: number;
    why: string[];
    confidence: "low" | "medium" | "high";
    wouldChange: string;
  };
  timeline: Array<{
    hour: string;
    kind: "actual" | "forecast";
    loadWh: number;
    solarWh: number;
    socPct: number;
    period: TouPeriod;
    loadP10Wh?: number;
    loadP90Wh?: number;
    solarP10Wh?: number;
    solarP90Wh?: number;
  }>;
  today: {
    solarWh: number;
    loadWh: number;
    gridImportWh: number;
    gridExportWh: number;
    batteryChargeWh: number;
    batteryDischargeWh: number;
    selfPoweredPct: number;
  };
  costToday: {
    periods: Array<{ period: TouPeriod; importWh: number; costCents: number }>;
    exportCreditCents: number;
    netCents: number;
  };
  last7Days: Array<{ date: string; solarWh: number; loadWh: number }>;
  accuracy: Array<{
    target: "load" | "solar";
    model: string;
    baseline: string;
    maePct: number;
    baselineMaePct: number;
    days: number;
  }>;
  health: {
    lastPollAt: string;
    estRequestsPerMonth: number;
    warnings: string[];
  };
};

const HOUR = 3_600_000;
const UPDATED_AT = "2026-07-15T23:40:00Z"; // 16:40 PDT
const MIDNIGHT = Date.parse("2026-07-15T07:00:00Z"); // local midnight PDT

// Peak 16-21 local, mid-peak 15-16 and 21-24, else off-peak.
const periodOf = (localHour: number): TouPeriod =>
  localHour >= 16 && localHour < 21
    ? "peak"
    : localHour === 15 || localHour >= 21
      ? "mid-peak"
      : "off-peak";

// Deterministic summer shapes; tomorrow (second day) is cloudier.
// SoC at the start of each local hour: battery covers the night, solar charges it by day.
const SOC_BY_HOUR = [
  55, 48, 42, 36, 30, 25, 20, 20, 23, 33, 44, 55, 66, 76, 84, 89, 92, 86, 80,
  74, 68, 62, 56, 50,
];

const timeline: DashboardData["timeline"] = Array.from(
  { length: 48 },
  (_, i) => {
    const t = MIDNIGHT + i * HOUR;
    const h = i % 24;
    const cloud = i >= 24 ? 0.55 : 1;
    const sun = Math.max(0, Math.sin(((h - 6) / 13) * Math.PI));
    const solarWh = Math.round(5600 * sun * cloud);
    const loadWh = Math.round(
      900 +
        700 * Math.max(0, Math.sin(((h - 13) / 10) * Math.PI)) +
        (h >= 16 && h < 21 ? 600 : 0),
    );
    const socPct = SOC_BY_HOUR[h] ?? 50;
    const kind = t < Date.parse(UPDATED_AT) ? "actual" : "forecast";
    const row: DashboardData["timeline"][number] = {
      hour: new Date(t).toISOString(),
      kind,
      loadWh,
      solarWh,
      socPct,
      period: periodOf(h),
    };
    if (kind === "forecast") {
      row.loadP10Wh = Math.round(loadWh * 0.85);
      row.loadP90Wh = Math.round(loadWh * 1.2);
      row.solarP10Wh = Math.round(solarWh * 0.7);
      row.solarP90Wh = Math.round(solarWh * 1.15);
    }
    return row;
  },
);

// today and live derive from the actual timeline rows; the last actual row is the current hour.
const actual = timeline.filter((r) => r.kind === "actual");
const nowRow = actual[actual.length - 1];
if (!nowRow) throw new Error("sample timeline has no actual rows");
const cap = 13500;
const liveSoc = Math.min(100, nowRow.socPct + 1); // still charging at 16:40
// Per actual row: SoC is the start-of-hour value, so battery energy is the drop to the next row (> 0 = discharge).
const flows = actual.map((r, i) => {
  const next = actual[i + 1]?.socPct ?? liveSoc;
  const batteryWh = Math.round(((r.socPct - next) / 100) * cap);
  return {
    period: r.period,
    gridWh: r.loadWh - r.solarWh - batteryWh,
    batteryWh,
  };
});
const total = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const solarWh = total(actual.map((r) => r.solarWh));
const loadWh = total(actual.map((r) => r.loadWh));
const gridImportWh = total(flows.map((f) => Math.max(f.gridWh, 0)));
const gridExportWh = total(flows.map((f) => Math.max(-f.gridWh, 0)));
const batteryChargeWh = total(flows.map((f) => Math.max(-f.batteryWh, 0)));
const batteryDischargeWh = total(flows.map((f) => Math.max(f.batteryWh, 0)));
const IMPORT_RATE: Record<TouPeriod, number> = {
  "off-peak": 30,
  "mid-peak": 38,
  peak: 48,
}; // c/kWh
const EXPORT_RATE = 8;
const PERIOD_ORDER: TouPeriod[] = ["off-peak", "mid-peak", "peak"];
const periods: DashboardData["costToday"]["periods"] = PERIOD_ORDER.filter(
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
export const sampleDashboard: DashboardData = {
  site: { name: "Home", timezone: "America/Los_Angeles" },
  source: "fleet-api",
  updatedAt: UPDATED_AT,
  currency: "USD",
  live: {
    solarW: nowRow.solarWh,
    loadW: nowRow.loadWh,
    batteryW: -Math.round((nowRow.solarWh - nowRow.loadWh) * 0.6), // surplus: 60% charges, 40% exports
    gridW: -(
      nowRow.solarWh -
      nowRow.loadWh -
      Math.round((nowRow.solarWh - nowRow.loadWh) * 0.6)
    ),
    socPct: liveSoc,
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
  today: {
    solarWh,
    loadWh,
    gridImportWh,
    gridExportWh,
    batteryChargeWh,
    batteryDischargeWh,
    selfPoweredPct: Math.round(100 * (1 - gridImportWh / loadWh)),
  },
  costToday: {
    periods,
    exportCreditCents,
    netCents: periods.reduce((a, p) => a + p.costCents, 0) - exportCreditCents,
  },
  last7Days: [9, 10, 11, 12, 13, 14]
    .map((d, i) => ({
      date: `2026-07-${String(d).padStart(2, "0")}`,
      solarWh: 38000 - i * 300,
      loadWh: 24000 + i * 400,
    }))
    .concat([{ date: "2026-07-15", solarWh, loadWh }]),
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
};
