import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { costToday, parseTariff, tariffAt } from "~/lib/tariff";

const LA = "America/Los_Angeles";
const raw = JSON.parse(readFileSync("fixtures/fleet-api/site_info.json", "utf8")) as {
  response: { tariff_content: Record<string, unknown> };
};
const content = raw.response.tariff_content;
const tariff = parseTariff(content)!;

/** UTC ms for a local LA wall-clock time in PDT (UTC-7) or PST (UTC-8). */
const pdt = (m: number, d: number, h: number, min = 0) => Date.UTC(2026, m - 1, d, h + 7, min);
const pst = (m: number, d: number, h: number, min = 0) => Date.UTC(2026, m - 1, d, h + 8, min);

describe("parseTariff", () => {
  it("parses the SCE fixture", () => {
    expect(tariff).not.toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(parseTariff(null)).toBeNull();
    expect(parseTariff(42)).toBeNull();
    expect(parseTariff("junk")).toBeNull();
    expect(parseTariff({ seasons: 5 })).toBeNull();
  });

  it("ignores empty seasons such as ALL: {}", () => {
    const withEmpty = parseTariff({
      ...content,
      seasons: { ...(content.seasons as object), ALL: {} },
    })!;
    expect(withEmpty).not.toBeNull();
    expect(tariffAt(withEmpty, pdt(7, 15, 17), LA)).toEqual(tariffAt(tariff, pdt(7, 15, 17), LA));
  });
});

describe("tariffAt (SCE TOU-D-4-9PM, America/Los_Angeles)", () => {
  it("summer weekday 17:00 is peak until 21:00", () => {
    const t = tariffAt(tariff, pdt(7, 15, 17), LA);
    expect(t.period).toBe("peak");
    expect(t.importCentsPerKwh).toBeCloseTo(58.972, 6);
    expect(t.exportCentsPerKwh).toBeCloseTo(58.972, 6);
    expect(t.endsAt).toBe(new Date(pdt(7, 15, 21)).toISOString());
  });

  it("summer weekend 17:00 is mid-peak", () => {
    const t = tariffAt(tariff, pdt(7, 18, 17), LA);
    expect(t.period).toBe("mid-peak");
    expect(t.importCentsPerKwh).toBeCloseTo(47.816, 6);
  });

  it("winter 22:00 is mid-peak (wraps midnight) until 08:00 next day", () => {
    const t = tariffAt(tariff, pdt(10, 6, 22), LA);
    expect(t.period).toBe("mid-peak");
    expect(t.importCentsPerKwh).toBeCloseTo(39.406, 6);
    expect(t.endsAt).toBe(new Date(pdt(10, 7, 8)).toISOString());
  });

  it("winter 10:00 is off-peak until 16:00", () => {
    const t = tariffAt(tariff, pdt(10, 6, 10), LA);
    expect(t.period).toBe("off-peak");
    expect(t.importCentsPerKwh).toBeCloseTo(35.776, 6);
    expect(t.endsAt).toBe(new Date(pdt(10, 6, 16)).toISOString());
  });

  it("summer OFF_PEAK window wraps midnight (02:00 and 15:59 off-peak, 16:00 peak, 21:00 off-peak)", () => {
    expect(tariffAt(tariff, pdt(7, 15, 2), LA).period).toBe("off-peak");
    expect(tariffAt(tariff, pdt(7, 15, 15, 59), LA).period).toBe("off-peak");
    expect(tariffAt(tariff, pdt(7, 15, 16), LA).period).toBe("peak");
    expect(tariffAt(tariff, pdt(7, 15, 21), LA).period).toBe("off-peak");
  });

  it("wrapping season Winter (10/1 -> 5/31) matches Jan and the boundary days", () => {
    const winterOff = 35.776;
    expect(tariffAt(tariff, pst(1, 15, 12), LA).importCentsPerKwh).toBeCloseTo(winterOff, 6);
    expect(tariffAt(tariff, pdt(5, 31, 12), LA).importCentsPerKwh).toBeCloseTo(winterOff, 6);
    expect(tariffAt(tariff, pdt(10, 1, 12), LA).importCentsPerKwh).toBeCloseTo(winterOff, 6);
    // Summer 6/1 .. 9/30 inclusive
    expect(tariffAt(tariff, pdt(6, 1, 12), LA).importCentsPerKwh).toBeCloseTo(36.829, 6);
    expect(tariffAt(tariff, pdt(9, 30, 12), LA).importCentsPerKwh).toBeCloseTo(36.829, 6);
  });

  it("uses site-local time, not UTC, for the day of week", () => {
    // Sat 2026-07-18 18:00 local = Sun 01:00Z; still weekend mid-peak
    expect(tariffAt(tariff, Date.UTC(2026, 6, 19, 1, 0), LA).period).toBe("mid-peak");
    // Fri 2026-07-17 17:00 local = Sat 00:00Z; still weekday peak
    expect(tariffAt(tariff, Date.UTC(2026, 6, 18, 0, 0), LA).period).toBe("peak");
  });

  it("endsAt falls back to +8 days when the period never changes; ALL.ALL adds; no sell_tariff -> 0 export", () => {
    const flat = parseTariff({
      seasons: {
        Year: {
          fromMonth: 1, fromDay: 1, toMonth: 12, toDay: 31,
          tou_periods: {
            OFF_PEAK: [{ fromDayOfWeek: 0, toDayOfWeek: 6, fromHour: 0, fromMinute: 0, toHour: 0, toMinute: 0 }],
          },
        },
      },
      energy_charges: { ALL: { ALL: 0.05 }, Year: { OFF_PEAK: 0.2 } },
    })!;
    expect(flat).not.toBeNull();
    const ms = pdt(7, 15, 12);
    const t = tariffAt(flat, ms, LA);
    expect(t.period).toBe("off-peak");
    expect(t.importCentsPerKwh).toBeCloseTo(25, 6);
    expect(t.exportCentsPerKwh).toBe(0);
    expect(t.endsAt).toBe(new Date(ms + 8 * 86_400_000).toISOString());
  });
});

describe("costToday", () => {
  const hours = [
    { hour: new Date(pdt(7, 15, 1)).toISOString(), gridImportWh: 400, gridExportWh: 0 }, // off-peak
    { hour: new Date(pdt(7, 15, 2)).toISOString(), gridImportWh: 600, gridExportWh: 0 }, // off-peak
    { hour: new Date(pdt(7, 18, 17)).toISOString(), gridImportWh: 500, gridExportWh: 0 }, // Sat mid-peak
    { hour: new Date(pdt(7, 15, 16)).toISOString(), gridImportWh: 1500, gridExportWh: 0 }, // peak
    { hour: new Date(pdt(7, 15, 17)).toISOString(), gridImportWh: 0, gridExportWh: 2000 }, // peak export
  ];

  it("returns 3 periods in order with summed Wh and per-period rounding", () => {
    const r = costToday(tariff, hours, LA);
    expect(r.periods.map((p) => p.period)).toEqual(["off-peak", "mid-peak", "peak"]);
    expect(r.periods.map((p) => p.importWh)).toEqual([1000, 500, 1500]);
    // 1000*36.829/1000=36.829 -> 37 ; 500*47.816/1000=23.908 -> 24 ; 1500*58.972/1000=88.458 -> 88
    expect(r.periods.map((p) => p.costCents)).toEqual([37, 24, 88]);
    expect(r.exportCreditCents).toBe(118); // 2000*58.972/1000 = 117.944
    expect(r.netCents).toBe(37 + 24 + 88 - 118);
    expect(r.periods.reduce((s, p) => s + p.importWh, 0)).toBe(3000);
  });

  it("returns all three zeroed periods for no hours", () => {
    expect(costToday(tariff, [], LA)).toEqual({
      periods: [
        { period: "off-peak", importWh: 0, costCents: 0 },
        { period: "mid-peak", importWh: 0, costCents: 0 },
        { period: "peak", importWh: 0, costCents: 0 },
      ],
      exportCreditCents: 0,
      netCents: 0,
    });
  });
});
