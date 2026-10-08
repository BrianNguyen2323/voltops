// Pure, advisory only (D11): nothing here writes to the Powerwall.
import { peakEstimateWh, reservePlan, type DashboardSnapshot, type PeakHistory } from "~/lib/dashboard";
import { tariffAt, type Tariff } from "~/lib/tariff";
import { addDays, localDate, localMidnight, localParts } from "~/lib/time";

const HOUR = 3_600_000;

type HourTemp = { hour: number; tempC: number };

/** Hours of local day `date` whose period is "peak": UTC bounds plus local minutes after midnight. */
export function peakWindow(tariff: Tariff | null, date: string, tz: string) {
  if (!tariff) return null;
  const mid = localMidnight(date, tz);
  const next = localMidnight(addDays(date, 1), tz);
  let first: number | null = null;
  let last: number | null = null;
  for (let h = mid; h < next; h += HOUR)
    if (tariffAt(tariff, h, tz).period === "peak") {
      first ??= h;
      last = h;
    }
  if (first === null || last === null) return null;
  const mins = (ms: number) => {
    if (ms >= next) return 1440;
    const p = localParts(ms, tz);
    return p.hour * 60 + p.minute;
  };
  return { startMs: first, endMs: last + HOUR, fromMin: mins(first), toMin: mins(last + HOUR) };
}

/** Max over the local day: observed temp per hour, else the forecast temp. */
export function dayHighC(
  date: string,
  tz: string,
  observed: HourTemp[],
  forecast: HourTemp[],
): number | null {
  const mid = localMidnight(date, tz);
  const next = localMidnight(addDays(date, 1), tz);
  const byHour = new Map<number, number>();
  for (const r of forecast) if (r.hour >= mid && r.hour < next) byHour.set(r.hour, r.tempC);
  for (const r of observed) if (r.hour >= mid && r.hour < next) byHour.set(r.hour, r.tempC);
  return byHour.size ? Math.max(...byHour.values()) : null;
}

export function reserveRecommendation(i: {
  historyDays: number;
  tomorrow: PeakHistory | null;
  usableCapacityWh: number;
  temperatureUnit: "C" | "F";
  tz: string;
  updatedMs: number;
  tariff: Tariff | null;
}): NonNullable<DashboardSnapshot["recommendation"]> | null {
  const { tomorrow, tariff, tz } = i;
  if (!tomorrow || !tariff || i.historyDays < 7) return null;
  const todayDate = localDate(i.updatedMs, tz);
  const nextDate = addDays(todayDate, 1);
  const win = peakWindow(tariff, nextDate, tz);
  if (!win) return null;

  const reserve = reservePlan(peakEstimateWh(tomorrow), i.usableCapacityWh, 20);
  const peakCents = tariffAt(tariff, win.startMs, tz).importCentsPerKwh;
  let offPeakCents = Infinity;
  for (let h = localMidnight(nextDate, tz); h < localMidnight(addDays(nextDate, 1), tz); h += HOUR) {
    const r = tariffAt(tariff, h, tz);
    if (r.period === "off-peak") offPeakCents = Math.min(offPeakCents, r.importCentsPerKwh);
  }
  if (offPeakCents === Infinity) offPeakCents = peakCents;

  const validFrom = Math.max(i.updatedMs, peakWindow(tariff, todayDate, tz)?.endMs ?? 0);
  const deg =
    i.temperatureUnit === "F"
      ? (c: number) => `${Math.round((c * 9) / 5 + 32)}°F`
      : (c: number) => `${Math.round(c)}°C`;
  const kwh = (wh: number) => (wh / 1000).toFixed(1);
  const near = deg(tomorrow.highC);

  return {
    action: `Raise backup reserve to ${reserve.targetPct}%`,
    validFrom: new Date(validFrom).toISOString(),
    validTo: new Date(win.endMs).toISOString(),
    effectWh: reserve.coveredWh,
    savingsCents: Math.max(0, Math.round((reserve.coveredWh * (peakCents - offPeakCents)) / 1000)),
    why: [
      `Usual peak use: ${kwh(tomorrow.historyAvgWh)} kWh over ${i.historyDays} days`,
      tomorrow.similarTempAvgWh === null
        ? `Not enough days near ${near} yet (${tomorrow.similarTempDays} so far)`
        : `On days near ${near}: ${kwh(tomorrow.similarTempAvgWh)} kWh over ${tomorrow.similarTempDays} days`,
      `Tomorrow's forecast high: ${near}`,
    ],
    confidence: tomorrow.similarTempDays < 3 ? "low" : "medium",
    wouldChange: "A different forecast high for tomorrow, or a tariff change.",
    reserve,
  };
}
