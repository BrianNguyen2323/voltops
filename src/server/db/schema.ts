import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

// Single owner: one admin row, one Tesla credential row (id pinned to 1).
export const admin = sqliteTable(
  "admin",
  {
    id: integer().primaryKey(),
    passwordHash: text("password_hash").notNull(),
    createdAt: ts("created_at"),
  },
  (t) => [check("admin_single_row", sql`${t.id} = 1`)],
);

// Refresh token is AES-256-GCM encrypted by the app before insert.
export const credentials = sqliteTable(
  "credentials",
  {
    id: integer().primaryKey(),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    iv: text().notNull(),
    scope: text(),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    updatedAt: ts("updated_at"),
    refreshLockUntil: ts("refresh_lock_until"),
  },
  (t) => [check("credentials_single_row", sql`${t.id} = 1`)],
);

export const sites = sqliteTable("sites", {
  id: integer().primaryKey({ autoIncrement: true }),
  source: text().notNull(),
  externalId: text("external_id").notNull().unique(),
  name: text(),
  timezone: text(),
  latitude: real(),
  longitude: real(),
  usableCapacityWh: integer("usable_capacity_wh"),
  backupReservePct: integer("backup_reserve_pct"),
  temperatureUnit: text("temperature_unit"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const tariffSchedule = sqliteTable("tariff_schedule", {
  siteId: integer("site_id")
    .primaryKey()
    .references(() => sites.id, { onDelete: "cascade" }),
  tariffId: text("tariff_id"),
  name: text(),
  utility: text(),
  currency: text(),
  content: text({ mode: "json" }),
  updatedAt: ts("updated_at"),
});

const siteFk = () =>
  integer("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" });
const int = (name: string) => integer(name).notNull();
const rl = (name: string) => real(name).notNull();

export const energyIntervals = sqliteTable(
  "energy_intervals",
  {
    siteId: siteFk(),
    start: ts("start").notNull(),
    solarWh: int("solar_wh"),
    loadWh: int("load_wh"),
    gridImportWh: int("grid_import_wh"),
    gridExportWh: int("grid_export_wh"),
    batteryChargeWh: int("battery_charge_wh"),
    batteryDischargeWh: int("battery_discharge_wh"),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.start] })],
);

export const samples = sqliteTable(
  "samples",
  {
    siteId: siteFk(),
    ts: ts("ts").notNull(),
    solarW: int("solar_w"),
    loadW: int("load_w"),
    batteryW: int("battery_w"),
    gridW: int("grid_w"),
    socPct: rl("soc_pct"),
    gridStatus: text("grid_status").notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.ts] })],
);

export const weatherObserved = sqliteTable(
  "weather_observed",
  {
    siteId: siteFk(),
    hour: ts("hour").notNull(),
    tempC: rl("temp_c"),
    cloudPct: rl("cloud_pct"),
    ghiWm2: rl("ghi_wm2"),
    precipMm: rl("precip_mm"),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.hour] })],
);

export const weatherForecast = sqliteTable(
  "weather_forecast",
  {
    siteId: siteFk(),
    issuedAt: ts("issued_at").notNull(),
    hour: ts("hour").notNull(),
    tempC: rl("temp_c"),
    cloudPct: rl("cloud_pct"),
    ghiWm2: rl("ghi_wm2"),
    precipMm: rl("precip_mm"),
    precipProbPct: rl("precip_prob_pct"),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.issuedAt, t.hour] })],
);

export const siteEvents = sqliteTable(
  "site_events",
  {
    siteId: siteFk(),
    at: ts("at").notNull(),
    kind: text().notNull(),
    text: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.at, t.kind] })],
);

export const fleetRequests = sqliteTable("fleet_requests", {
  month: text().primaryKey(),
  total: integer().notNull().default(0),
  backfill: integer().notNull().default(0),
});
