export type LiveSample = {
  ts: string;
  solarW: number;
  loadW: number;
  batteryW: number;
  gridW: number;
  socPct: number;
  gridStatus: "connected" | "islanded";
};

export type EnergyInterval = {
  start: string;
  solarWh: number;
  loadWh: number;
  gridImportWh: number;
  gridExportWh: number;
  batteryChargeWh: number;
  batteryDischargeWh: number;
};

export type SiteInfo = {
  name: string | null;
  timezone: string | null;
  usableCapacityWh: number | null;
  backupReservePct: number | null;
  batteryCount: number | null;
  batteryModel: string | null;
  maxPowerW: number | null;
  firmware: string | null;
  /** YYYY-MM-DD */
  installedOn: string | null;
  tariff: {
    id: string;
    name: string | null;
    utility: string | null;
    currency: string | null;
    content: unknown;
  } | null;
};

export type DataSource = {
  id: "fleet-api" | "local-gateway" | "replay";
  /** External ids of energy sites with resource_type "battery", in response order. */
  listSites(): Promise<string[]>;
  getSiteInfo(siteId: string): Promise<SiteInfo>;
  getLiveStatus(siteId: string): Promise<LiveSample>;
  getHistory(
    siteId: string,
    day: { start_date: string; end_date: string; time_zone: string },
  ): Promise<EnergyInterval[]>;
};

export class AuthExpired extends Error {
  override name = "AuthExpired";
}
export class RateLimited extends Error {
  override name = "RateLimited";
}
export class SourceUnavailable extends Error {
  override name = "SourceUnavailable";
}
