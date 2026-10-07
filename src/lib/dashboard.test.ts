import { describe, expect, it } from "vitest";
import { sampleSnapshot } from "../app/(protected)/home/data";
import {
  checkSnapshot,
  peakEstimateWh,
  reservePlan,
  toDashboardView,
  type DashboardSnapshot,
} from "./dashboard";

const HOUR = 3_600_000;
const TZ = "America/Los_Angeles";

// --- synthetic snapshot builder -------------------------------------------

const localDate = (ms: number, tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));

const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** First UTC instant whose site-local date is `date` (= local midnight). */
const midnight = (date: string, tz: string) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  let t = Date.UTC(y, m - 1, d) - 14 * HOUR;
  while (localDate(t, tz) !== date) t += HOUR;
  return t;
};

/**
 * Valid snapshot for `today` in `tz`: whole today + tomorrow, actual until
 * midnight + 12 h (UTC), flat 500 Wh solar per hour. Satisfies every rule so
 * only what a test changes differs.
 */
function build(today: string, tz = TZ, actualLoadWh = 800): DashboardSnapshot {
  const start = midnight(today, tz);
  const end = midnight(addDays(today, 2), tz);
  const updatedMs = start + 12 * HOUR;
  const timeline: DashboardSnapshot["timeline"] = [];
  for (let t = start; t < end; t += HOUR) {
    const hour = new Date(t).toISOString();
    timeline.push(
      t < updatedMs
        ? {
            hour,
            kind: "actual",
            loadWh: actualLoadWh,
            solarWh: 500,
            socPct: 50,
            period: "off-peak",
            gridImportWh: actualLoadWh - 500,
            gridExportWh: 0,
            batteryChargeWh: 0,
            batteryDischargeWh: 0,
          }
        : {
            hour,
            kind: "forecast",
            loadWh: 1000,
            solarWh: 500,
            socPct: 50,
            period: "off-peak",
            loadP10Wh: 900,
            loadP90Wh: 1100,
            solarP10Wh: 400,
            solarP90Wh: 600,
          },
    );
  }
  const importWh = (actualLoadWh - 500) * 12;
  const iso = new Date(updatedMs).toISOString();
  return {
    site: { name: "Home", timezone: tz, temperatureUnit: "F" },
    source: "replay",
    updatedAt: iso,
    currency: "USD",
    live: {
      solarW: 500,
      loadW: actualLoadWh,
      batteryW: 0,
      gridW: actualLoadWh - 500,
      socPct: 50,
      usableCapacityWh: 13500,
      gridStatus: "connected",
    },
    tariffNow: {
      period: "off-peak",
      importCentsPerKwh: 30,
      exportCentsPerKwh: 8,
      endsAt: iso,
    },
    recommendation: null,
    timeline,
    costToday: {
      periods: [{ period: "off-peak", importWh, costCents: 0 }],
      exportCreditCents: 0,
      netCents: 0,
    },
    previousDays: [6, 5, 4, 3, 2, 1].map((n) => ({
      date: addDays(today, -n),
      solarWh: 6000,
      loadWh: 9000,
    })),
    accuracy: [],
    health: { lastPollAt: iso, estRequestsPerMonth: 8640, warnings: [] },
    weatherTomorrow: {
      date: addDays(today, 1),
      condition: "clear",
      highC: 20,
      lowC: 10,
      cloudCoverPct: 10,
      precipitationChancePct: 0,
    },
  };
}

/** Clone `base`, apply `mut`, return the check messages. */
const problems = (
  mut: (s: DashboardSnapshot) => void,
  base: DashboardSnapshot = sampleSnapshot,
) => {
  const s = structuredClone(base);
  mut(s);
  return checkSnapshot(s);
};

const row = (s: DashboardSnapshot, i: number) => {
  const r = s.timeline[i];
  if (!r) throw new Error(`no timeline row ${i}`);
  return r;
};

/** Messages produced by `mut`, asserted to include one containing `part`. */
const has = (
  mut: (s: DashboardSnapshot) => void,
  part: string,
  base?: DashboardSnapshot,
) => expect(problems(mut, base)).toContainEqual(expect.stringContaining(part));

const period0 = (s: DashboardSnapshot) => {
  const p = s.costToday.periods[0];
  if (!p) throw new Error("no period");
  return p;
};

// --- checkSnapshot ---------------------------------------------------------

describe("checkSnapshot", () => {
  it("accepts the sample snapshot", () => {
    expect(checkSnapshot(sampleSnapshot)).toEqual([]);
  });

  it("neither mutates nor throws", () => {
    const s = structuredClone(sampleSnapshot);
    s.updatedAt = "garbage";
    const before = structuredClone(s);
    expect(() => checkSnapshot(s)).not.toThrow();
    expect(s).toEqual(before);
  });

  it("an invalid timezone yields one message and skips timezone rules", () => {
    const s = structuredClone(sampleSnapshot);
    s.site.timezone = "Nope/Zone";
    let out: string[] = [];
    expect(() => (out = checkSnapshot(s))).not.toThrow();
    expect(out).toEqual(["site.timezone is not a valid IANA timezone"]);
  });

  it("an unparseable updatedAt yields only its ISO message", () => {
    expect(problems((s) => (s.updatedAt = "nope"))).toEqual([
      "updatedAt is not a valid ISO date",
    ]);
  });

  describe("rule 1: live", () => {
    it.each([
      [
        "negative solarW",
        (s: DashboardSnapshot) => (s.live.solarW = -1),
        "live.solarW must be >= 0",
      ],
      [
        "negative loadW",
        (s: DashboardSnapshot) => (s.live.loadW = -5),
        "live.loadW must be >= 0",
      ],
      [
        "non-integer W",
        (s: DashboardSnapshot) => (s.live.loadW += 0.5),
        "live.loadW must be an integer",
      ],
      [
        "unbalanced flows",
        (s: DashboardSnapshot) => (s.live.gridW += 100),
        "live flows do not balance",
      ],
      [
        "socPct above 100",
        (s: DashboardSnapshot) => (s.live.socPct = 101),
        "live.socPct must be 0-100",
      ],
      [
        "socPct below 0",
        (s: DashboardSnapshot) => (s.live.socPct = -1),
        "live.socPct must be 0-100",
      ],
    ])("reports %s", (_n, mut, part) => has(mut, part));
    it("tolerates a 50 W imbalance", () => {
      expect(problems((s) => (s.live.gridW += 50))).toEqual([]);
    });
  });

  describe("rule 2: timeline", () => {
    it("reports a dropped hour", () => {
      has((s) => s.timeline.splice(20, 1), "is not 1 h after the previous");
    });
    it("reports hours not 1 h apart", () =>
      has((s) => {
        const r = row(s, 10);
        r.hour = new Date(Date.parse(r.hour) + 30 * 60_000).toISOString();
      }, "is not 1 h after the previous"));
    it("reports a timeline starting at 06:00 local instead of midnight", () => {
      const cut = (s: DashboardSnapshot) => (s.timeline = s.timeline.slice(6));
      has(cut, "does not start at local midnight");
      has(cut, "does not start at local midnight", build("2026-07-15"));
    });
    it("reports tomorrow not fully covered", () => {
      has(
        (s) => (s.timeline = s.timeline.slice(0, -1)),
        "does not end at local midnight",
      );
    });
    it("reports an actual hour after a forecast hour (clean swap, only this rule)", () => {
      const s = structuredClone(sampleSnapshot);
      // Swap the contents of the last actual (16) and first forecast (17) rows,
      // keep each hour, move updatedAt past row 17 and keep cost consistent.
      const a = row(s, 16);
      const f = row(s, 17);
      const { hour: ha, ...ca } = a;
      const { hour: hf, ...cf } = f;
      s.timeline[16] = { hour: ha, ...cf };
      s.timeline[17] = { hour: hf, ...ca };
      s.updatedAt = new Date(Date.parse(hf) + HOUR).toISOString();
      period0(s).importWh += (ca.gridImportWh ?? 0) - (a.gridImportWh ?? 0);
      expect(checkSnapshot(s)).toEqual([
        expect.stringContaining("is actual after a forecast hour"),
      ]);
    });
    it("reports an actual hour not before updatedAt", () =>
      has(
        (s) =>
          (s.updatedAt = new Date(
            Date.parse(s.updatedAt) - 2 * HOUR,
          ).toISOString()),
        "is actual but not before updatedAt",
      ));
    it("reports an unbalanced actual hour", () =>
      has((s) => {
        const r = row(s, 5);
        r.gridImportWh = (r.gridImportWh ?? 0) + 500;
      }, "energy does not balance"));
    it("tolerates a 50 Wh actual imbalance", () => {
      expect(
        problems((s) => {
          const r = row(s, 5);
          r.gridImportWh = (r.gridImportWh ?? 0) + 50;
          period0(s).importWh += 50; // rule 3 is exact, keep cost consistent
        }),
      ).toEqual([]);
    });
    it("reports an actual hour missing a breakdown field", () =>
      has(
        (s) => delete row(s, 5).batteryChargeWh,
        "needs 4 integer breakdown fields",
      ));
    it("reports a negative or non-integer breakdown field", () => {
      has(
        (s) => (row(s, 5).gridExportWh = -1),
        "needs 4 integer breakdown fields",
      );
      has(
        (s) => (row(s, 5).batteryDischargeWh = 0.5),
        "needs 4 integer breakdown fields",
      );
    });
    it("reports a forecast hour with a breakdown field", () =>
      has(
        (s) => (row(s, 20).gridImportWh = 0),
        "is forecast but has breakdown fields",
      ));
    it("reports loadP10 > load on a forecast hour", () =>
      has(
        (s) => (row(s, 20).loadP10Wh = row(s, 20).loadWh + 1),
        "load needs p10 <= value <= p90",
      ));
    it("reports solarP90 < solar on a forecast hour", () =>
      has(
        (s) => (row(s, 36).solarP90Wh = row(s, 36).solarWh - 1),
        "solar needs p10 <= value <= p90",
      ));
    it("reports a missing forecast band", () =>
      has(
        (s) => delete row(s, 20).loadP90Wh,
        "load needs p10 <= value <= p90",
      ));
    it("reports p10/p90 on an actual hour", () =>
      has((s) => (row(s, 3).solarP10Wh = 0), "is actual but has p10/p90"));
  });

  describe("rule 3: costToday", () => {
    it("reports period import not summing to today's grid import", () =>
      has((s) => (period0(s).importWh += 1000), "period imports do not sum"));
    it("reports period import off by 1 Wh (exact)", () =>
      has((s) => (period0(s).importWh += 1), "period imports do not sum"));
    it("reports netCents != sum(costCents) - exportCreditCents", () =>
      has((s) => (s.costToday.netCents += 1), "costToday.netCents"));
  });

  describe("rule 4: previousDays", () => {
    it("reports 5 entries", () =>
      has((s) => s.previousDays.pop(), "previousDays must have 6 entries"));
    it("reports a gap in the dates", () =>
      has((s) => {
        const p = s.previousDays[2];
        if (!p) throw new Error("no day");
        p.date = "2026-07-01";
      }, "previousDays must be the 6 consecutive days"));
    it("reports descending order", () =>
      has(
        (s) => s.previousDays.reverse(),
        "previousDays must be the 6 consecutive days",
      ));
    it("reports a last entry that is not the day before today", () =>
      has((s) => {
        const p = s.previousDays[5];
        if (!p) throw new Error("no day");
        p.date = "2026-07-15";
      }, "previousDays must be the 6 consecutive days"));
  });

  describe("rule 5: weatherTomorrow", () => {
    it("reports a wrong date", () =>
      has((s) => {
        if (s.weatherTomorrow) s.weatherTomorrow.date = "2026-07-17";
      }, "weatherTomorrow.date"));
    it("accepts null", () => {
      expect(problems((s) => (s.weatherTomorrow = null))).toEqual([]);
    });
  });

  describe("rule 6: ISO strings", () => {
    it.each([
      [
        "updatedAt",
        (s: DashboardSnapshot) => (s.updatedAt = "nope"),
        "updatedAt is not a valid ISO date",
      ],
      [
        "tariffNow.endsAt",
        (s: DashboardSnapshot) => (s.tariffNow.endsAt = "x"),
        "tariffNow.endsAt is not a valid ISO date",
      ],
      [
        "health.lastPollAt",
        (s: DashboardSnapshot) => (s.health.lastPollAt = "x"),
        "health.lastPollAt is not a valid ISO date",
      ],
      [
        "timeline hour",
        (s: DashboardSnapshot) => (row(s, 4).hour = "x"),
        "timeline[4].hour is not a valid ISO date",
      ],
      [
        "recommendation.validFrom",
        (s: DashboardSnapshot) => {
          if (s.recommendation) s.recommendation.validFrom = "x";
        },
        "recommendation.validFrom is not a valid ISO date",
      ],
    ])("reports an unparseable %s", (_n, mut, part) => has(mut, part));
  });
});

// --- toDashboardView: sample numbers pinned from sampleDashboard at the base

describe("toDashboardView(sampleSnapshot)", () => {
  const v = toDashboardView(sampleSnapshot);

  it("reproduces today's totals", () => {
    expect(v.today).toEqual({
      solarWh: 42176,
      loadWh: 18286,
      gridImportWh: 2901,
      gridExportWh: 20716,
      batteryChargeWh: 10800,
      batteryDischargeWh: 4725,
      selfPoweredPct: 84,
    });
  });

  it("reproduces last7Days", () => {
    expect(v.last7Days).toEqual([
      { date: "2026-07-09", solarWh: 47500, loadWh: 24500 },
      { date: "2026-07-10", solarWh: 47000, loadWh: 24800 },
      { date: "2026-07-11", solarWh: 46500, loadWh: 25100 },
      { date: "2026-07-12", solarWh: 46000, loadWh: 25400 },
      { date: "2026-07-13", solarWh: 45500, loadWh: 25700 },
      { date: "2026-07-14", solarWh: 45000, loadWh: 26000 },
      { date: "2026-07-15", solarWh: 42176, loadWh: 18286 },
    ]);
  });

  it("reproduces the solar outlook (45% less, 25.4 kWh tomorrow)", () => {
    expect(v.solarOutlook).toEqual({
      todayWh: 46118,
      tomorrowWh: 25366,
      changePct: 45,
      direction: "less",
    });
    expect((v.solarOutlook.tomorrowWh / 1000).toFixed(1)).toBe("25.4");
  });

  it("reproduces cost, live and the tariff unchanged", () => {
    expect(v.costToday.netCents).toBe(-79);
    expect(v.costToday.exportCreditCents).toBe(166);
    expect(v.live).toMatchObject({
      solarW: 3713,
      loadW: 2066,
      batteryW: 0,
      gridW: -1647,
      socPct: 100,
    });
  });

  it("drops previousDays", () => {
    expect("previousDays" in v).toBe(false);
  });

  it("does not mutate the snapshot", () => {
    const s = structuredClone(sampleSnapshot);
    toDashboardView(s);
    expect(s).toEqual(sampleSnapshot);
  });
});

describe("toDashboardView edge cases", () => {
  const noNaN = (x: unknown): boolean =>
    typeof x === "number"
      ? Number.isFinite(x)
      : x !== null && typeof x === "object"
        ? Object.values(x).every(noNaN)
        : true;

  it("loadWh 0 gives selfPoweredPct 0 and no NaN", () => {
    const v = toDashboardView(build("2026-07-15", TZ, 0));
    expect(v.today.loadWh).toBe(0);
    expect(v.today.selfPoweredPct).toBe(0);
    expect(noNaN(v)).toBe(true);
  });

  it("clamps selfPoweredPct to 0..100", () => {
    const s = build("2026-07-15");
    for (const r of s.timeline) if (r.kind === "actual") r.gridImportWh = 5000;
    expect(toDashboardView(s).today.selfPoweredPct).toBe(0);
  });

  it("direction is 'more' when tomorrow has more solar", () => {
    const s = build("2026-07-15");
    for (const r of s.timeline.slice(24)) r.solarWh = 1000; // tomorrow doubles
    expect(toDashboardView(s).solarOutlook).toMatchObject({
      changePct: 100,
      direction: "more",
    });
  });
});

// --- DST -------------------------------------------------------------------

describe("DST days in America/Los_Angeles", () => {
  it("fall-back 2026-11-01 (25 h): 49 rows, valid, 25 hours grouped into today", () => {
    const s = build("2026-11-01");
    expect(s.timeline).toHaveLength(49);
    expect(checkSnapshot(s)).toEqual([]);
    // Tomorrow is a plain 24 h day: 25 x 500 vs 24 x 500.
    expect(toDashboardView(s).solarOutlook).toEqual({
      todayWh: 12500,
      tomorrowWh: 12000,
      changePct: 4,
      direction: "less",
    });
  });

  it("spring-forward 2026-03-08 (23 h): 47 rows, valid, 23 hours grouped into today", () => {
    const s = build("2026-03-08");
    expect(s.timeline).toHaveLength(47);
    expect(checkSnapshot(s)).toEqual([]);
    expect(toDashboardView(s).solarOutlook).toEqual({
      todayWh: 11500,
      tomorrowWh: 12000,
      changePct: 4,
      direction: "more",
    });
  });

  it("a DST timeline missing its last hour is reported", () => {
    expect(
      problems((s) => s.timeline.pop(), build("2026-11-01")).length,
    ).toBeGreaterThan(0);
  });
});

// --- Rev 6: peak estimate and reserve advice --------------------------------

const hist = {
  historyAvgWh: 10200,
  highC: 33,
  similarTempDays: 8,
  similarTempAvgWh: 11600,
};

describe("peakEstimateWh", () => {
  it("is the mean of the two averages", () => {
    expect(peakEstimateWh(hist)).toBe(10900);
  });
  it("falls back to historyAvgWh when similarTempAvgWh is null", () => {
    expect(
      peakEstimateWh({ ...hist, similarTempDays: 2, similarTempAvgWh: null }),
    ).toBe(10200);
  });
  it("rounds to an integer", () => {
    expect(
      peakEstimateWh({ ...hist, historyAvgWh: 10001, similarTempAvgWh: 10002 }),
    ).toBe(10002);
    expect(
      peakEstimateWh({ ...hist, historyAvgWh: 10000, similarTempAvgWh: 10001 }),
    ).toBe(10001);
  });
});

describe("reservePlan", () => {
  it("27 kWh battery, 11 kWh peak: extra 41, target 61", () => {
    expect(reservePlan(11000, 27000)).toEqual({
      emergencyPct: 20,
      extraPct: 41,
      targetPct: 61,
      peakWh: 11000,
      coveredWh: 11000,
    });
  });
  it("sample: 9.3 kWh on 13.5 kWh gives extra 69, target 89", () => {
    expect(reservePlan(9300, 13500)).toEqual({
      emergencyPct: 20,
      extraPct: 69,
      targetPct: 89,
      peakWh: 9300,
      coveredWh: 9300,
    });
  });
  it("caps at 100% and covers only what fits", () => {
    expect(reservePlan(15000, 13500)).toEqual({
      emergencyPct: 20,
      extraPct: 80,
      targetPct: 100,
      peakWh: 15000,
      coveredWh: 10800,
    });
  });
  it("does not round exact multiples up", () => {
    expect(reservePlan(2700, 13500)).toMatchObject({
      extraPct: 20,
      targetPct: 40,
    });
  });
  it("honours a custom emergency floor", () => {
    expect(reservePlan(5000, 10000, 30)).toMatchObject({
      emergencyPct: 30,
      extraPct: 50,
      targetPct: 80,
    });
  });
});

describe("checkSnapshot: peak estimate rules", () => {
  const bad = (mut: (s: DashboardSnapshot) => void) =>
    expect(problems(mut).length).toBeGreaterThan(0);
  const peak = (s: DashboardSnapshot) => {
    if (!s.peakEstimate.today || !s.peakEstimate.tomorrow)
      throw new Error("sample needs both peak days");
    return { today: s.peakEstimate.today, tomorrow: s.peakEstimate.tomorrow };
  };
  const rec = (s: DashboardSnapshot) => {
    if (!s.recommendation?.reserve) throw new Error("sample needs a reserve");
    return s.recommendation.reserve;
  };

  it("accepts the sample snapshot", () => {
    expect(checkSnapshot(sampleSnapshot)).toEqual([]);
  });
  it("reports a negative or non-integer historyDays", () => {
    bad((s) => (s.peakEstimate.historyDays = -1));
    bad((s) => (s.peakEstimate.historyDays = 30.5));
  });
  it("reports a non-integer or negative peak Wh", () => {
    bad((s) => (peak(s).today.historyAvgWh = 10200.5));
    bad((s) => (peak(s).tomorrow.historyAvgWh = -1));
  });
  it("reports similarTempDays above historyDays", () =>
    bad((s) => (peak(s).today.similarTempDays = 31)));
  it("reports similarTempAvgWh present with fewer than 3 days", () =>
    bad((s) => (peak(s).today.similarTempDays = 2)));
  it("reports similarTempAvgWh null with 3 or more days", () =>
    bad((s) => (peak(s).tomorrow.similarTempAvgWh = null)));
  it("reports a non-null day that has no peak hours", () =>
    bad((s) => {
      for (const r of s.timeline.slice(24)) r.period = "off-peak";
    }));
  it("reports a reserve that does not match reservePlan", () =>
    bad((s) => (rec(s).extraPct += 1)));
  it("reports a reserve with fewer than 7 days of history", () =>
    bad((s) => {
      s.peakEstimate.historyDays = 6;
      peak(s).today.similarTempDays = 5;
      peak(s).tomorrow.similarTempDays = 5;
    }));
  it("reports an emergencyPct below 20", () =>
    bad((s) => {
      s.recommendation!.reserve = reservePlan(9300, 13500, 10);
    }));
});

describe("toDashboardView: peakUsage", () => {
  const at = (iso: string) => Date.parse(iso);
  const v = toDashboardView(sampleSnapshot);

  it("derives the window from the Timeline peak hours (16:00-21:00 local)", () => {
    const { today, tomorrow } = v.peakUsage;
    expect(at(today!.windowStart)).toBe(at("2026-07-15T23:00:00Z"));
    expect(at(today!.windowEnd)).toBe(at("2026-07-16T04:00:00Z"));
    expect(at(tomorrow!.windowStart)).toBe(at("2026-07-16T23:00:00Z"));
    expect(at(tomorrow!.windowEnd)).toBe(at("2026-07-17T04:00:00Z"));
  });
  it("adds estimateWh and keeps the history fields", () => {
    expect(v.peakUsage.historyDays).toBe(30);
    expect(v.peakUsage.today).toMatchObject({ ...hist, estimateWh: 10900 });
    expect(v.peakUsage.tomorrow?.estimateWh).toBe(9300);
  });
  it("usedSoFarWh is the sample's 16:00 actual load; null for tomorrow", () => {
    const h16 = sampleSnapshot.timeline.find(
      (r) => at(r.hour) === at("2026-07-15T23:00:00Z"),
    );
    expect(h16?.kind).toBe("actual");
    expect(v.peakUsage.today?.usedSoFarWh).toBe(h16?.loadWh);
    expect(v.peakUsage.tomorrow?.usedSoFarWh).toBeNull();
  });
  it("usedSoFarWh is null when no peak hour is actual yet", () => {
    const s = build("2026-07-15");
    for (const r of s.timeline) {
      const h = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: TZ,
          hour: "numeric",
          hourCycle: "h23",
        }).format(new Date(r.hour)),
      );
      if (h >= 16 && h < 21) r.period = "peak";
    }
    s.peakEstimate = { historyDays: 30, today: hist, tomorrow: hist };
    const out = toDashboardView(s).peakUsage;
    expect(out.today?.usedSoFarWh).toBeNull();
    expect(out.today?.windowStart).toBeDefined();
  });
  it("learning is true at 6 days and false at 7", () => {
    const at6 = structuredClone(sampleSnapshot);
    at6.peakEstimate.historyDays = 6;
    expect(toDashboardView(at6).peakUsage.learning).toBe(true);
    expect(toDashboardView(at6).peakUsage.historyDays).toBe(6);
    const at7 = structuredClone(sampleSnapshot);
    at7.peakEstimate.historyDays = 7;
    expect(toDashboardView(at7).peakUsage.learning).toBe(false);
  });
});
