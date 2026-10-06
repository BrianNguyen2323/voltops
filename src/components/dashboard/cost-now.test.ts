import { describe, expect, it } from "vitest";

import { sampleDashboard, type DashboardData } from "~/app/(protected)/home/data";
import { costNow } from "~/components/dashboard/cost-now";

const live = (p: Partial<DashboardData["live"]>): DashboardData["live"] => ({ ...sampleDashboard.live, ...p });
const rates = { ...sampleDashboard.tariffNow, importCentsPerKwh: 48, exportCentsPerKwh: 8 };

describe("costNow", () => {
  it("matches the sample: not buying, saving 99, earning 13", () => {
    expect(costNow(sampleDashboard.live, sampleDashboard.tariffNow)).toEqual({
      spendingCentsPerHour: 0,
      savingCentsPerHour: 99,
      earningCentsPerHour: 13,
    });
  });

  it("splits importing into spending and saving", () => {
    expect(costNow(live({ loadW: 2000, gridW: 1500 }), rates)).toEqual({
      spendingCentsPerHour: 72,
      savingCentsPerHour: 24,
      earningCentsPerHour: 0,
    });
  });

  it("is all zero when load and grid are 0", () => {
    expect(costNow(live({ loadW: 0, gridW: 0 }), rates)).toEqual({
      spendingCentsPerHour: 0,
      savingCentsPerHour: 0,
      earningCentsPerHour: 0,
    });
  });

  it("returns integers", () => {
    const r = costNow(live({ loadW: 1333, gridW: 777 }), { ...rates, importCentsPerKwh: 37, exportCentsPerKwh: 11 });
    for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
  });
});
