// Pure copy for the Tonight card (SPEC Rev 7): no React, no I/O.
import type { DashboardView } from "~/lib/dashboard";
import { formatKwh, formatTemp } from "~/lib/format";

export const clock = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(Date.parse(iso));

const localDate = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(Date.parse(iso)); // YYYY-MM-DD

const localHour = (iso: string, tz: string) =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: tz,
    }).format(Date.parse(iso)),
  );

/** "tonight" | "today" | "tomorrow" | weekday name, relative to updatedAt's local date. */
export function dayWord(iso: string, updatedAt: string, tz: string): string {
  const d = localDate(iso, tz);
  const base = localDate(updatedAt, tz);
  if (d === base) return localHour(iso, tz) >= 17 ? "tonight" : "today";
  const next = new Date(Date.parse(base + "T00:00:00Z") + 864e5)
    .toISOString()
    .slice(0, 10);
  if (d === next) return "tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: tz,
  }).format(Date.parse(iso));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The two-step line: `lead` is bold, `rest` follows it directly. Null without a reserve. */
export function reserveSteps(
  view: DashboardView,
): Array<{ lead: string; rest: string }> {
  const { recommendation: rec, updatedAt, site } = view;
  const tz = site.timezone;
  if (!rec?.reserve) return [];
  const { targetPct, emergencyPct } = rec.reserve;
  const at = (iso: string) =>
    `${cap(dayWord(iso, updatedAt, tz))} at ${clock(iso, tz)}`;
  const start =
    Date.parse(rec.validFrom) <= Date.parse(updatedAt)
      ? { lead: "Now", rest: `, raise it to ${targetPct}%.` }
      : {
          lead: at(rec.validFrom),
          rest: `, after today's peak hours end, raise it to ${targetPct}%.`,
        };
  return [
    start,
    {
      lead: at(rec.validTo),
      rest: `, when peak hours start, lower it back to ${emergencyPct}% so the battery covers the peak.`,
    },
  ];
}

/** Three popover sections, or null when there is no reserve or no tomorrow peak. */
export function confidenceInfo(
  view: DashboardView,
): Array<{ title: string; text: string }> | null {
  const rec = view.recommendation;
  const T = view.peakUsage.tomorrow;
  if (!rec?.reserve || !T) return null;
  const tz = view.site.timezone;
  const unit = view.site.temperatureUnit;
  const n = T.similarTempDays;
  const days = `${n} past day${n === 1 ? "" : "s"}`;
  const temp = formatTemp(T.highC, unit);
  const usual = `your usual peak use: ${formatKwh(T.historyAvgWh)} over ${view.peakUsage.historyDays} days.`;
  const why =
    rec.confidence === "low"
      ? `${n === 0 ? "No past days had" : `Only ${days} had`} a high near ${temp}${n === 0 ? " yet" : ""}; 3 are needed. Until then this uses ${usual}`
      : `Based on ${days} with a high near ${temp} (${formatKwh(T.similarTempAvgWh ?? 0)} on average), mixed with ${usual}`;
  return [
    { title: `Why ${rec.confidence} confidence`, text: why },
    {
      title: "If tomorrow's forecast high changes",
      text: `This uses days with a high between ${formatTemp(T.highC - 3, unit)} and ${formatTemp(T.highC + 3, unit)}. If the forecast moves outside that range, other days are used. Hotter or colder days usually mean more AC or heating, so a higher reserve. The advice updates on its own.`,
    },
    {
      title: "If your tariff changes",
      text: `Your peak hours are ${clock(T.windowStart, tz)}–${clock(T.windowEnd, tz)}. If they move, the raise and lower times move with them. The saving is the gap between peak and off-peak prices: a smaller gap means a smaller saving. If your plan has no peak hours, there is no advice.`,
    },
  ];
}
