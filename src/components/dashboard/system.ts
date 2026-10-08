// Pure status and copy for "Your system" and Equipment health (SPEC Rev 8): no React, no I/O.
import type { DashboardSnapshot } from "~/lib/dashboard";
import { formatKwh } from "~/lib/format";

type Health = DashboardSnapshot["equipmentHealth"];
type System = NonNullable<DashboardSnapshot["system"]>;
type Solar = System["solar"];

export type HealthStatus = "ok" | "watch" | "check" | "learning";

/** Solar tile status: the worse of the clear-day check and a sunny-day miss. */
export function solarStatus({
  solarClearDay: c,
  sunnyDayMiss,
}: Health): HealthStatus {
  if (sunnyDayMiss) return "check";
  if (!c) return "learning";
  return c.pctOfBaseline < 85 ? "check" : c.pctOfBaseline < 95 ? "watch" : "ok";
}

export function batteryCapacityStatus(
  { batteryCapacity: b }: Health,
  capacityWh: number,
): HealthStatus {
  if (!b) return "learning";
  const x = b.estimatedWh * 100; // compare against capacityWh * pct without rounding
  return x < capacityWh * 80 ? "check" : x < capacityWh * 90 ? "watch" : "ok";
}

export function efficiencyStatus({ efficiency: e }: Health): HealthStatus {
  return !e ? "learning" : e.pct < 85 ? "watch" : "ok";
}

export const systemSizeW = (s: Solar) =>
  s.panelCount !== null && s.panelWatts !== null
    ? s.panelCount * s.panelWatts
    : null;

/** Wh in one hour is about the average W over it. */
export const bestHourPerPanelW = (s: Solar) =>
  s.bestHourWh !== null && s.panelCount
    ? Math.round(s.bestHourWh / s.panelCount)
    : null;

const fmt =
  (opts: Intl.DateTimeFormatOptions) => (d: Date, timeZone?: string) =>
    new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(d);
const monthYear = fmt({ month: "long", year: "numeric" });
const dayYear = fmt({ month: "short", day: "numeric", year: "numeric" });

/** "2026-06" -> "June 2026". */
export const monthLabel = (ym: string) =>
  monthYear(new Date(`${ym}-01T12:00:00Z`), "UTC");

/** "Jun 21, 2026" from an ISO instant (site-local) or a YYYY-MM-DD date. */
export const dateLabel = (iso: string, tz: string) =>
  iso.length === 10
    ? dayYear(new Date(`${iso}T12:00:00Z`), "UTC")
    : dayYear(new Date(iso), tz);

/** Popover copy for the battery health line, or null while learning. */
export function batteryInfo(h: Health, capacityWh: number) {
  const b = h.batteryCapacity;
  if (!b) return null;
  return [
    {
      title: "How this is measured",
      text: `Capacity = battery energy moved ÷ charge % moved, on ${b.swings} long charges or discharges in ${monthLabel(b.month)}. Watch below 90%, Check below 80% of the ${formatKwh(capacityWh)} rating. Efficiency = energy out ÷ energy in; Powerwall 3 is about 89% new. Watch below 85%.`,
    },
  ];
}

/** Popover copy for the solar health line, or null while learning. */
export function solarInfo(h: Health) {
  const c = h.solarClearDay;
  if (!c) return null;
  return [
    {
      title: "How this is measured",
      text: `Output per unit of sunlight on cloud-free hours (${c.clearHours} hours in ${monthLabel(c.month)}), compared with ${monthLabel(c.baselineMonth)}. Panels lose about 0.5% a year; Watch below 95%, Check below 85%. A big drop can mean dirt, new shade or a failed panel.`,
    },
  ];
}
