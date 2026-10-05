import { sql } from "drizzle-orm";
import { check, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
