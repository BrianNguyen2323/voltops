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

  describe("totals derived per actual row (round 2)", () => {
    const actuals = d.timeline.filter((r) => r.kind === "actual");
    const cap = d.live.usableCapacityWh;
    const RATE = { "off-peak": 30, "mid-peak": 38, peak: 48 } as const;
    const rows = actuals.map((r, i) => {
      const next = d.timeline[i + 1]!.socPct;
      const batteryWh = Math.round(((r.socPct - next) / 100) * cap); // > 0 discharge
      return {
        period: r.period,
        batteryWh,
        gridWh: r.loadWh - r.solarWh - batteryWh,
      };
    });
    const total = (f: (x: (typeof rows)[number]) => number) =>
      rows.reduce((a, r) => a + f(r), 0);
    const near = (actual: number, expected: number) =>
      expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
        Math.max(100, 0.03 * Math.abs(expected)),
      );
    const imp = total((r) => Math.max(r.gridWh, 0));
    const exp = total((r) => Math.max(-r.gridWh, 0));
    const loadSum = actuals.reduce((a, r) => a + r.loadWh, 0);

    it("grid import/export and battery charge/discharge match the per-row model", () => {
      near(d.today.gridImportWh, imp);
      near(d.today.gridExportWh, exp);
      near(
        d.today.batteryChargeWh,
        total((r) => Math.max(-r.batteryWh, 0)),
      );
      near(
        d.today.batteryDischargeWh,
        total((r) => Math.max(r.batteryWh, 0)),
      );
    });
    it("battery discharged overnight", () => {
      expect(d.today.batteryDischargeWh).toBeGreaterThan(0);
    });
    it("selfPoweredPct follows the formula", () => {
      expect(
        Math.abs(
          d.today.selfPoweredPct - Math.round(100 * (1 - imp / loadSum)),
        ),
      ).toBeLessThanOrEqual(1);
    });
    it("period import sums to today.gridImportWh and matches per-period derivation", () => {
      expect(d.costToday.periods.reduce((a, p) => a + p.importWh, 0)).toBe(
        d.today.gridImportWh,
      );
      for (const period of new Set(actuals.map((r) => r.period))) {
        const p = d.costToday.periods.find((x) => x.period === period);
        expect(p, `period ${period} listed`).toBeDefined();
        const expected = rows
          .filter((r) => r.period === period)
          .reduce((a, r) => a + Math.max(r.gridWh, 0), 0);
        expect(Math.abs(p!.importWh - expected)).toBeLessThanOrEqual(100);
      }
    });
    it("costs use the constant rates and the export credit follows gridExportWh", () => {
      expect(d.tariffNow.importCentsPerKwh).toBe(RATE.peak);
      for (const p of d.costToday.periods) {
        expect(
          Math.abs(
            p.costCents - Math.round((p.importWh * RATE[p.period]) / 1000),
          ),
        ).toBeLessThanOrEqual(1);
      }
      const credit =
        (d.today.gridExportWh * d.tariffNow.exportCentsPerKwh) / 1000;
      expect(
        Math.abs(d.costToday.exportCreditCents - credit),
      ).toBeLessThanOrEqual(1);
    });
    it("last7Days ends at 2026-07-15 and equals today", () => {
      const lastDay = d.last7Days[d.last7Days.length - 1]!;
      expect(lastDay.date).toBe("2026-07-15");
      expect(lastDay.solarWh).toBe(d.today.solarWh);
      expect(lastDay.loadWh).toBe(d.today.loadWh);
    });
  });

  describe("battery dispatch over all 48 rows (round 3)", () => {
    const t = d.timeline;
    const cap = d.live.usableCapacityWh;
    const derived = t.slice(0, 47).map((r, i) => {
      const battery = Math.round(((r.socPct - t[i + 1]!.socPct) / 100) * cap); // > 0 discharge
      return {
        r,
        next: t[i + 1]!.socPct,
        battery,
        grid: r.loadWh - r.solarWh - battery,
      };
    });
    it("every socPct is within 20..100", () => {
      for (const r of t) {
        expect(r.socPct).toBeGreaterThanOrEqual(20);
        expect(r.socPct).toBeLessThanOrEqual(100);
      }
    });
    it("surplus rows never import or discharge", () => {
      for (const x of derived.filter((x) => x.r.solarWh > x.r.loadWh)) {
        expect(x.grid, x.r.hour).toBeLessThanOrEqual(150);
        expect(x.battery, x.r.hour).toBeLessThanOrEqual(150);
      }
    });
    it("deficit rows with battery above reserve do not import", () => {
      for (const x of derived.filter(
        (x) => x.r.solarWh <= x.r.loadWh && x.next >= 22,
      )) {
        expect(x.grid, x.r.hour).toBeLessThanOrEqual(150);
      }
    });
    it("exporting surplus rows have a full or rate-limited battery", () => {
      for (const x of derived.filter((x) => -x.grid > 150)) {
        expect(x.next >= 99 || -x.battery >= 4850, x.r.hour).toBe(true);
      }
    });
    it("live battery/grid signs match the last actual row", () => {
      const k = t.filter((r) => r.kind === "actual").length - 1;
      const x = derived[k]!;
      const sign = (v: number) => Math.sign(v);
      if (Math.abs(x.battery) < 150 && Math.abs(x.grid) < 150) return;
      expect(sign(d.live.batteryW)).toBe(sign(x.battery));
      expect(sign(d.live.gridW)).toBe(sign(x.grid));
    });
    it("tomorrow is cloudy: day-2 solar <= 70% of day 1", () => {
      const s = (rows: typeof t) => rows.reduce((a, r) => a + r.solarWh, 0);
      expect(s(t.slice(24))).toBeLessThanOrEqual(0.7 * s(t.slice(0, 24)));
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
