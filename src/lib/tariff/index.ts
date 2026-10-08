import { z } from "zod";
import type { TouPeriod } from "~/lib/dashboard";
import { localParts } from "~/lib/time";

const num = z.number();
const window = z.object({
  fromDayOfWeek: num,
  toDayOfWeek: num,
  fromHour: num,
  fromMinute: num,
  toHour: num,
  toMinute: num,
});
const season = z.object({
  fromMonth: num,
  fromDay: num,
  toMonth: num,
  toDay: num,
  tou_periods: z.record(z.string(), z.array(window)),
});
// Rate tables: season -> name -> $/kWh, read defensively in rate().
const rates = z.record(z.string(), z.unknown());
const tariffSchema = z.object({
  seasons: z.record(z.string(), z.unknown()),
  energy_charges: rates.optional(),
  sell_tariff: z.object({ energy_charges: rates.optional() }).optional(),
});

type Window = z.infer<typeof window>;
type Season = z.infer<typeof season>;
type Rates = Record<string, unknown>;
export interface Tariff {
  seasons: Record<string, Season>;
  buy: Rates;
  sell: Rates | null;
}

export function parseTariff(json: unknown): Tariff | null {
  const r = tariffSchema.safeParse(json);
  if (!r.success) return null;
  const seasons: Record<string, Season> = {};
  for (const [k, v] of Object.entries(r.data.seasons)) {
    const s = season.safeParse(v); // empty/malformed seasons (e.g. `ALL: {}`) are dropped, never matched
    if (s.success) seasons[k] = s.data;
  }
  return {
    seasons,
    buy: r.data.energy_charges ?? {},
    sell: r.data.sell_tariff?.energy_charges ?? null,
  };
}

const NAMES: Record<string, TouPeriod> = {
  ON_PEAK: "peak",
  PARTIAL_PEAK: "mid-peak",
};

function inSeason(s: Season, month: number, day: number) {
  const x = month * 100 + day,
    a = s.fromMonth * 100 + s.fromDay,
    b = s.toMonth * 100 + s.toDay;
  return a <= b ? x >= a && x <= b : x >= a || x <= b;
}

function inWindow(w: Window, weekday: number, minutes: number) {
  if (weekday < w.fromDayOfWeek || weekday > w.toDayOfWeek) return false;
  const from = w.fromHour * 60 + w.fromMinute,
    to = w.toHour * 60 + w.toMinute;
  return from < to
    ? minutes >= from && minutes < to
    : minutes >= from || minutes < to; // from >= to wraps midnight
}

function rate(table: Rates | null, season: string | undefined, name: string) {
  if (!table) return 0;
  const get = (a: string, b: string) => {
    const v = (table[a] as Record<string, unknown> | undefined)?.[b];
    return typeof v === "number" ? v : 0;
  };
  return (get("ALL", "ALL") + (season ? get(season, name) : 0)) * 100;
}

function classify(t: Tariff, ms: number, tz: string) {
  const p = localParts(ms, tz);
  const minutes = p.hour * 60 + p.minute;
  for (const [sName, s] of Object.entries(t.seasons)) {
    if (!inSeason(s, p.month, p.day)) continue;
    const hit = Object.entries(s.tou_periods).find(([, ws]) =>
      ws.some((w) => inWindow(w, p.weekday, minutes)),
    );
    const name = hit?.[0] ?? "OFF_PEAK";
    return {
      period: NAMES[name] ?? ("off-peak" as TouPeriod),
      season: sName,
      name,
    };
  }
  return {
    period: "off-peak" as TouPeriod,
    season: undefined,
    name: "OFF_PEAK",
  };
}

const STEP = 15 * 60_000;
const SPAN = 8 * 86_400_000;

export function tariffAt(t: Tariff, ms: number, tz: string) {
  const c = classify(t, ms, tz);
  // ponytail: 15-min scan, up to 8 days; solve boundaries exactly if tariffs ever need sub-15-min windows
  let endsAt = ms + SPAN;
  for (let x = Math.floor(ms / STEP) * STEP + STEP; x < ms + SPAN; x += STEP) {
    if (classify(t, x, tz).period !== c.period) {
      endsAt = x;
      break;
    }
  }
  return {
    period: c.period,
    importCentsPerKwh: rate(t.buy, c.season, c.name),
    exportCentsPerKwh: rate(t.sell, c.season, c.name),
    endsAt: new Date(endsAt).toISOString(),
  };
}

export function costToday(
  t: Tariff,
  hours: { hour: string; gridImportWh: number; gridExportWh: number }[],
  tz: string,
) {
  const wh: Record<TouPeriod, number> = {
    "off-peak": 0,
    "mid-peak": 0,
    peak: 0,
  };
  const cents: Record<TouPeriod, number> = {
    "off-peak": 0,
    "mid-peak": 0,
    peak: 0,
  };
  let credit = 0;
  for (const h of hours) {
    const r = tariffAt(t, Date.parse(h.hour), tz);
    wh[r.period] += h.gridImportWh;
    cents[r.period] += (h.gridImportWh * r.importCentsPerKwh) / 1000;
    credit += (h.gridExportWh * r.exportCentsPerKwh) / 1000;
  }
  const periods = (["off-peak", "mid-peak", "peak"] as const).map((period) => ({
    period,
    importWh: wh[period],
    costCents: Math.round(cents[period]),
  }));
  const exportCreditCents = Math.round(credit);
  return {
    periods,
    exportCreditCents,
    netCents: periods.reduce((s, p) => s + p.costCents, 0) - exportCreditCents,
  };
}
