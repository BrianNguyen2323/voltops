import { z } from "zod";
import type { EnergyInterval, LiveSample } from "~/lib/core/types";

const liveSchema = z.object({
  response: z.object({
    solar_power: z.number(),
    load_power: z.number(),
    battery_power: z.number(),
    grid_power: z.number(),
    percentage_charged: z.number(),
    island_status: z.string(),
    timestamp: z.string(),
  }),
});

export function mapLiveStatus(input: unknown): LiveSample {
  const r = liveSchema.parse(input).response;
  const s: LiveSample = {
    ts: new Date(r.timestamp).toISOString(),
    solarW: Math.round(r.solar_power),
    loadW: Math.round(r.load_power),
    batteryW: Math.round(r.battery_power),
    gridW: Math.round(r.grid_power),
    socPct: r.percentage_charged,
    gridStatus: r.island_status === "on_grid" ? "connected" : "islanded",
  };
  if (Math.abs(s.solarW + s.batteryW + s.gridW - s.loadW) > 50) {
    console.warn("fleet-api live_status: solar+battery+grid != load (>50 W)");
  }
  return s;
}

const n = z.number();
const historySchema = z.object({
  response: z.object({
    time_series: z.array(
      z.object({
        timestamp: z.string(),
        solar_energy_exported: n,
        total_home_usage: n,
        grid_energy_imported: n,
        grid_energy_exported_from_solar: n,
        grid_energy_exported_from_generator: n,
        grid_energy_exported_from_battery: n,
        battery_energy_exported: n,
        battery_energy_imported_from_grid: n,
        battery_energy_imported_from_solar: n,
        battery_energy_imported_from_generator: n,
      }),
    ),
  }),
});

export function mapCalendarHistory(input: unknown): EnergyInterval[] {
  return historySchema.parse(input).response.time_series.map((t) => ({
    start: new Date(t.timestamp).toISOString(),
    solarWh: t.solar_energy_exported,
    loadWh: t.total_home_usage,
    gridImportWh: t.grid_energy_imported,
    gridExportWh:
      t.grid_energy_exported_from_solar +
      t.grid_energy_exported_from_generator +
      t.grid_energy_exported_from_battery,
    batteryDischargeWh: t.battery_energy_exported,
    batteryChargeWh:
      t.battery_energy_imported_from_grid +
      t.battery_energy_imported_from_solar +
      t.battery_energy_imported_from_generator,
  }));
}
