import { describe, expect, it } from "vitest";
import type { HourEnergy, ObservedHour } from "~/server/history";
import { addDays, localTime } from "~/lib/time";
import { equipmentHealth } from "./index";

const H = 3_600_000;
const utc = (y: number, m: number, d: number, h = 0, min = 0) =>
  Date.UTC(y, m - 1, d, h, min);

const hr = (start: number, o: Partial<HourEnergy> = {}): HourEnergy => ({
  start,
  solarWh: 0,
  loadWh: 0,
  gridImportWh: 0,
  gridExportWh: 0,
  batteryChargeWh: 0,
  batteryDischargeWh: 0,
  ...o,
});
const ob = (hour: number, o: Partial<ObservedHour> = {}): ObservedHour => ({
  hour,
  tempC: 15,
  cloudPct: 0,
  ghiWm2: 800,
  precipMm: 0,
  ...o,
});

type Input = Parameters<typeof equipmentHealth>[0];
const run = (o: Partial<Input>) =>
  equipmentHealth({
    hours: [],
    observed: [],
    soc: [],
    tz: "UTC",
    now: utc(2026, 3, 15, 12),
    ...o,
  });

describe("empty input", () => {
  it("is all null", () => {
    expect(run({})).toEqual({
      solarClearDay: null,
      sunnyDayMiss: null,
      batteryCapacity: null,
      efficiency: null,
    });
  });
});

describe("solarClearDay", () => {
  // `n` clear noon hours on days 1..n of Feb `year`; odd days produce `lo` Wh, even `hi`.
  // Noise on days 1..25: cloudy hours (ratio 0) and weak-sun hours (ratio 0.2).
  const feb = (year: number, n: number, lo: number, hi: number) => {
    const hours: HourEnergy[] = [];
    const observed: ObservedHour[] = [];
    for (let d = 1; d <= 25; d++) {
      if (d <= n) {
        const t = utc(year, 2, d, 12);
        hours.push(hr(t, { solarWh: d % 2 ? lo : hi }));
        observed.push(ob(t));
      }
      const cloudy = utc(year, 2, d, 14);
      hours.push(hr(cloudy, { solarWh: 0 }));
      observed.push(ob(cloudy, { cloudPct: 50 }));
      const weak = utc(year, 2, d, 15);
      hours.push(hr(weak, { solarWh: 100 }));
      observed.push(ob(weak, { ghiWm2: 500 }));
    }
    return { hours, observed };
  };
  const both = (cur: number, base: number) => {
    const c = feb(2026, cur, 3600, 4000);
    const b = feb(2025, base, 4000, 4000);
    return {
      hours: [...b.hours, ...c.hours],
      observed: [...b.observed, ...c.observed],
    };
  };

  it("is 95 for 3800 median vs 4000 a year earlier, ignoring cloudy and weak-sun hours", () => {
    expect(run(both(20, 20)).solarClearDay).toEqual({
      month: "2026-02",
      baselineMonth: "2025-02",
      pctOfBaseline: 95,
      clearHours: 20,
    });
  });

  it("is null with 19 clear hours in the month", () => {
    expect(run(both(19, 20)).solarClearDay).toBeNull();
  });

  it("is null with 19 clear hours in the baseline month", () => {
    expect(run(both(20, 19)).solarClearDay).toBeNull();
  });

  it("uses December of the previous year when now is in January", () => {
    const hours: HourEnergy[] = [];
    const observed: ObservedHour[] = [];
    for (const y of [2024, 2025])
      for (let d = 1; d <= 20; d++) {
        const t = utc(y, 12, d, 12);
        hours.push(hr(t, { solarWh: 4000 }));
        observed.push(ob(t));
      }
    expect(
      run({ hours, observed, now: utc(2026, 1, 10, 12) }).solarClearDay,
    ).toEqual({
      month: "2025-12",
      baselineMonth: "2024-12",
      pctOfBaseline: 100,
      clearHours: 20,
    });
  });
});

describe("sunnyDayMiss", () => {
  // Local hours 10..14 each day from..to, ghi 800, cloud `cloud`, 4000 Wh at 100%.
  const span = (
    from: string,
    to: string,
    over: Record<string, { pct?: number; cloud?: number }> = {},
    tz = "UTC",
  ) => {
    const hours: HourEnergy[] = [];
    const observed: ObservedHour[] = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const { pct = 100, cloud = 0 } = over[date] ?? {};
      for (let h = 10; h <= 14; h++) {
        const t = localTime(date, h * 60, tz);
        hours.push(hr(t, { solarWh: (4000 * pct) / 100 }));
        observed.push(ob(t, { cloudPct: cloud }));
      }
    }
    return { hours, observed };
  };
  const now = utc(2026, 3, 20, 12);
  const miss = (over: Record<string, { pct?: number; cloud?: number }>) =>
    run({ ...span("2026-02-01", "2026-03-19", over), now }).sunnyDayMiss;

  it("returns a clear day at 70% of expected", () => {
    expect(miss({ "2026-03-19": { pct: 70 } })).toEqual({
      date: "2026-03-19",
      expectedWh: 20000,
      actualWh: 14000,
    });
  });

  it("does not return a clear day at 80% of expected", () => {
    expect(miss({ "2026-03-19": { pct: 80 } })).toBeNull();
  });

  it("returns the newest qualifying day", () => {
    expect(
      miss({ "2026-03-15": { pct: 50 }, "2026-03-17": { pct: 70 } }),
    ).toEqual({ date: "2026-03-17", expectedWh: 20000, actualWh: 14000 });
  });

  it("does not flag a cloudy day at 50%", () => {
    expect(miss({ "2026-03-19": { pct: 50, cloud: 60 } })).toBeNull();
  });

  it("ignores a miss on the 8th day back", () => {
    expect(miss({ "2026-03-12": { pct: 50 } })).toBeNull();
  });

  it("is null with 13 days of data and flagged with 14", () => {
    const at = (from: string) =>
      run({ ...span(from, "2026-03-19", { "2026-03-19": { pct: 70 } }), now })
        .sunnyDayMiss;
    expect(at("2026-03-07")).toBeNull();
    expect(at("2026-03-06")).toEqual({
      date: "2026-03-19",
      expectedWh: 20000,
      actualWh: 14000,
    });
  });

  it("keys ratios by local hour and days by local date across a DST change", () => {
    // Los Angeles fell back on 2026-11-01; local 10:00 is 17:00Z before it and 18:00Z after.
    const tz = "America/Los_Angeles";
    expect(
      run({
        ...span("2026-10-01", "2026-11-03", { "2026-11-01": { pct: 70 } }, tz),
        tz,
        now: utc(2026, 11, 4, 20),
      }).sunnyDayMiss,
    ).toEqual({ date: "2026-11-01", expectedWh: 20000, actualWh: 14000 });
  });
});

describe("batteryCapacity", () => {
  type Sw = {
    at: [number, number, number];
    socs: number[];
    step?: number;
    wh?: number;
  };
  const f50 = [100, 90, 80, 70, 60, 50];
  // Each swing starts at 00:00Z of its day; its 2 UTC hours (0 and 1) hold `wh`, hour 2 holds a decoy.
  const bat = (list: Sw[]) => {
    const hours: HourEnergy[] = [];
    const soc: Input["soc"] = [];
    for (const { at, socs, step = 30, wh = 13000 } of list) {
      const t0 = utc(...at);
      socs.forEach((socPct, i) =>
        soc.push({ ts: t0 + i * step * 60_000, socPct }),
      );
      hours.push(
        hr(t0, { batteryDischargeWh: wh / 2 }),
        hr(t0 + H, { batteryDischargeWh: wh / 2 }),
        hr(t0 + 2 * H, { batteryDischargeWh: 99_999 }),
      );
    }
    return { hours, soc };
  };
  const feb = (n: number, o: Partial<Sw> = {}): Sw[] =>
    Array.from({ length: n }, (_, i) => ({
      at: [2026, 2, 1 + i * 2],
      socs: f50,
      ...o,
    }));
  const cap = (list: Sw[]) => run(bat(list)).batteryCapacity;

  it("is 26000 for 5 swings of 50 points moving 13000 Wh", () => {
    expect(cap(feb(5))).toEqual({
      month: "2026-02",
      estimatedWh: 26000,
      swings: 5,
    });
  });

  it("is null with 4 swings", () => {
    expect(cap(feb(4))).toBeNull();
  });

  it("takes the mean of the middle two of an even number of swings", () => {
    const whs = [10000, 11000, 12000, 13000, 14000, 15000];
    expect(
      cap(whs.map((wh, i) => ({ at: [2026, 2, 1 + i], socs: f50, wh }))),
    ).toEqual({ month: "2026-02", estimatedWh: 25000, swings: 6 });
  });

  it("counts a swing that ends in the last complete month only", () => {
    expect(cap([...feb(4), { at: [2026, 1, 20], socs: f50 }])).toBeNull();
    expect(
      cap([...feb(5), { at: [2026, 3, 2], socs: f50, wh: 50000 }]),
    ).toEqual({ month: "2026-02", estimatedWh: 26000, swings: 5 });
  });

  it("allows a 75 minute sample gap but not 76", () => {
    const three = [100, 75, 50];
    expect(cap(feb(5, { socs: three, step: 75 }))?.estimatedWh).toBe(26000);
    expect(cap(feb(5, { socs: three, step: 76 }))).toBeNull();
  });

  it("does not join two runs split by a >75 min gap", () => {
    const split = {
      at: [2026, 2, 20],
      socs: [100, 85, 70, 65, 50, 35],
      step: 30,
    } as Sw;
    // runs 100..70 (30 points) and 65..35 (30 points) with a 90 min gap after the third sample
    const { hours, soc } = bat([...feb(4), split]);
    const gapped = soc.map((s, i) =>
      i >= soc.length - 3 ? { ...s, ts: s.ts + 60 * 60_000 } : s,
    );
    expect(run({ hours, soc: gapped }).batteryCapacity).toBeNull();
  });

  it("does not join two runs split by a rise", () => {
    const risen = [100, 85, 65, 70, 50, 35];
    expect(cap([...feb(4), { at: [2026, 2, 20], socs: risen }])).toBeNull();
  });

  it("needs a drop of 40 points: 39 does not count, 40 does", () => {
    expect(cap(feb(5, { socs: [100, 80, 61], step: 75 }))).toBeNull();
    expect(cap(feb(5, { socs: [100, 80, 60], step: 75 }))).toEqual({
      month: "2026-02",
      estimatedWh: 32500,
      swings: 5,
    });
  });

  it("ignores charge swings", () => {
    const up = [50, 60, 70, 80, 90, 100];
    const ch = bat(
      Array.from({ length: 5 }, (_, i) => ({
        at: [2026, 2, 2 + i * 2],
        socs: up,
      })) as Sw[],
    );
    const dn = bat(feb(4));
    expect(
      run({ hours: [...dn.hours, ...ch.hours], soc: [...dn.soc, ...ch.soc] })
        .batteryCapacity,
    ).toBeNull();
  });
});

describe("efficiency", () => {
  // Feb 2026: days 1..n, `per` hours each, one hour carries charge 100 and discharge 88.
  const days = (n: number, charge = 100, discharge = 88, per = 1) =>
    Array.from({ length: n * per }, (_, i) =>
      hr(utc(2026, 2, 1 + Math.floor(i / per), 10 + (i % per)), {
        batteryChargeWh: charge / per,
        batteryDischargeWh: discharge / per,
      }),
    );
  const eff = (hours: HourEnergy[]) => run({ hours }).efficiency;

  it("is 88 for 880 Wh out per 1000 Wh in over 10 days", () => {
    expect(eff(days(10))).toEqual({ month: "2026-02", pct: 88 });
  });

  it("is null with 9 days, however many hours each", () => {
    expect(eff(days(9))).toBeNull();
    expect(eff(days(9, 200, 176, 2))).toBeNull();
  });

  it("ignores hours outside the last complete month", () => {
    const outside = [
      hr(utc(2026, 1, 31, 23), { batteryChargeWh: 5000 }),
      hr(utc(2026, 3, 1), { batteryChargeWh: 5000 }),
    ];
    expect(eff([...days(10), ...outside])?.pct).toBe(88);
  });

  it("is null when nothing was charged", () => {
    expect(eff(days(10, 0, 50))).toBeNull();
  });
});

describe("DST (America/Los_Angeles, now in December, month = November)", () => {
  const tz = "America/Los_Angeles";
  const now = utc(2026, 12, 10, 12);

  it("buckets efficiency by local November, which has 25 hours on the 1st", () => {
    const day = (d: number) =>
      hr(utc(2026, 11, d, 20), {
        batteryChargeWh: 100,
        batteryDischargeWh: 88,
      });
    const hours = [
      // 2026-10-31 23:00 PDT and 2026-12-01 00:00 PST: outside local November
      hr(utc(2026, 11, 1, 6), { batteryChargeWh: 5000 }),
      hr(utc(2026, 12, 1, 8), { batteryChargeWh: 5000 }),
      ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(day),
      // 2026-11-30 23:00 PST: inside
      hr(utc(2026, 12, 1, 7), { batteryChargeWh: 100, batteryDischargeWh: 88 }),
    ];
    expect(run({ hours, tz, now }).efficiency).toEqual({
      month: "2026-11",
      pct: 88,
    });
  });

  it("keys solarClearDay months in local time", () => {
    const hours: HourEnergy[] = [];
    const observed: ObservedHour[] = [];
    for (const [y, d0] of [
      [2025, 3],
      [2026, 2],
    ] as const)
      for (let d = d0; d < d0 + 20; d++) {
        const t = utc(y, 11, d, 20);
        hours.push(hr(t, { solarWh: 4000 }));
        observed.push(ob(t));
      }
    expect(run({ hours, observed, tz, now }).solarClearDay).toEqual({
      month: "2026-11",
      baselineMonth: "2025-11",
      pctOfBaseline: 100,
      clearHours: 20,
    });
  });
});
