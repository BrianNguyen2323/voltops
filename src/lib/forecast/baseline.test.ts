import { describe, expect, it } from "vitest";
import { forecastHours } from "~/lib/forecast/baseline";

const H = 3_600_000;
const at = (day: number, hour: number) => Date.UTC(2026, 0, day, hour);
const base = {
  tz: "UTC",
  observedGhi: [],
  forecastGhi: [],
  startSocPct: 50,
  capacityWh: 10_000,
  reservePct: 20,
};

function invariant(rows: ReturnType<typeof forecastHours>) {
  for (const r of rows) {
    for (const v of Object.values(r))
      if (typeof v === "number") expect(Number.isInteger(v)).toBe(true);
    expect(r.loadP10Wh).toBeLessThanOrEqual(r.loadWh);
    expect(r.loadWh).toBeLessThanOrEqual(r.loadP90Wh);
    expect(r.solarP10Wh).toBeLessThanOrEqual(r.solarWh);
    expect(r.solarWh).toBeLessThanOrEqual(r.solarP90Wh);
  }
}

describe("forecastHours load + naive solar (nearest-rank percentiles)", () => {
  it("n=10: q50 = 5th, q10 = 1st, q90 = 9th sorted value", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      hour: at(i + 1, 10),
      loadWh: (10 - i) * 100,
      solarWh: (i + 1) * 10,
    }));
    const rows = forecastHours({ ...base, hours: [at(11, 10)], history });
    expect(rows[0]).toMatchObject({
      hour: new Date(at(11, 10)).toISOString(),
      loadWh: 500,
      loadP10Wh: 100,
      loadP90Wh: 900,
      solarWh: 50,
      solarP10Wh: 10,
      solarP90Wh: 90,
    });
    invariant(rows);
  });

  it("even n takes the lower middle, not the average", () => {
    const history = [10, 20, 30, 40].map((v, i) => ({
      hour: at(i + 1, 5),
      loadWh: v,
      solarWh: 0,
    }));
    const [r] = forecastHours({ ...base, hours: [at(5, 5)], history });
    expect(r!.loadWh).toBe(20);
    expect(r!.loadP10Wh).toBe(10);
    expect(r!.loadP90Wh).toBe(40);
  });

  it("only uses history at the same hour-of-day", () => {
    const history = [
      { hour: at(1, 10), loadWh: 100, solarWh: 0 },
      { hour: at(1, 11), loadWh: 9999, solarWh: 0 },
    ];
    const [r] = forecastHours({ ...base, hours: [at(2, 10)], history });
    expect(r!.loadWh).toBe(100);
  });

  it("empty history gives all zeros (SoC unchanged)", () => {
    const rows = forecastHours({
      ...base,
      hours: [at(2, 0), at(2, 1)],
      history: [],
    });
    expect(
      rows.map((r) => [
        r.loadWh,
        r.loadP10Wh,
        r.loadP90Wh,
        r.solarWh,
        r.solarP10Wh,
        r.solarP90Wh,
        r.socPct,
      ]),
    ).toEqual([
      [0, 0, 0, 0, 0, 0, 50],
      [0, 0, 0, 0, 0, 0, 50],
    ]);
  });

  it("solar is naive when forecast GHI is missing or observed GHI is empty", () => {
    const history = [
      { hour: at(1, 12), loadWh: 0, solarWh: 50 },
      { hour: at(2, 12), loadWh: 0, solarWh: 150 },
    ];
    const obs = [
      { hour: at(1, 12), ghiWm2: 100 },
      { hour: at(2, 12), ghiWm2: 200 },
    ];
    const noForecast = forecastHours({
      ...base,
      hours: [at(3, 12)],
      history,
      observedGhi: obs,
    });
    expect(noForecast[0]!.solarWh).toBe(50);
    const noObserved = forecastHours({
      ...base,
      hours: [at(3, 12)],
      history,
      forecastGhi: [{ hour: at(3, 12), ghiWm2: 300 }],
    });
    expect(noObserved[0]!.solarWh).toBe(50);
  });
});

describe("forecastHours GHI-scaled solar", () => {
  const history = [
    { hour: at(1, 12), loadWh: 0, solarWh: 50 },
    { hour: at(2, 12), loadWh: 0, solarWh: 150 },
  ];
  const observedGhi = [
    { hour: at(1, 12), ghiWm2: 100 },
    { hour: at(2, 12), ghiWm2: 200 },
  ];

  it("k_h scales forecast GHI; p10/p90 come from per-day ratios", () => {
    // k_h = 200/300; value = 200; r = [50/66.67, 150/133.33] = [0.75, 1.125]
    const rows = forecastHours({
      ...base,
      hours: [at(3, 12)],
      history,
      observedGhi,
      forecastGhi: [{ hour: at(3, 12), ghiWm2: 300 }],
    });
    expect(rows[0]).toMatchObject({
      solarWh: 200,
      solarP10Wh: 150,
      solarP90Wh: 225,
    });
    invariant(rows);
  });

  it("falls back to the overall k when the hour-of-day has no ghi > 0 history", () => {
    // overall k = (50+150)/(100+200) = 2/3 ; hour 14 has no history
    const rows = forecastHours({
      ...base,
      hours: [at(3, 14)],
      history,
      observedGhi,
      forecastGhi: [{ hour: at(3, 14), ghiWm2: 300 }],
    });
    expect(rows[0]!.solarWh).toBe(200);
    invariant(rows);
  });

  it("ignores history hours with ghi = 0 when computing k_h", () => {
    const h = [...history, { hour: at(3, 12), loadWh: 0, solarWh: 5000 }];
    const o = [...observedGhi, { hour: at(3, 12), ghiWm2: 0 }];
    const rows = forecastHours({
      ...base,
      hours: [at(4, 12)],
      history: h,
      observedGhi: o,
      forecastGhi: [{ hour: at(4, 12), ghiWm2: 300 }],
    });
    expect(rows[0]!.solarWh).toBe(200);
  });

  it("a single day with ratio 1 gives p10 = p90 = value", () => {
    const rows = forecastHours({
      ...base,
      hours: [at(3, 12)],
      history: [{ hour: at(1, 12), loadWh: 0, solarWh: 100 }],
      observedGhi: [{ hour: at(1, 12), ghiWm2: 100 }],
      forecastGhi: [{ hour: at(3, 12), ghiWm2: 50 }],
    });
    expect(rows[0]).toMatchObject({
      solarWh: 50,
      solarP10Wh: 50,
      solarP90Wh: 50,
    });
  });
});

describe("forecastHours SoC projection", () => {
  const h = (hour: number, loadWh: number, solarWh: number) => ({
    hour: at(1, hour),
    loadWh,
    solarWh,
  });
  const history = [
    h(0, 800, 0),
    h(1, 800, 0),
    h(2, 800, 0),
    h(3, 0, 9000),
    h(4, 0, 0),
  ];
  const hours = [0, 1, 2, 3, 4].map((x) => at(2, x));

  it("is start-of-hour, floors at the reserve, caps at capacity", () => {
    const rows = forecastHours({ ...base, hours, history, startSocPct: 30 });
    expect(rows.map((r) => r.socPct)).toEqual([30, 22, 20, 20, 100]);
  });

  it("first hour is round(startSocPct)", () => {
    const rows = forecastHours({
      ...base,
      hours: [at(2, 0)],
      history,
      startSocPct: 49.6,
    });
    expect(rows[0]!.socPct).toBe(50);
  });

  it("does not discharge when already below the reserve", () => {
    const rows = forecastHours({
      ...base,
      hours: hours.slice(0, 3),
      history,
      startSocPct: 10,
    });
    expect(rows.map((r) => r.socPct)).toEqual([10, 10, 10]);
  });
});

describe("forecastHours DST (America/Los_Angeles, 2026-11-01)", () => {
  it("both 01:00 local hours map to hour-of-day 1", () => {
    const pdt1 = Date.UTC(2026, 10, 1, 8); // 01:00 PDT
    const pst1 = pdt1 + H; // 01:00 PST
    const history = [
      { hour: Date.UTC(2026, 9, 30, 8), loadWh: 100, solarWh: 0 }, // 01:00 PDT
      { hour: Date.UTC(2026, 9, 31, 8), loadWh: 300, solarWh: 0 },
      { hour: Date.UTC(2026, 9, 31, 9), loadWh: 999, solarWh: 0 }, // 02:00 PDT
    ];
    const rows = forecastHours({
      ...base,
      tz: "America/Los_Angeles",
      hours: [pdt1, pst1, pst1 + H],
      history,
    });
    expect(rows.map((r) => r.loadWh)).toEqual([100, 100, 999]);
    expect(rows[1]!.hour).toBe(new Date(pst1).toISOString());
    invariant(rows);
  });
});
