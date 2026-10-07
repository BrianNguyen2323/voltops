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
  /** TOU period in effect during this hour. */
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

/** Peak-window home use history for one day. */
export type PeakHistory = {
  /** Average home use (Wh, integer >= 0) inside this day's peak window, over every complete stored day. */
  historyAvgWh: number;
  /** This day's forecast high, degrees C (the temperature the days are matched on). */
  highC: number;
  /** Complete stored days whose high is within +/-3 degrees C of highC. Integer >= 0. */
  similarTempDays: number;
  /** Average peak-window home use over those days, Wh; null when similarTempDays < 3. */
  similarTempAvgWh: number | null;
};

/** Structured backup-reserve advice. */
export type ReservePlan = {
  /** Fixed emergency floor, percent (20). */
  emergencyPct: number;
  /** Percent of usable capacity held for the peak: min(100 - emergencyPct, ceil(peakWh * 100 / usableCapacityWh)). */
  extraPct: number;
  /** emergencyPct + extraPct (<= 100). */
  targetPct: number;
  /** Tomorrow's peak estimate, Wh (= peakEstimateWh(tomorrow)). */
  peakWh: number;
  /** Peak Wh the extra reserve covers: peakWh, or less when the target is capped at 100%. */
  coveredWh: number;
};

/** Mean of the all-days and similar-temperature averages (all-days alone when the latter is null). */
export function peakEstimateWh(p: PeakHistory): number {
  return p.similarTempAvgWh === null
    ? p.historyAvgWh
    : Math.round((p.historyAvgWh + p.similarTempAvgWh) / 2);
}

/** Reserve that covers the peak. Shared by the view and the middleware advisor. */
export function reservePlan(
  peakWh: number,
  usableCapacityWh: number,
  emergencyPct = 20,
): ReservePlan {
  const extraPct = Math.min(
    100 - emergencyPct,
    Math.ceil((peakWh * 100) / usableCapacityWh),
  );
  const targetPct = emergencyPct + extraPct;
  return {
    emergencyPct,
    extraPct,
    targetPct,
    peakWh,
    coveredWh:
      targetPct < 100
        ? peakWh
        : Math.min(peakWh, Math.floor((extraPct * usableCapacityWh) / 100)),
  };
}

export type DashboardSnapshot = {
  site: {
    /** Display name shown as the page heading. */
    name: string;
    /** IANA timezone, e.g. "America/Los_Angeles"; defines site-local days and TOU boundaries. */
    timezone: string;
    /** Display unit only; weather values are always stored in degrees C. */
    temperatureUnit: "F" | "C";
  };
  /** Which DataSource adapter produced this snapshot. */
  source: "fleet-api" | "local-gateway" | "replay";
  /** ISO-8601 UTC. "Today" is the site-local date of this instant. */
  updatedAt: string;
  /** ISO 4217 currency code, e.g. "USD"; money fields are integer minor units (cents). */
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
    /** Usable battery capacity, Wh. */
    usableCapacityWh: number;
    /** "islanded" = grid is down. */
    gridStatus: "connected" | "islanded";
  };
  tariffNow: {
    period: TouPeriod;
    /** Import rate, cents per kWh. */
    importCentsPerKwh: number;
    /** Export (sell-back) rate, cents per kWh. */
    exportCentsPerKwh: number;
    /** ISO-8601 UTC: when the current period ends. */
    endsAt: string;
  };
  recommendation: null | {
    /** Plain-language action, e.g. "Set backup reserve to 65% from 9 PM". */
    action: string;
    /** ISO-8601 UTC: start of the validity window. */
    validFrom: string;
    /** ISO-8601 UTC: end of the validity window. */
    validTo: string;
    /** Expected energy effect vs. doing nothing, Wh. */
    effectWh: number;
    /** Expected saving vs. doing nothing, integer cents. */
    savingsCents: number;
    /** Plain-language reasons built from the inputs. */
    why: string[];
    confidence: "low" | "medium" | "high";
    /** What would change the advice. */
    wouldChange: string;
    /** When present, the UI shows the structured reserve sentence instead of the plain action. */
    reserve?: ReservePlan;
  };
  /** Peak-window usage history; feeds the Peak hours tile and the reserve advice. */
  peakEstimate: {
    /** Complete site-local days of stored history (integer >= 0). < 7 = learning. */
    historyDays: number;
    /** null when that day has no peak hours in the Timeline, or historyDays is 0. */
    today: PeakHistory | null;
    tomorrow: PeakHistory | null;
  };
  /** Consecutive UTC hours covering the whole site-local today and tomorrow (47-49 rows). */
  timeline: TimelineHour[];
  /** Today's cost so far; import Wh per period must equal today's grid import. */
  costToday: {
    /** Per TOU period: grid import, Wh, and its cost, integer cents. */
    periods: Array<{ period: TouPeriod; importWh: number; costCents: number }>;
    /** Integer cents. */
    exportCreditCents: number;
    /** Integer cents: sum of costCents minus exportCreditCents. */
    netCents: number;
  };
  /** The 6 site-local days before today, oldest first; `date` is YYYY-MM-DD site-local, energies Wh. */
  previousDays: Array<{ date: string; solarWh: number; loadWh: number }>;
  /** Forecast accuracy per target, vs. its naive baseline. */
  accuracy: Array<{
    target: "load" | "solar";
    /** Model id/version, e.g. "load-v1". */
    model: string;
    /** Baseline name, e.g. "same hour last week". */
    baseline: string;
    /** Model mean absolute error, percent. */
    maePct: number;
    /** Baseline mean absolute error, percent. */
    baselineMaePct: number;
    /** Number of days evaluated. */
    days: number;
  }>;
  health: {
    /** ISO-8601 UTC. */
    lastPollAt: string;
    /** Estimated source API requests per month at the current poll interval (a count). */
    estRequestsPerMonth: number;
    /** Human-readable warnings for the Health screen. */
    warnings: string[];
  };
  /** Null hides the tile. */
  weatherTomorrow: null | {
    /** YYYY-MM-DD, site-local. */
    date: string;
    condition: "clear" | "partly-cloudy" | "cloudy" | "rain";
    /** Forecast high, degrees C. */
    highC: number;
    /** Forecast low, degrees C. */
    lowC: number;
    /** Cloud cover, percent 0-100. */
    cloudCoverPct: number;
    /** Chance of precipitation, percent 0-100. */
    precipitationChancePct: number;
  };
};

export type PeakDay = PeakHistory & {
  estimateWh: number;
  /** ISO UTC: start of that day's first peak Timeline hour. */
  windowStart: string;
  /** ISO UTC: end of its last peak hour. */
  windowEnd: string;
  /** Today only: sum of loadWh of actual peak hours; null if none yet, always null for tomorrow. */
  usedSoFarWh: number | null;
};

export type DashboardView = Omit<DashboardSnapshot, "previousDays"> & {
  peakUsage: {
    /** historyDays < 7. */
    learning: boolean;
    historyDays: number;
    today: PeakDay | null;
    tomorrow: PeakDay | null;
  };
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
// Returns "" (never throws) for an unparseable instant or an invalid timezone.
const localDate = (ms: number, timeZone: string): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return "";
  }
};

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

  if (localDate(0, tz) === "") {
    out.push("site.timezone is not a valid IANA timezone");
    return out; // every remaining rule is site-local
  }
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
  if (sum(c.periods.map((p) => p.importWh)) !== todayImport)
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

  // 7. peakEstimate and reserve
  const pe = s.peakEstimate;
  if (!isCount(pe.historyDays))
    out.push("peakEstimate.historyDays must be an integer >= 0");
  const hasPeak = (date: string) =>
    rows.some(({ r, ms }) => r.period === "peak" && dateOf(ms) === date);
  for (const [name, p, date] of [
    ["today", pe.today, today],
    ["tomorrow", pe.tomorrow, tomorrow],
  ] as const) {
    if (!p) continue;
    const at = `peakEstimate.${name}`;
    if (
      !isCount(p.historyAvgWh) ||
      (p.similarTempAvgWh !== null && !isCount(p.similarTempAvgWh))
    )
      out.push(`${at} Wh must be integers >= 0`);
    if (!isCount(p.similarTempDays) || p.similarTempDays > pe.historyDays)
      out.push(`${at}.similarTempDays must be an integer <= historyDays`);
    if ((p.similarTempAvgWh === null) !== p.similarTempDays < 3)
      out.push(
        `${at}.similarTempAvgWh must be null exactly when similarTempDays < 3`,
      );
    if (!hasPeak(date))
      out.push(`${at} must be null: ${date} has no peak hours`);
  }
  const rv = s.recommendation?.reserve;
  if (rv) {
    if (rv.emergencyPct < 20)
      out.push("recommendation.reserve.emergencyPct must be >= 20");
    if (!pe.tomorrow || pe.historyDays < 7)
      out.push(
        "recommendation.reserve needs peakEstimate.tomorrow and historyDays >= 7",
      );
    else {
      const want = reservePlan(
        peakEstimateWh(pe.tomorrow),
        l.usableCapacityWh,
        rv.emergencyPct,
      );
      if (
        (Object.keys(want) as Array<keyof ReservePlan>).some(
          (k) => want[k] !== rv[k],
        )
      )
        out.push(
          "recommendation.reserve does not match reservePlan(peakEstimateWh(tomorrow), usableCapacityWh)",
        );
    }
  }

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
  const peakDay = (date: string, p: PeakHistory | null): PeakDay | null => {
    const peak = rows.filter(
      ({ r, date: d }) => d === date && r.period === "peak",
    );
    const firstP = peak[0];
    const lastP = peak[peak.length - 1];
    if (!p || !firstP || !lastP) return null;
    const done = peak.filter(({ r }) => r.kind === "actual");
    return {
      ...p,
      estimateWh: peakEstimateWh(p),
      windowStart: firstP.r.hour,
      windowEnd: new Date(Date.parse(lastP.r.hour) + HOUR).toISOString(),
      usedSoFarWh:
        date === today && done.length > 0
          ? sum(done.map(({ r }) => r.loadWh))
          : null,
    };
  };
  return {
    ...rest,
    peakUsage: {
      learning: s.peakEstimate.historyDays < 7,
      historyDays: s.peakEstimate.historyDays,
      today: peakDay(today, s.peakEstimate.today),
      tomorrow: peakDay(tomorrow, s.peakEstimate.tomorrow),
    },
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
