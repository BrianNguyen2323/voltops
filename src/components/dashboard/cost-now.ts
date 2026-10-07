import type { DashboardView } from "~/lib/dashboard";

// Money per hour at the current power and rates; whole cents.
export function costNow(
  live: DashboardView["live"],
  t: DashboardView["tariffNow"],
) {
  const bought = Math.max(live.gridW, 0);
  const per = (w: number, cents: number) => Math.round((w * cents) / 1000);
  return {
    spendingCentsPerHour: per(bought, t.importCentsPerKwh),
    savingCentsPerHour: Math.max(
      0,
      per(live.loadW - bought, t.importCentsPerKwh),
    ),
    earningCentsPerHour: per(Math.max(-live.gridW, 0), t.exportCentsPerKwh),
  };
}
