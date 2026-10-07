// Dashboard snapshot (what a data source delivers), its check, and the derived view the UI reads.
// Pure: no React, no I/O. Canonical units (CLAUDE.md section 5): W, Wh, integer cents, ISO-8601 UTC.
// Signs: batteryW > 0 discharging, < 0 charging; gridW > 0 importing, < 0 exporting.

/** Time-of-use tariff period. */
export type TouPeriod = "off-peak" | "mid-peak" | "peak";

/** One hour of the timeline. Energies are Wh; `hour` is the ISO-8601 UTC start of the hour. */
export type TimelineHour = {
  /** ISO-8601 UTC start of the hour. */
  hour: string;
  /** "actual" = measured (hour < updatedAt); "forecast" = predicted. */
  kind: "actual" | "forecast";
  /** Home consumption, Wh, integer >= 0. */
  loadWh: number;
  /** Solar generation, Wh, integer >= 0. */
  solarWh: number;
  /** Battery state of charge at the start of the hour, 0-100. */
  socPct: number;
  period: TouPeriod;
  /** Forecast hours only: p10/p90 interval of loadWh / solarWh, Wh. */
  loadP10Wh?: number;
  loadP90Wh?: number;
  solarP10Wh?: number;
  solarP90Wh?: number;
  /** Actual hours only, Wh, integers >= 0: energy bought from / sold to the grid. */
  gridImportWh?: number;
  gridExportWh?: number;
  /** Actual hours only, Wh, integers >= 0: energy into / out of the battery. */
  batteryChargeWh?: number;
  batteryDischargeWh?: number;
};

export type DashboardSnapshot = {
  site: { name: string; timezone: string; temperatureUnit: "F" | "C" };
  source: "fleet-api" | "local-gateway" | "replay";
  /** ISO-8601 UTC. "Today" is the site-local date of this instant. */
  updatedAt: string;
  currency: string;
  /** Instantaneous reading at `updatedAt`. */
  live: {
    /** W, integer >= 0. */
    solarW: number;
    /** W, integer >= 0. */
    loadW: number;
    /** W, integer; > 0 discharging, < 0 charging. */
    batteryW: number;
    /** W, integer; > 0 importing, < 0 exporting. */
    gridW: number;
    /** 0-100. */
    socPct: number;
    /** Wh. */
    usableCapacityWh: number;
    gridStatus: "connected" | "islanded";
  };
  tariffNow: {
    period: TouPeriod;
    /** Cents per kWh. */
    importCentsPerKwh: number;
    exportCentsPerKwh: number;
    /** ISO-8601 UTC. */
    endsAt: string;
  };
  recommendation: null | {
    action: string;
    /** ISO-8601 UTC. */
    validFrom: string;
    validTo: string;
    /** Wh. */
    effectWh: number;
    /** Integer cents. */
    savingsCents: number;
    why: string[];
    confidence: "low" | "medium" | "high";
    wouldChange: string;
  };
  /** Consecutive UTC hours covering the whole site-local today and tomorrow (47-49 rows). */
  timeline: TimelineHour[];
  /** Today's cost so far; import Wh per period must equal today's grid import. */
  costToday: {
    periods: Array<{ period: TouPeriod; importWh: number; costCents: number }>;
    /** Integer cents. */
    exportCreditCents: number;
    /** Integer cents: sum of costCents minus exportCreditCents. */
    netCents: number;
  };
  /** The 6 site-local days before today, oldest first. Wh. */
  previousDays: Array<{ date: string; solarWh: number; loadWh: number }>;
  accuracy: Array<{
    target: "load" | "solar";
    model: string;
    baseline: string;
    maePct: number;
    baselineMaePct: number;
    days: number;
  }>;
  health: {
    /** ISO-8601 UTC. */
    lastPollAt: string;
    estRequestsPerMonth: number;
    warnings: string[];
  };
  /** Null hides the tile. */
  weatherTomorrow: null | {
    /** YYYY-MM-DD, site-local. */
    date: string;
    condition: "clear" | "partly-cloudy" | "cloudy" | "rain";
    highC: number;
    lowC: number;
    cloudCoverPct: number;
    precipitationChancePct: number;
  };
};

export type DashboardView = Omit<DashboardSnapshot, "previousDays"> & {
  /** Sums over today's actual hours, Wh; selfPoweredPct 0-100. */
  today: {
    solarWh: number;
    loadWh: number;
    gridImportWh: number;
    gridExportWh: number;
    batteryChargeWh: number;
    batteryDischargeWh: number;
    selfPoweredPct: number;
  };
  /** previousDays plus today. */
  last7Days: Array<{ date: string; solarWh: number; loadWh: number }>;
  /** Total solar (all hours) of today vs tomorrow. */
  solarOutlook: {
    todayWh: number;
    tomorrowWh: number;
    changePct: number;
    direction: "less" | "more";
  };
};

const HOUR = 3_600_000;
const TOLERANCE = 50; // W / Wh

// ponytail: moves to the site-local time module (architecture backlog item 2)
const localDate = (ms: number, timeZone: string): string =>
  Number.isNaN(ms)
    ? ""
    : new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(ms));

const addDays = (date: string, n: number): string => {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const isInt = (x: unknown): x is number => Number.isInteger(x);
const isCount = (x: unknown): x is number => isInt(x) && x >= 0;

/** One message per problem; never throws, never mutates. */
export function checkSnapshot(s: DashboardSnapshot): string[] {
  const out: string[] = [];
  const tz = s.site.timezone;

  // 6. ISO strings
  const isos: Array<[string, string]> = [
    ["updatedAt", s.updatedAt],
    ["tariffNow.endsAt", s.tariffNow.endsAt],
    ["health.lastPollAt", s.health.lastPollAt],
    ...(s.recommendation
      ? ([
          ["recommendation.validFrom", s.recommendation.validFrom],
          ["recommendation.validTo", s.recommendation.validTo],
        ] as Array<[string, string]>)
      : []),
    ...s.timeline.map((r, i): [string, string] => [
      `timeline[${i}].hour`,
      r.hour,
    ]),
  ];
  for (const [name, v] of isos)
    if (Number.isNaN(Date.parse(v)))
      out.push(`${name} is not a valid ISO date`);

  // 1. Live
  const l = s.live;
  for (const k of ["solarW", "loadW", "batteryW", "gridW"] as const)
    if (!isInt(l[k])) out.push(`live.${k} must be an integer`);
  if (l.solarW < 0) out.push("live.solarW must be >= 0");
  if (l.loadW < 0) out.push("live.loadW must be >= 0");
  if (Math.abs(l.solarW + l.batteryW + l.gridW - l.loadW) > TOLERANCE)
    out.push("live flows do not balance (solar + battery + grid != load)");
  if (!(l.socPct >= 0 && l.socPct <= 100))
    out.push("live.socPct must be 0-100");

  const updatedMs = Date.parse(s.updatedAt);
  if (Number.isNaN(updatedMs)) return out; // nothing site-local can be derived
  const today = localDate(updatedMs, tz);
  const tomorrow = addDays(today, 1);
  const rows = s.timeline.map((r) => ({ r, ms: Date.parse(r.hour) }));
  const dateOf = (ms: number) => localDate(ms, tz);

  // 2. Timeline
  for (let i = 1; i < rows.length; i++)
    if ((rows[i]?.ms ?? 0) - (rows[i - 1]?.ms ?? 0) !== HOUR)
      out.push(`timeline[${i}] is not 1 h after the previous hour`);
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || dateOf(first.ms) !== today || dateOf(first.ms - HOUR) === today)
    out.push("timeline does not start at local midnight of today");
  if (
    !last ||
    dateOf(last.ms) !== tomorrow ||
    dateOf(last.ms + HOUR) === tomorrow
  )
    out.push("timeline does not end at local midnight after tomorrow");
  let seenForecast = false;
  rows.forEach(({ r, ms }, i) => {
    const at = `timeline[${i}]`;
    if (r.kind === "forecast") seenForecast = true;
    else if (seenForecast) out.push(`${at} is actual after a forecast hour`);
    if (r.kind === "actual") {
      if (!(ms < updatedMs))
        out.push(`${at} is actual but not before updatedAt`);
      const f = [
        r.gridImportWh,
        r.gridExportWh,
        r.batteryChargeWh,
        r.batteryDischargeWh,
      ];
      if (!f.every(isCount))
        out.push(`${at} needs 4 integer breakdown fields >= 0`);
      else {
        const [gi = 0, ge = 0, bc = 0, bd = 0] = f;
        if (Math.abs(r.solarWh + bd + gi - (r.loadWh + bc + ge)) > TOLERANCE)
          out.push(`${at} energy does not balance`);
      }
      if (
        [r.loadP10Wh, r.loadP90Wh, r.solarP10Wh, r.solarP90Wh].some(
          (x) => x !== undefined,
        )
      )
        out.push(`${at} is actual but has p10/p90`);
    } else {
      if (
        [
          r.gridImportWh,
          r.gridExportWh,
          r.batteryChargeWh,
          r.batteryDischargeWh,
        ].some((x) => x !== undefined)
      )
        out.push(`${at} is forecast but has breakdown fields`);
      for (const [name, v, lo, hi] of [
        ["load", r.loadWh, r.loadP10Wh, r.loadP90Wh],
        ["solar", r.solarWh, r.solarP10Wh, r.solarP90Wh],
      ] as const)
        if (lo === undefined || hi === undefined || !(lo <= v && v <= hi))
          out.push(`${at} ${name} needs p10 <= value <= p90`);
    }
  });

  // 3. costToday
  const todayImport = sum(
    rows
      .filter(({ r, ms }) => r.kind === "actual" && dateOf(ms) === today)
      .map(({ r }) => r.gridImportWh ?? 0),
  );
  const c = s.costToday;
  if (Math.abs(sum(c.periods.map((p) => p.importWh)) - todayImport) > TOLERANCE)
    out.push("costToday period imports do not sum to today's grid import");
  if (
    c.netCents !==
    sum(c.periods.map((p) => p.costCents)) - c.exportCreditCents
  )
    out.push("costToday.netCents != sum(costCents) - exportCreditCents");

  // 4. previousDays
  const pd = s.previousDays;
  if (pd.length !== 6) out.push("previousDays must have 6 entries");
  else if (pd.some((d, i) => d.date !== addDays(today, i - 6)))
    out.push(
      "previousDays must be the 6 consecutive days before today, oldest first",
    );

  // 5. weatherTomorrow
  if (s.weatherTomorrow && s.weatherTomorrow.date !== tomorrow)
    out.push("weatherTomorrow.date is not tomorrow's local date");

  return out;
}

/** Derive what the UI reads. Pure; assumes a snapshot that passed `checkSnapshot`. */
export function toDashboardView(s: DashboardSnapshot): DashboardView {
  const { previousDays, ...rest } = s;
  const tz = s.site.timezone;
  const today = localDate(Date.parse(s.updatedAt), tz);
  const tomorrow = addDays(today, 1);
  const rows = s.timeline.map((r) => ({
    r,
    date: localDate(Date.parse(r.hour), tz),
  }));
  const actualToday = rows.filter(
    ({ r, date }) => r.kind === "actual" && date === today,
  );
  const tot = (f: (r: TimelineHour) => number | undefined) =>
    sum(actualToday.map(({ r }) => f(r) ?? 0));
  const solarWh = tot((r) => r.solarWh);
  const loadWh = tot((r) => r.loadWh);
  const gridImportWh = tot((r) => r.gridImportWh);
  const selfPoweredPct =
    loadWh === 0
      ? 0
      : Math.min(
          100,
          Math.max(0, Math.round(100 * (1 - gridImportWh / loadWh))),
        );
  const solarOn = (date: string) =>
    sum(rows.filter((x) => x.date === date).map(({ r }) => r.solarWh));
  const todayWh = solarOn(today);
  const tomorrowWh = solarOn(tomorrow);
  return {
    ...rest,
    today: {
      solarWh,
      loadWh,
      gridImportWh,
      gridExportWh: tot((r) => r.gridExportWh),
      batteryChargeWh: tot((r) => r.batteryChargeWh),
      batteryDischargeWh: tot((r) => r.batteryDischargeWh),
      selfPoweredPct,
    },
    last7Days: [...previousDays, { date: today, solarWh, loadWh }],
    solarOutlook: {
      todayWh,
      tomorrowWh,
      changePct:
        todayWh === 0
          ? 0
          : Math.round(Math.abs(1 - tomorrowWh / todayWh) * 100),
      direction: todayWh !== 0 && tomorrowWh < todayWh ? "less" : "more",
    },
  };
}
