import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sampleDashboard as d } from "./data";

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
      expect(Math.abs(l.solarW + l.batteryW + l.gridW - l.loadW)).toBeLessThanOrEqual(50);
    });
    it("uses integer watts and the sign rules", () => {
      for (const v of [l.solarW, l.loadW, l.batteryW, l.gridW, l.usableCapacityWh]) {
        expect(Number.isInteger(v)).toBe(true);
      }
      expect(l.solarW).toBeGreaterThan(0); // solar producing
      expect(l.loadW).toBeGreaterThanOrEqual(0);
      expect(l.batteryW).toBeLessThan(0); // charging
      expect(l.gridW).toBeLessThan(0); // exporting
    });
    it("has socPct in 0..100", () => {
      expect(l.socPct).toBeGreaterThanOrEqual(0);
      expect(l.socPct).toBeLessThanOrEqual(100);
    });
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
        expect(Date.parse(t[i]!.hour) - Date.parse(t[i - 1]!.hour)).toBe(3_600_000);
      }
    });
    it("has all actuals before all forecasts, at least one of each", () => {
      const kinds = t.map((r) => r.kind);
      expect(kinds).toContain("actual");
      expect(kinds).toContain("forecast");
      expect(kinds.lastIndexOf("actual")).toBeLessThan(kinds.indexOf("forecast"));
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
    expect(d.accuracy.find((a) => a.model === "load-v1")?.baseline).toBe("seasonal-naive");
    expect(d.accuracy.find((a) => a.model === "solar-v1")?.baseline).toBe("yesterday");
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
    for (const k of ["solarWh", "loadWh", "gridImportWh", "gridExportWh", "batteryChargeWh", "batteryDischargeWh"] as const) {
      expect(Number.isInteger(d.today[k])).toBe(true);
    }
  });

  it("has parseable ISO times", () => {
    const times = [
      d.updatedAt,
      d.tariffNow.endsAt,
      d.health.lastPollAt,
      ...d.timeline.map((r) => r.hour),
      ...(d.recommendation ? [d.recommendation.validFrom, d.recommendation.validTo] : []),
    ];
    for (const x of times) expect(isIso(x)).toBe(true);
  });

  describe("consistency with the timeline", () => {
    const actuals = d.timeline.filter((r) => r.kind === "actual");
    const last = actuals[actuals.length - 1]!;
    const first = d.timeline[0]!;
    const sum = (k: "solarWh" | "loadWh") => actuals.reduce((a, r) => a + r[k], 0);
    const cap = d.live.usableCapacityWh;

    it("tariffNow.period matches the last actual row", () => {
      expect(d.tariffNow.period).toBe(last.period);
    });
    it("today.solarWh and loadWh are within 10% of the actual rows", () => {
      expect(Math.abs(d.today.solarWh - sum("solarWh"))).toBeLessThanOrEqual(0.1 * sum("solarWh"));
      expect(Math.abs(d.today.loadWh - sum("loadWh"))).toBeLessThanOrEqual(0.1 * sum("loadWh"));
    });
    it("live socPct is within 3 of the last actual row", () => {
      expect(Math.abs(d.live.socPct - last.socPct)).toBeLessThanOrEqual(3);
    });
    it("live solarW is within 30% of the last actual row's solarWh", () => {
      expect(Math.abs(d.live.solarW - last.solarWh)).toBeLessThanOrEqual(0.3 * last.solarWh);
    });
    it("battery charge - discharge matches the SoC change since midnight", () => {
      const expected = ((d.live.socPct - first.socPct) / 100) * cap;
      const net = d.today.batteryChargeWh - d.today.batteryDischargeWh;
      expect(Math.abs(net - expected)).toBeLessThanOrEqual(0.1 * cap);
    });
  });

  it("source files have no UTF-8 BOM", () => {
    for (const f of ["./data.ts", "../../../lib/format.ts"]) {
      expect(readFileSync(new URL(f, import.meta.url))[0]).not.toBe(0xef);
    }
  });
});
