import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkSnapshot,
  peakEstimateWh,
  reservePlan,
  toDashboardView,
} from "../../../lib/dashboard";
import { sampleSnapshot } from "./data";

const d = toDashboardView(sampleSnapshot);

const isIso = (x: string) => !isNaN(Date.parse(x));

describe("sampleDashboard", () => {
  it("has the documented top-level facts", () => {
    expect(d.source).toBe("fleet-api");
    expect(d.currency).toBe("USD");
    expect(d.site.timezone).toBe("America/Los_Angeles");
    expect(d.live.usableCapacityWh).toBe(13500);
  });

  describe("live", () => {
    const l = d.live;
    it("satisfies the power balance within 50 W", () => {
      expect(
        Math.abs(l.solarW + l.batteryW + l.gridW - l.loadW),
      ).toBeLessThanOrEqual(50);
    });
    it("uses integer watts and the sign rules", () => {
      for (const v of [
        l.solarW,
        l.loadW,
        l.batteryW,
        l.gridW,
        l.usableCapacityWh,
      ]) {
        expect(Number.isInteger(v)).toBe(true);
      }
      expect(l.solarW).toBeGreaterThan(0); // solar producing
      expect(l.loadW).toBeGreaterThanOrEqual(0);
    });
    it("has socPct in 0..100", () => {
      expect(l.socPct).toBeGreaterThanOrEqual(0);
      expect(l.socPct).toBeLessThanOrEqual(100);
    });
  });

  it("updatedAt is 17:00 PDT with 17 actual rows", () => {
    expect(d.updatedAt).toBe("2026-07-16T00:00:00Z");
    expect(d.timeline.filter((r) => r.kind === "actual")).toHaveLength(17);
  });

  it("has tariffNow peak in integer cents", () => {
    expect(d.tariffNow.period).toBe("peak");
    expect(d.tariffNow.endsAt).toBe("2026-07-16T04:00:00Z");
    expect(Number.isInteger(d.tariffNow.importCentsPerKwh)).toBe(true);
    expect(Number.isInteger(d.tariffNow.exportCentsPerKwh)).toBe(true);
  });

  describe("timeline", () => {
    const t = d.timeline;
    it("has 48 rows exactly 1 h apart", () => {
      expect(t).toHaveLength(48);
      for (let i = 1; i < t.length; i++) {
        expect(Date.parse(t[i]!.hour) - Date.parse(t[i - 1]!.hour)).toBe(
          3_600_000,
        );
      }
    });
    it("has all actuals before all forecasts, at least one of each", () => {
      const kinds = t.map((r) => r.kind);
      expect(kinds).toContain("actual");
      expect(kinds).toContain("forecast");
      expect(kinds.lastIndexOf("actual")).toBeLessThan(
        kinds.indexOf("forecast"),
      );
    });
    it("has p10 <= value <= p90 on forecast rows and no bands on actuals", () => {
      for (const r of t) {
        if (r.kind === "forecast") {
          expect(r.loadP10Wh).toBeDefined();
          expect(r.loadP90Wh).toBeDefined();
          expect(r.solarP10Wh).toBeDefined();
          expect(r.solarP90Wh).toBeDefined();
          expect(r.loadP10Wh!).toBeLessThanOrEqual(r.loadWh);
          expect(r.loadWh).toBeLessThanOrEqual(r.loadP90Wh!);
          expect(r.solarP10Wh!).toBeLessThanOrEqual(r.solarWh);
          expect(r.solarWh).toBeLessThanOrEqual(r.solarP90Wh!);
        } else {
          expect(r.loadP10Wh).toBeUndefined();
          expect(r.loadP90Wh).toBeUndefined();
          expect(r.solarP10Wh).toBeUndefined();
          expect(r.solarP90Wh).toBeUndefined();
        }
      }
    });
    it("has integer Wh and socPct in 0..100", () => {
      for (const r of t) {
        expect(Number.isInteger(r.loadWh)).toBe(true);
        expect(Number.isInteger(r.solarWh)).toBe(true);
        expect(r.socPct).toBeGreaterThanOrEqual(0);
        expect(r.socPct).toBeLessThanOrEqual(100);
      }
    });
  });

  it("costToday.netCents = sum(costCents) - exportCreditCents, in integer cents", () => {
    const sum = d.costToday.periods.reduce((a, p) => a + p.costCents, 0);
    expect(d.costToday.netCents).toBe(sum - d.costToday.exportCreditCents);
    for (const p of d.costToday.periods) {
      expect(Number.isInteger(p.costCents)).toBe(true);
      expect(Number.isInteger(p.importWh)).toBe(true);
    }
    expect(Number.isInteger(d.costToday.exportCreditCents)).toBe(true);
  });

  it("last7Days has 7 ascending YYYY-MM-DD dates", () => {
    expect(d.last7Days).toHaveLength(7);
    const dates = d.last7Days.map((x) => x.date);
    for (const s of dates) expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(7);
  });

  it("accuracy covers load and solar, each beating its baseline", () => {
    for (const target of ["load", "solar"] as const) {
      const rows = d.accuracy.filter((a) => a.target === target);
      expect(rows.length).toBeGreaterThan(0);
      for (const a of rows) expect(a.maePct).toBeLessThan(a.baselineMaePct);
    }
    expect(d.accuracy.find((a) => a.model === "load-v1")?.baseline).toBe(
      "seasonal-naive",
    );
    expect(d.accuracy.find((a) => a.model === "solar-v1")?.baseline).toBe(
      "yesterday",
    );
  });

  it("has a recommendation with 1-3 why items", () => {
    expect(d.recommendation).not.toBeNull();
    const n = d.recommendation!.why.length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
    expect(Number.isInteger(d.recommendation!.effectWh)).toBe(true);
    expect(Number.isInteger(d.recommendation!.savingsCents)).toBe(true);
  });

  it("has selfPoweredPct in 0..100 and integer Wh totals", () => {
    expect(d.today.selfPoweredPct).toBeGreaterThanOrEqual(0);
    expect(d.today.selfPoweredPct).toBeLessThanOrEqual(100);
    for (const k of [
      "solarWh",
      "loadWh",
      "gridImportWh",
      "gridExportWh",
      "batteryChargeWh",
      "batteryDischargeWh",
    ] as const) {
      expect(Number.isInteger(d.today[k])).toBe(true);
    }
  });

  it("has parseable ISO times", () => {
    const times = [
      d.updatedAt,
      d.tariffNow.endsAt,
      d.health.lastPollAt,
      ...d.timeline.map((r) => r.hour),
      ...(d.recommendation
        ? [d.recommendation.validFrom, d.recommendation.validTo]
        : []),
    ];
    for (const x of times) expect(isIso(x)).toBe(true);
  });

  it("the reserve window ends when tomorrow's peak starts (4:00 PM PDT)", () => {
    expect(d.recommendation!.validTo).toBe("2026-07-16T23:00:00Z");
  });

  describe("consistency with the timeline", () => {
    const actuals = d.timeline.filter((r) => r.kind === "actual");
    const last = actuals[actuals.length - 1]!;
    const first = d.timeline[0]!;
    const sum = (k: "solarWh" | "loadWh") =>
      actuals.reduce((a, r) => a + r[k], 0);
    const cap = d.live.usableCapacityWh;

    it("tariffNow.period matches the last actual row", () => {
      expect(d.tariffNow.period).toBe(last.period);
    });
    it("today.solarWh and loadWh are within 10% of the actual rows", () => {
      expect(Math.abs(d.today.solarWh - sum("solarWh"))).toBeLessThanOrEqual(
        0.1 * sum("solarWh"),
      );
      expect(Math.abs(d.today.loadWh - sum("loadWh"))).toBeLessThanOrEqual(
        0.1 * sum("loadWh"),
      );
    });
    it("live solarW is within 30% of the last actual row's solarWh", () => {
      expect(Math.abs(d.live.solarW - last.solarWh)).toBeLessThanOrEqual(
        0.3 * last.solarWh,
      );
    });
    it("battery charge - discharge matches the SoC change since midnight", () => {
      const expected = ((d.live.socPct - first.socPct) / 100) * cap;
      const net = d.today.batteryChargeWh - d.today.batteryDischargeWh;
      expect(Math.abs(net - expected)).toBeLessThanOrEqual(0.1 * cap);
    });
  });

  it("sampleSnapshot passes checkSnapshot", () => {
    expect(checkSnapshot(sampleSnapshot)).toEqual([]);
  });

  describe("visible sample values", () => {
    const actuals = d.timeline.filter((r) => r.kind === "actual");
    it("battery discharged overnight", () => {
      expect(d.today.batteryDischargeWh).toBeGreaterThan(0);
    });
    it("peak import rate is 48 c/kWh and last7Days ends today", () => {
      expect(d.tariffNow.importCentsPerKwh).toBe(48);
      const lastDay = d.last7Days[d.last7Days.length - 1]!;
      expect(lastDay).toEqual({
        date: "2026-07-15",
        solarWh: d.today.solarWh,
        loadWh: d.today.loadWh,
      });
    });
    it("every socPct is within 20..100", () => {
      for (const r of d.timeline) {
        expect(r.socPct).toBeGreaterThanOrEqual(20);
        expect(r.socPct).toBeLessThanOrEqual(100);
      }
    });
    it("tomorrow is cloudy: day-2 solar <= 70% of day 1", () => {
      const s = (rows: typeof d.timeline) =>
        rows.reduce((a, r) => a + r.solarWh, 0);
      expect(s(d.timeline.slice(24))).toBeLessThanOrEqual(
        0.7 * s(d.timeline.slice(0, 24)),
      );
    });
    it("last7Days: prior 6 days are full July days and today is not the biggest", () => {
      const prior = d.last7Days.slice(0, 6);
      for (const p of prior) {
        expect(p.solarWh).toBeGreaterThanOrEqual(44000);
        expect(p.solarWh).toBeLessThanOrEqual(48000);
        expect(p.loadWh).toBeGreaterThanOrEqual(24000);
        expect(p.loadWh).toBeLessThanOrEqual(27000);
      }
      expect(d.today.solarWh).toBeLessThanOrEqual(
        Math.max(...prior.map((p) => p.solarWh)),
      );
      expect(actuals).toHaveLength(17);
    });
  });
  it("source files have no UTF-8 BOM", () => {
    for (const f of ["./data.ts", "../../../lib/format.ts"]) {
      expect(readFileSync(new URL(f, import.meta.url))[0]).not.toBe(0xef);
    }
  });
});

describe("weather contract", () => {
  it("uses Fahrenheit in the sample", () => {
    expect(d.site.temperatureUnit).toBe("F");
  });
  it("has the documented weatherTomorrow sample", () => {
    expect(d.weatherTomorrow).toMatchObject({
      date: "2026-07-16",
      condition: "cloudy",
      highC: 24,
      lowC: 16,
      cloudCoverPct: 80,
      precipitationChancePct: 20,
    });
  });
  it("dates weatherTomorrow as the site-local date of timeline row 24", () => {
    const row = d.timeline[24];
    if (!row) throw new Error("row 24 missing");
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: d.site.timezone,
    }).format(new Date(row.hour));
    expect(d.weatherTomorrow?.date).toBe(local);
  });
});

describe("peak estimate sample (Rev 6)", () => {
  const p = sampleSnapshot.peakEstimate;
  it("has 30 history days and the documented days", () => {
    expect(p.historyDays).toBe(30);
    expect(p.today).toEqual({
      historyAvgWh: 10200,
      highC: 33,
      similarTempDays: 8,
      similarTempAvgWh: 11600,
    });
    expect(p.tomorrow).toEqual({
      historyAvgWh: 10200,
      highC: 24,
      similarTempDays: 6,
      similarTempAvgWh: 8400,
    });
    expect(peakEstimateWh(p.today!)).toBe(10900);
    expect(peakEstimateWh(p.tomorrow!)).toBe(9300);
  });
  it("tomorrow's high matches the weather tile", () => {
    expect(p.tomorrow?.highC).toBe(sampleSnapshot.weatherTomorrow?.highC);
  });
  it("recommends raising the reserve to 89%", () => {
    const r = sampleSnapshot.recommendation!;
    expect(r.action).toBe("Raise backup reserve to 89%");
    expect(r.reserve).toEqual(reservePlan(9300, 13500));
    expect(r.reserve).toMatchObject({ extraPct: 69, targetPct: 89 });
    expect(r.savingsCents).toBe(167);
    expect(r.effectWh).toBe(9300);
  });
  it("says about 9.3 kWh in the why list, not 11", () => {
    const why = sampleSnapshot.recommendation!.why.join(" ");
    expect(why).toContain("about 9.3 kWh");
    expect(why).not.toContain("11 kWh");
  });
});

describe("system and equipment health sample (Rev 8)", () => {
  it("has the documented system", () => {
    expect(sampleSnapshot.system).toEqual({
      batteries: {
        count: 2,
        model: "Powerwall 3",
        capacityWh: 27000,
        maxPowerW: 11520,
        backupReservePct: 20,
      },
      solar: {
        panelCount: 24,
        panelWatts: 400,
        bestHourWh: 7900,
        bestHourAt: "2026-06-21T19:00:00Z",
      },
      plan: { utility: "Southern California Edison", name: "TOU-D 4-9 PM" },
      firmware: "26.26.11",
      installedOn: "2024-03-14",
      changes: [
        { at: "2026-09-25T04:31:00Z", text: "Firmware 26.26.11" },
        { at: "2026-07-04T22:10:00Z", text: "Grid outage, 2 h 10 min" },
      ],
    });
  });
  it("has the documented equipment health, all OK", () => {
    expect(sampleSnapshot.equipmentHealth).toEqual({
      solarClearDay: {
        month: "2026-06",
        baselineMonth: "2025-06",
        pctOfBaseline: 98,
        clearHours: 41,
      },
      sunnyDayMiss: null,
      batteryCapacity: { month: "2026-06", estimatedWh: 26100, swings: 18 },
      efficiency: { month: "2026-06", pct: 88 },
      backfill: { state: "done", daysDone: 730, daysTotal: 730 },
    });
  });
});
