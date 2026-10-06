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
  tariffNow: { period: TouPeriod; importCentsPerKwh: number; exportCentsPerKwh: number; endsAt: string };
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
  health: { lastPollAt: string; estRequestsPerMonth: number; warnings: string[] };
};

const HOUR = 3_600_000;
const UPDATED_AT = "2026-07-15T23:40:00Z"; // 16:40 PDT
const MIDNIGHT = Date.parse("2026-07-15T07:00:00Z"); // local midnight PDT

// Peak 16-21 local, mid-peak 15-16 and 21-24, else off-peak.
const periodOf = (localHour: number): TouPeriod =>
  localHour >= 16 && localHour < 21 ? "peak" : localHour === 15 || localHour >= 21 ? "mid-peak" : "off-peak";

// Deterministic summer shapes; tomorrow (second day) is cloudier.
const timeline: DashboardData["timeline"] = Array.from({ length: 48 }, (_, i) => {
  const t = MIDNIGHT + i * HOUR;
  const h = i % 24;
  const cloud = i >= 24 ? 0.55 : 1;
  const sun = Math.max(0, Math.sin(((h - 6) / 13) * Math.PI));
  const solarWh = Math.round(5600 * sun * cloud);
  const loadWh = Math.round(900 + 700 * Math.max(0, Math.sin(((h - 13) / 10) * Math.PI)) + (h >= 16 && h < 21 ? 600 : 0));
  const socPct = Math.round(Math.min(100, Math.max(10, h < 9 ? 40 : h < 17 ? 40 + (h - 8) * 5 : 85 - (h - 16) * 8)));
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
});

const periods: DashboardData["costToday"]["periods"] = [
  { period: "off-peak", importWh: 3200, costCents: 51 },
  { period: "mid-peak", importWh: 400, costCents: 10 },
  { period: "peak", importWh: 0, costCents: 0 },
];
const exportCreditCents = 38;

export const sampleDashboard: DashboardData = {
  site: { name: "Home", timezone: "America/Los_Angeles" },
  source: "fleet-api",
  updatedAt: UPDATED_AT,
  currency: "USD",
  live: {
    solarW: 4800,
    loadW: 1900,
    batteryW: -2600,
    gridW: -300,
    socPct: 62,
    usableCapacityWh: 13500,
    gridStatus: "connected",
  },
  tariffNow: { period: "mid-peak", importCentsPerKwh: 32, exportCentsPerKwh: 8, endsAt: "2026-07-16T00:00:00Z" },
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
    wouldChange: "A sunnier forecast or a lower evening load would reduce the reserve needed.",
  },
  timeline,
  today: {
    solarWh: 31000,
    loadWh: 17500,
    gridImportWh: 3600,
    gridExportWh: 4800,
    batteryChargeWh: 9000,
    batteryDischargeWh: 5200,
    selfPoweredPct: 79,
  },
  costToday: { periods, exportCreditCents, netCents: periods.reduce((a, p) => a + p.costCents, 0) - exportCreditCents },
  last7Days: [9, 10, 11, 12, 13, 14, 15].map((d, i) => ({
    date: `2026-07-${String(d).padStart(2, "0")}`,
    solarWh: 38000 - i * 300,
    loadWh: 24000 + i * 400,
  })),
  accuracy: [
    { target: "load", model: "load-v1", baseline: "seasonal-naive", maePct: 9, baselineMaePct: 14, days: 28 },
    { target: "solar", model: "solar-v1", baseline: "yesterday", maePct: 11, baselineMaePct: 22, days: 28 },
  ],
  health: { lastPollAt: UPDATED_AT, estRequestsPerMonth: 8640, warnings: [] },
};
