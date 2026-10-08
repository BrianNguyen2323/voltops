import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mapCalendarHistory, mapLiveStatus } from "./map";

const fx = (n: string): unknown =>
  JSON.parse(readFileSync(`fixtures/fleet-api/${n}.json`, "utf8"));
const live = fx("live_status") as { response: Record<string, unknown> };

afterEach(() => vi.restoreAllMocks());

describe("mapLiveStatus", () => {
  it("maps the fixture 1:1 with no sign flips", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = live.response as Record<string, number | string>;
    expect(mapLiveStatus(live)).toEqual({
      ts: new Date(r.timestamp as string).toISOString(),
      solarW: r.solar_power,
      loadW: r.load_power,
      batteryW: r.battery_power,
      gridW: r.grid_power,
      socPct: r.percentage_charged,
      gridStatus: "connected",
    });
    expect(warn).not.toHaveBeenCalled(); // fixture balances: solar+battery+grid = load
  });

  it("rounds watts to integers", () => {
    const r = mapLiveStatus({
      response: { ...live.response, solar_power: 100.6, load_power: 100.4, battery_power: 0, grid_power: 0 },
    });
    expect(r.solarW).toBe(101);
    expect(r.loadW).toBe(100);
  });

  it("maps non-on_grid island_status to islanded", () => {
    expect(
      mapLiveStatus({ response: { ...live.response, island_status: "island_status_unknown" } }).gridStatus,
    ).toBe("islanded");
    expect(
      mapLiveStatus({ response: { ...live.response, island_status: "off_grid" } }).gridStatus,
    ).toBe("islanded");
  });

  it("warns once on imbalance > 50 W and leaves data untouched", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = mapLiveStatus({ response: { ...live.response, grid_power: 500 } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(r.gridW).toBe(500);
  });

  it("does not warn at exactly 50 W imbalance", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mapLiveStatus({ response: { ...live.response, grid_power: 50 } });
    expect(warn).not.toHaveBeenCalled();
  });

  it("rejects invalid input via zod", () => {
    expect(() => mapLiveStatus({ response: { solar_power: "x" } })).toThrow();
    expect(() => mapLiveStatus({})).toThrow();
    expect(() => mapLiveStatus(null)).toThrow();
  });
});

describe("mapCalendarHistory", () => {
  const out = mapCalendarHistory(fx("calendar_history_energy"));
  const kwh = (k: keyof (typeof out)[number]) =>
    out.reduce((s, i) => s + (i[k] as number), 0) / 1000;

  const raw = (
    fx("calendar_history_energy") as {
      response: { time_series: Record<string, number | string>[] };
    }
  ).response.time_series;
  const rawSum = (...keys: string[]) =>
    raw.reduce((s, t) => s + keys.reduce((a, k) => a + (t[k] as number), 0), 0) /
    1000;

  it("returns one interval per time_series entry with UTC ISO starts", () => {
    expect(out).toHaveLength(288);
    expect(out[0]!.start).toBe(new Date(raw[0]!.timestamp as string).toISOString());
    expect(out[1]!.start).toBe(new Date(raw[1]!.timestamp as string).toISOString());
    expect(out[1]!.start).toBe("2026-10-06T07:05:00.000Z");
  });

  it("maps the first interval's fields", () => {
    const t = raw[0]!;
    expect(out[0]).toEqual({
      start: new Date(t.timestamp as string).toISOString(),
      solarWh: t.solar_energy_exported,
      loadWh: t.total_home_usage,
      gridImportWh: t.grid_energy_imported,
      gridExportWh: 0,
      batteryChargeWh: 0,
      batteryDischargeWh: t.battery_energy_exported,
    });
  });

  it("matches the fixture day totals", () => {
    expect(kwh("solarWh")).toBeCloseTo(rawSum("solar_energy_exported"), 3);
    expect(kwh("loadWh")).toBeCloseTo(rawSum("total_home_usage"), 3);
    expect(kwh("gridImportWh")).toBeCloseTo(rawSum("grid_energy_imported"), 3);
    expect(kwh("batteryDischargeWh")).toBeCloseTo(rawSum("battery_energy_exported"), 3);
    expect(kwh("batteryChargeWh")).toBeCloseTo(
      rawSum(
        "battery_energy_imported_from_grid",
        "battery_energy_imported_from_solar",
        "battery_energy_imported_from_generator",
      ),
      3,
    );
    expect(kwh("gridExportWh")).toBeCloseTo(
      rawSum(
        "grid_energy_exported_from_solar",
        "grid_energy_exported_from_generator",
        "grid_energy_exported_from_battery",
      ),
      3,
    );
  });

  it("balances every interval exactly", () => {
    for (const i of out) {
      expect(i.solarWh + i.batteryDischargeWh + i.gridImportWh).toBe(
        i.loadWh + i.batteryChargeWh + i.gridExportWh,
      );
    }
  });

  it("sums the three export and three charge sources", () => {
    const base = {
      timestamp: "2026-10-04T00:00:00-07:00",
      solar_energy_exported: 0,
      grid_energy_imported: 0,
      battery_energy_exported: 0,
      total_home_usage: 0,
      grid_energy_exported_from_solar: 1,
      grid_energy_exported_from_generator: 2,
      grid_energy_exported_from_battery: 4,
      battery_energy_imported_from_grid: 8,
      battery_energy_imported_from_solar: 16,
      battery_energy_imported_from_generator: 32,
    };
    const [i] = mapCalendarHistory({ response: { time_series: [base] } });
    expect(i!.gridExportWh).toBe(7);
    expect(i!.batteryChargeWh).toBe(56);
  });

  it("rejects invalid input via zod", () => {
    expect(() => mapCalendarHistory({ response: {} })).toThrow();
    expect(() => mapCalendarHistory(undefined)).toThrow();
  });
});
