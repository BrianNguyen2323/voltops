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

export type DataSource = {
  id: "fleet-api" | "local-gateway" | "replay";
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
