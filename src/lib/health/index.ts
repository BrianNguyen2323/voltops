import type { DashboardSnapshot } from "~/lib/dashboard";
import type { HourEnergy, ObservedHour } from "~/server/history";
import { addDays, localDate, localParts } from "~/lib/time";

type Eh = DashboardSnapshot["equipmentHealth"];

const H = 3_600_000;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const monthOf = (ms: number, tz: string) => localDate(ms, tz).slice(0, 7);

/**
 * Four equipment-health measurements from stored history. Definitions: team/middleware/design/SPEC.md,
 * "Equipment health". Null means "still learning".
 */
export function equipmentHealth(i: {
  hours: HourEnergy[];
  observed: ObservedHour[];
  soc: { ts: number; socPct: number }[];
  tz: string;
  now: number;
}): Omit<Eh, "backfill"> {
  const { hours, observed, soc, tz, now } = i;

  const nowP = localParts(now, tz);
  const [y, m] =
    nowP.month === 1 ? [nowP.year - 1, 12] : [nowP.year, nowP.month - 1];
  const pad = (n: number) => String(n).padStart(2, "0");
  const month = `${y}-${pad(m)}`;
  const baselineMonth = `${y - 1}-${pad(m)}`;

  const obsAt = new Map(observed.map((o) => [o.hour, o]));
  const dateOf = new Map<number, string>();
  for (const h of hours) dateOf.set(h.start, localDate(h.start, tz));

  // solarClearDay
  const clearRatios = (mon: string) =>
    hours.flatMap((h) => {
      const o = obsAt.get(h.start);
      return o &&
        o.cloudPct <= 10 &&
        o.ghiWm2 >= 600 &&
        dateOf.get(h.start)!.startsWith(mon)
        ? [h.solarWh / o.ghiWm2]
        : [];
    });
  const cur = clearRatios(month);
  const base = clearRatios(baselineMonth);
  const baseMedian = base.length < 20 ? 0 : median(base);
  const pctOfBaseline =
    cur.length < 20 || baseMedian === 0
      ? null
      : Math.round((100 * median(cur)) / baseMedian);
  // checkSnapshot allows 0-200; above that the comparison month is bad data.
  const solarClearDay =
    pctOfBaseline === null || pctOfBaseline > 200
      ? null
      : { month, baselineMonth, pctOfBaseline, clearHours: cur.length };

  // sunnyDayMiss
  const today = localDate(now, tz);
  let sunnyDayMiss: Eh["sunnyDayMiss"] = null;
  for (let k = 1; k <= 7 && !sunnyDayMiss; k++) {
    const day = addDays(today, -k);
    const from = addDays(day, -60);
    const span = hours.filter((h) => {
      const d = dateOf.get(h.start)!;
      return d >= from && d <= day;
    });
    if (new Set(span.map((h) => dateOf.get(h.start))).size < 14) continue;

    const dayRows = span.filter((h) => dateOf.get(h.start) === day);
    const sunny = dayRows.flatMap((h) => {
      const o = obsAt.get(h.start);
      return o && o.ghiWm2 > 0 ? [o] : [];
    });
    if (!sunny.length || sum(sunny.map((o) => o.cloudPct)) / sunny.length > 15)
      continue;

    const byHour = new Map<number, number[]>();
    for (const h of span) {
      const o = obsAt.get(h.start);
      if (!o || o.ghiWm2 < 50 || dateOf.get(h.start) === day) continue;
      const lh = localParts(h.start, tz).hour;
      const rs = byHour.get(lh) ?? [];
      rs.push(h.solarWh / o.ghiWm2);
      byHour.set(lh, rs);
    }
    const expected = sum(
      dayRows.map((h) => {
        const r = byHour.get(localParts(h.start, tz).hour);
        return r ? (obsAt.get(h.start)?.ghiWm2 ?? 0) * median(r) : 0;
      }),
    );
    const actual = sum(dayRows.map((h) => h.solarWh));
    if (actual < 0.75 * expected)
      sunnyDayMiss = {
        date: day,
        expectedWh: Math.round(expected),
        actualWh: Math.round(actual),
      };
  }

  // batteryCapacity: discharge only (metered AC out, same basis as the AC nameplate).
  const samples = [...soc].sort((a, b) => a.ts - b.ts);
  const estimates: number[] = [];
  const closeRun = (run: typeof samples) => {
    const first = run[0]!;
    const last = run[run.length - 1]!;
    const points = first.socPct - last.socPct;
    if (points < 40 || monthOf(last.ts, tz) !== month) return;
    const t1 = Math.floor(first.ts / H) * H;
    const t2 = Math.floor(last.ts / H) * H;
    const wh = sum(
      hours
        .filter((h) => h.start >= t1 && h.start < t2)
        .map((h) => h.batteryDischargeWh),
    );
    estimates.push((wh / points) * 100);
  };
  let run: typeof samples = [];
  for (const s of samples) {
    const prev = run[run.length - 1];
    if (prev && s.ts - prev.ts <= 75 * 60_000 && s.socPct < prev.socPct)
      run.push(s);
    else {
      if (run.length) closeRun(run);
      run = [s];
    }
  }
  if (run.length) closeRun(run);
  const batteryCapacity =
    estimates.length < 5
      ? null
      : {
          month,
          estimatedWh: Math.round(median(estimates)),
          swings: estimates.length,
        };

  // efficiency
  const hoursIn = hours.filter((h) => dateOf.get(h.start)!.startsWith(month));
  const charge = sum(hoursIn.map((h) => h.batteryChargeWh));
  const days = new Set(hoursIn.map((h) => dateOf.get(h.start))).size;
  const effPct =
    days < 10 || charge === 0
      ? null
      : Math.round(
          (100 * sum(hoursIn.map((h) => h.batteryDischargeWh))) / charge,
        );
  const efficiency =
    effPct === null || effPct > 200 ? null : { month, pct: effPct };

  return { solarClearDay, sunnyDayMiss, batteryCapacity, efficiency };
}
