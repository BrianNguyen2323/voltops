import { describe, expect, it } from "vitest";

import { sampleSnapshot } from "~/app/(protected)/home/data";
import type { DashboardSnapshot } from "~/lib/dashboard";
import {
  batteryCapacityStatus,
  bestHourPerPanelW,
  efficiencyStatus,
  solarStatus,
  systemSizeW,
} from "./system";

type Health = DashboardSnapshot["equipmentHealth"];
type Solar = NonNullable<DashboardSnapshot["system"]>["solar"];

const health = (over: Partial<Health> = {}): Health => ({
  ...structuredClone(sampleSnapshot.equipmentHealth),
  ...over,
});
const clear = (pctOfBaseline: number): Health["solarClearDay"] => ({
  month: "2026-06",
  baselineMonth: "2025-06",
  pctOfBaseline,
  clearHours: 41,
});
const cap = (estimatedWh: number): Health["batteryCapacity"] => ({
  month: "2026-06",
  estimatedWh,
  swings: 18,
});
const eff = (pct: number): Health["efficiency"] => ({ month: "2026-06", pct });

describe("solarStatus (95 watch, 85 check)", () => {
  it.each([
    [95, "ok"],
    [94, "watch"],
    [85, "watch"],
    [84, "check"],
  ])("%i%% -> %s", (pct, want) => {
    expect(solarStatus(health({ solarClearDay: clear(pct) }))).toBe(want);
  });
  it("a non-null sunnyDayMiss makes it check, even when clear-day is ok", () => {
    const sunnyDayMiss = {
      date: "2026-10-05",
      expectedWh: 40000,
      actualWh: 25000,
    };
    expect(
      solarStatus(health({ solarClearDay: clear(98), sunnyDayMiss })),
    ).toBe("check");
  });
  it("is learning when the clear-day measurement is null", () => {
    expect(solarStatus(health({ solarClearDay: null }))).toBe("learning");
  });
});

describe("batteryCapacityStatus (90% watch, 80% check of rating)", () => {
  it.each([
    [24300, "ok"], // 90%
    [24273, "watch"], // 89.9%
    [21600, "watch"], // 80%
    [21573, "check"], // 79.9%
  ])("%i Wh of 27000 -> %s", (wh, want) => {
    expect(
      batteryCapacityStatus(health({ batteryCapacity: cap(wh) }), 27000),
    ).toBe(want);
  });
  it("is learning when null", () => {
    expect(
      batteryCapacityStatus(health({ batteryCapacity: null }), 27000),
    ).toBe("learning");
  });
});

describe("efficiencyStatus (85 watch)", () => {
  it.each([
    [85, "ok"],
    [84, "watch"],
  ])("%i%% -> %s", (pct, want) => {
    expect(efficiencyStatus(health({ efficiency: eff(pct) }))).toBe(want);
  });
  it("is learning when null", () => {
    expect(efficiencyStatus(health({ efficiency: null }))).toBe("learning");
  });
});

describe("system size", () => {
  const solar = (over: Partial<Solar>): Solar => ({
    ...structuredClone(sampleSnapshot.system!.solar),
    ...over,
  });
  it("sample: 24 x 400 W = 9600 W, best hour 329 W per panel", () => {
    const s = sampleSnapshot.system!.solar;
    expect(systemSizeW(s)).toBe(9600);
    expect(bestHourPerPanelW(s)).toBe(329);
  });
  it("are null when panels are not set", () => {
    expect(systemSizeW(solar({ panelCount: null }))).toBeNull();
    expect(systemSizeW(solar({ panelWatts: null }))).toBeNull();
    expect(bestHourPerPanelW(solar({ panelCount: null }))).toBeNull();
  });
  it("per-panel is null without a best hour", () => {
    expect(bestHourPerPanelW(solar({ bestHourWh: null }))).toBeNull();
  });
});
