import { z } from "zod";
import type { EnergyInterval, LiveSample, SiteInfo } from "~/lib/core/types";

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

// First numeric nameplate_energy_watts anywhere under `components` (Wh despite the name).
function findNameplate(v: unknown): number | null {
  if (typeof v !== "object" || !v) return null;
  for (const [k, x] of Object.entries(v)) {
    if (k === "nameplate_energy_watts" && typeof x === "number") return x;
    const r = findNameplate(x);
    if (r !== null) return r;
  }
  return null;
}

const siteInfoSchema = z.object({
  response: z.object({
    site_name: z.string().nullish(),
    installation_time_zone: z.string().nullish(),
    backup_reserve_percent: z.number().nullish(),
    components: z.unknown().optional(),
    tariff_id: z.string().nullish(),
    utility: z.string().nullish(),
    tariff_content: z
      .object({ name: z.string().nullish(), currency: z.string().nullish() })
      .passthrough()
      .nullish(),
  }),
});

export function mapSiteInfo(input: unknown): SiteInfo {
  const r = siteInfoSchema.parse(input).response;
  return {
    name: r.site_name ?? null,
    timezone: r.installation_time_zone ?? null,
    usableCapacityWh: findNameplate(r.components),
    backupReservePct: r.backup_reserve_percent ?? null,
    tariff: r.tariff_id
      ? {
          id: r.tariff_id,
          name: r.tariff_content?.name ?? null,
          utility: r.utility ?? null,
          currency: r.tariff_content?.currency ?? null,
          content: r.tariff_content ?? null,
        }
      : null,
  };
}

const productsSchema = z.object({
  response: z.array(
    z.object({
      resource_type: z.string().optional(),
      energy_site_id: z.union([z.number(), z.string()]).optional(),
    }),
  ),
});

export function mapProducts(input: unknown): string[] {
  return productsSchema
    .parse(input)
    .response.filter(
      (p) => p.resource_type === "battery" && p.energy_site_id !== undefined,
    )
    .map((p) => String(p.energy_site_id));
}
