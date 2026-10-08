import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PeakHistory } from "~/lib/dashboard";
import { parseTariff } from "~/lib/tariff";
import { addDays, localMidnight } from "~/lib/time";
import { dayHighC, peakWindow, reserveRecommendation } from "./reserve";

// Signatures under test (src/lib/advisor/reserve.ts, pure, no I/O; advisory only, D11):
//
//   reserveRecommendation(i: {
//     historyDays: number;                 // completeDays(...).length
//     tomorrow: PeakHistory | null;        // snapshot peakEstimate.tomorrow
//     usableCapacityWh: number;            // snapshot live.usableCapacityWh
//     temperatureUnit: "C" | "F";
//     tz: string;
//     updatedMs: number;                   // updatedAt; "today" = localDate(updatedMs, tz)
//     tariff: Tariff | null;
//   }): NonNullable<DashboardSnapshot["recommendation"]> | null
//     null when tomorrow is null, historyDays < 7, the tariff is null, or tomorrow has no peak window.
//     Otherwise reserve = reservePlan(peakEstimateWh(tomorrow), usableCapacityWh, 20), plus the
//     action / validFrom / validTo / effectWh / savingsCents / why / confidence / wouldChange of B016.
//
//   peakWindow(tariff: Tariff | null, date: string, tz: string):
//     { startMs: number; endMs: number; fromMin: number; toMin: number } | null
//     The hours h of the local day `date` with tariffAt(tariff, h, tz).period === "peak":
//     startMs = start of the first, endMs = end of the last, fromMin/toMin = their local
//     minutes after midnight (toMin is 1440 at midnight). null: no such hour, or no tariff.
//
//   dayHighC(date: string, tz: string,
//            observed: { hour: number; tempC: number }[],
//            forecast: { hour: number; tempC: number }[]): number | null
//     Max over the hours of the local day `date`: the observed temp if that hour has one, else
//     the forecast temp (forecast = one latest-issued row per hour). null when no hour has either.
//     Rows outside the day are ignored.

const HOUR = 3_600_000;
const TZ = "America/Los_Angeles";

const siteInfo = JSON.parse(readFileSync("fixtures/fleet-api/site_info.json", "utf8")) as {
  response: { tariff_content: unknown };
};
const sce = parseTariff(siteInfo.response.tariff_content)!; // SCE TOU-D-4-9PM

const win = (fromHour: number, toHour: number) => ({
  fromDayOfWeek: 0,
  toDayOfWeek: 6,
  fromHour,
  fromMinute: 0,
  toHour,
  toMinute: 0,
});
// One all-year season: ON_PEAK 16-21 and OFF_PEAK the rest, flat $/kWh rates.
const flat = (peak: number, off: number) =>
  parseTariff({
    seasons: {
      Winter: {
        fromMonth: 1,
        fromDay: 1,
        toMonth: 12,
        toDay: 31,
        tou_periods: { ON_PEAK: [win(16, 21)], OFF_PEAK: [win(21, 16)] },
      },
    },
    energy_charges: { Winter: { ON_PEAK: peak, OFF_PEAK: off } },
  })!;

const ph = (
  historyAvgWh: number,
  o: Partial<PeakHistory> = {},
): PeakHistory => ({
  historyAvgWh,
  highC: 35,
  similarTempDays: 0,
  similarTempAvgWh: null,
  ...o,
});

const NOW = Date.parse("2026-05-20T19:30:00Z"); // 12:30 PDT, Wednesday
const base = {
  historyDays: 30,
  usableCapacityWh: 27_000,
  temperatureUnit: "F" as const,
  tz: TZ,
  updatedMs: NOW,
  tariff: flat(0.48, 0.25),
};
const rec = (o: Partial<Parameters<typeof reserveRecommendation>[0]> & { tomorrow: PeakHistory | null }) =>
  reserveRecommendation({ ...base, ...o });

describe("reserveRecommendation", () => {
  it("27 kWh battery, 11 kWh peak: reserve 61%, 253 cents ($0.48 vs $0.25)", () => {
    const r = rec({ tomorrow: ph(11_000) })!;
    expect(r.reserve).toEqual({
      emergencyPct: 20,
      extraPct: 41,
      targetPct: 61,
      peakWh: 11_000,
      coveredWh: 11_000,
    });
    expect(r.action).toBe("Raise backup reserve to 61%");
    expect(r.effectWh).toBe(11_000);
    expect(r.savingsCents).toBe(253);
  });

  it("capped case: a peak above 80% of capacity targets 100% and covers less than the peak", () => {
    const r = rec({ tomorrow: ph(25_000) })!;
    expect(r.reserve).toMatchObject({ extraPct: 80, targetPct: 100, peakWh: 25_000, coveredWh: 21_600 });
    expect(r.action).toBe("Raise backup reserve to 100%");
    expect(r.effectWh).toBe(21_600);
    expect(r.savingsCents).toBe(497); // round(21600 * 23 / 1000) = round(496.8)
  });

  it("estimate is the mean of both averages when the similar-temperature one exists", () => {
    const r = rec({ tomorrow: ph(10_000, { similarTempDays: 4, similarTempAvgWh: 14_000 }) })!;
    expect(r.reserve?.peakWh).toBe(12_000);
  });

  it("is null with fewer than 7 complete days, no tomorrow, no tariff or no peak window", () => {
    expect(rec({ historyDays: 6, tomorrow: ph(11_000) })).toBeNull();
    expect(rec({ historyDays: 7, tomorrow: ph(11_000) })).not.toBeNull();
    expect(rec({ tomorrow: null })).toBeNull();
    expect(rec({ tomorrow: ph(11_000), tariff: null })).toBeNull();
    // 2026-07-17 is a Friday; tomorrow (Saturday) is PARTIAL_PEAK in summer, not "peak".
    expect(
      rec({ tomorrow: ph(11_000), tariff: sce, updatedMs: Date.parse("2026-07-17T19:30:00Z") }),
    ).toBeNull();
  });

  it("confidence: low under 3 similar days, medium from 3", () => {
    expect(rec({ tomorrow: ph(11_000, { similarTempDays: 2 }) })?.confidence).toBe("low");
    expect(
      rec({ tomorrow: ph(11_000, { similarTempDays: 3, similarTempAvgWh: 12_000 }) })?.confidence,
    ).toBe("medium");
  });

  it("why lines in deg F (converted, then rounded) with a similar-temperature average", () => {
    const r = rec({
      historyDays: 30,
      tomorrow: ph(11_200, { highC: 35, similarTempDays: 8, similarTempAvgWh: 15_400 }),
    })!;
    expect(r.why).toEqual([
      "Usual peak use: 11.2 kWh over 30 days",
      "On days near 95°F: 15.4 kWh over 8 days",
      "Tomorrow's forecast high: 95°F",
    ]);
    expect(r.wouldChange).toBe("A different forecast high for tomorrow, or a tariff change.");
  });

  it("why lines when there are too few similar days", () => {
    const r = rec({ tomorrow: ph(11_200, { highC: 35, similarTempDays: 2 }) })!;
    expect(r.why).toEqual([
      "Usual peak use: 11.2 kWh over 30 days",
      "Not enough days near 95°F yet (2 so far)",
      "Tomorrow's forecast high: 95°F",
    ]);
  });

  it("deg C is rounded; deg F converts before rounding (34.6 C = 94 F, not 95)", () => {
    const t = ph(11_000, { highC: 34.6, similarTempDays: 3, similarTempAvgWh: 11_000 });
    expect(rec({ temperatureUnit: "C", tomorrow: t })?.why).toEqual([
      "Usual peak use: 11.0 kWh over 30 days",
      "On days near 35°C: 11.0 kWh over 3 days",
      "Tomorrow's forecast high: 35°C",
    ]);
    expect(rec({ temperatureUnit: "F", tomorrow: t })?.why[2]).toBe(
      "Tomorrow's forecast high: 94°F",
    );
  });

  it("validFrom is the end of today's peak window (21:00 local) while it is still ahead", () => {
    const r = rec({ tomorrow: ph(11_000) })!;
    expect(r.validFrom).toBe("2026-05-21T04:00:00.000Z"); // 21:00 PDT on 5/20
    expect(r.validTo).toBe("2026-05-22T04:00:00.000Z"); // 21:00 PDT on 5/21
  });

  it("validFrom is updatedAt once today's window has ended", () => {
    const updatedMs = Date.parse("2026-05-21T05:30:00Z"); // 22:30 PDT on 5/20
    const r = rec({ tomorrow: ph(11_000), updatedMs })!;
    expect(r.validFrom).toBe(new Date(updatedMs).toISOString());
  });

  it("validFrom is updatedAt when today has no peak window (summer Sunday, Monday ON_PEAK)", () => {
    const updatedMs = Date.parse("2026-07-19T19:30:00Z"); // Sunday
    const r = rec({ tomorrow: ph(11_000), tariff: sce, updatedMs })!;
    expect(r.validFrom).toBe(new Date(updatedMs).toISOString());
    expect(r.validTo).toBe("2026-07-21T04:00:00.000Z"); // Monday 21:00 PDT
    // SCE summer: ON_PEAK 58.972, lowest off-peak 36.829 cents/kWh
    expect(r.savingsCents).toBe(Math.round((r.effectWh * (58.972 - 36.829)) / 1000));
  });

  it("validTo is local 21:00 across DST (tomorrow 2026-03-09 and 2026-11-02)", () => {
    const spring = rec({ tomorrow: ph(11_000), updatedMs: Date.parse("2026-03-08T20:00:00Z") })!;
    expect(spring.validFrom).toBe("2026-03-09T04:00:00.000Z"); // 21:00 PDT
    expect(spring.validTo).toBe("2026-03-10T04:00:00.000Z");
    const fall = rec({ tomorrow: ph(11_000), updatedMs: Date.parse("2026-11-01T20:00:00Z") })!;
    expect(fall.validFrom).toBe("2026-11-02T05:00:00.000Z"); // 21:00 PST
    expect(fall.validTo).toBe("2026-11-03T05:00:00.000Z");
  });

  it("savings are never negative (off-peak dearer than peak) and 0 without off-peak hours", () => {
    const inverted = rec({ tomorrow: ph(11_000), tariff: flat(0.2, 0.3) })!;
    expect(inverted.savingsCents).toBe(0);
    expect(inverted.effectWh).toBe(11_000);
    // ON_PEAK all day: no off-peak hour, so the off-peak rate falls back to the peak rate.
    const allPeak = parseTariff({
      seasons: {
        Winter: {
          fromMonth: 1,
          fromDay: 1,
          toMonth: 12,
          toDay: 31,
          tou_periods: { ON_PEAK: [win(0, 0)] },
        },
      },
      energy_charges: { Winter: { ON_PEAK: 0.48 } },
    })!;
    const r = rec({ tomorrow: ph(11_000), tariff: allPeak })!;
    expect(r.savingsCents).toBe(0);
  });
});

describe("peakWindow", () => {
  it("SCE winter weekday: 16:00-21:00 local", () => {
    const w = peakWindow(sce, "2026-05-20", TZ)!;
    expect(w.fromMin).toBe(960);
    expect(w.toMin).toBe(1260);
    expect(w.startMs).toBe(localMidnight("2026-05-21", TZ) - 8 * HOUR);
    expect(w.endMs).toBe(localMidnight("2026-05-21", TZ) - 3 * HOUR);
  });

  it("DST days keep the 960/1260 wall-clock minutes and the right UTC instants", () => {
    for (const d of ["2026-03-08", "2026-11-01"]) {
      const w = peakWindow(sce, d, TZ)!;
      const next = localMidnight(addDays(d, 1), TZ);
      expect([w.fromMin, w.toMin]).toEqual([960, 1260]);
      expect([w.startMs, w.endMs]).toEqual([next - 8 * HOUR, next - 3 * HOUR]);
    }
  });

  it("summer weekend has no ON_PEAK: null; summer weekday has one", () => {
    expect(peakWindow(sce, "2026-07-18", TZ)).toBeNull(); // Saturday
    expect(peakWindow(sce, "2026-07-19", TZ)).toBeNull(); // Sunday
    expect(peakWindow(sce, "2026-07-20", TZ)).not.toBeNull(); // Monday
  });

  it("a window that runs to midnight ends at toMin 1440 = next local midnight", () => {
    const late = parseTariff({
      seasons: {
        Winter: {
          fromMonth: 1,
          fromDay: 1,
          toMonth: 12,
          toDay: 31,
          tou_periods: { ON_PEAK: [win(18, 0)], OFF_PEAK: [win(0, 18)] },
        },
      },
      energy_charges: { Winter: { ON_PEAK: 0.5, OFF_PEAK: 0.2 } },
    })!;
    const w = peakWindow(late, "2026-05-20", TZ)!;
    expect(w.fromMin).toBe(1080);
    expect(w.toMin).toBe(1440);
    expect(w.endMs).toBe(localMidnight("2026-05-21", TZ));
  });

  it("no tariff: null", () => {
    expect(peakWindow(null, "2026-05-20", TZ)).toBeNull();
  });
});

describe("dayHighC", () => {
  const mid = localMidnight("2026-05-20", TZ);
  const at = (h: number, tempC: number) => ({ hour: mid + h * HOUR, tempC });

  it("takes the max over the day", () => {
    expect(dayHighC("2026-05-20", TZ, [at(3, 12), at(14, 28)], [at(20, 20)])).toBe(28);
  });

  it("prefers the observed temp over the forecast for the same hour", () => {
    expect(dayHighC("2026-05-20", TZ, [at(10, 15)], [at(10, 40), at(20, 20)])).toBe(20);
  });

  it("falls back to the forecast for hours without an observed temp", () => {
    expect(dayHighC("2026-05-20", TZ, [at(10, 15)], [at(13, 33)])).toBe(33);
  });

  it("ignores hours outside the local day", () => {
    const rows = [{ hour: mid - HOUR, tempC: 50 }, { hour: mid + 24 * HOUR, tempC: 50 }, at(5, 10)];
    expect(dayHighC("2026-05-20", TZ, rows, rows)).toBe(10);
  });

  it("is null when no hour has a temperature", () => {
    expect(dayHighC("2026-05-20", TZ, [], [])).toBeNull();
    expect(dayHighC("2026-05-20", TZ, [{ hour: mid - HOUR, tempC: 20 }], [])).toBeNull();
  });
});
