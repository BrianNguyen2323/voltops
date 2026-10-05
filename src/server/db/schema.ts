import { sql } from "drizzle-orm";
import { index, pgTableCreator, unique } from "drizzle-orm/pg-core";

export const createTable = pgTableCreator((name) => `voltops_${name}`);

// Core user identity — one row per VoltOps account
export const users = createTable(
  "user",
  (d) => ({
    id: d
      .text()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    teslaUserId: d.varchar({ length: 256 }).notNull(),
    email: d.varchar({ length: 256 }).notNull(),
    displayName: d.varchar({ length: 256 }),
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    unique("uq_tesla_user_id").on(t.teslaUserId),
    unique("uq_email").on(t.email),
    index("idx_tesla_user_id").on(t.teslaUserId),
  ],
);

// Physical Powerwall installation linked to a user.
// Separate from users so readings belong to the site, and multiple sites per user are supported.
export const energySites = createTable(
  "energy_site",
  (d) => ({
    id: d
      .text()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teslaEnergySiteId: d.text().notNull(), // Tesla's identifier for this installation
    latitude: d.doublePrecision(),
    longitude: d.doublePrecision(),
    timezone: d.text(),                    // e.g. "America/Los_Angeles" — used for billing hour logic
    city: d.varchar({ length: 256 }),
    state: d.varchar({ length: 128 }),
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    unique("uq_tesla_energy_site_id").on(t.teslaEnergySiteId),
    index("idx_energy_site_user_id").on(t.userId),
  ],
);

// TOU tariff schedule fetched from Tesla site_info at login.
// Stored as JSONB so the full seasonal rate and period structure is queryable without
// flattening a complex nested object into columns.
export const tariffSchedules = createTable(
  "tariff_schedule",
  (d) => ({
    id: d
      .text()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    energySiteId: d
      .text()
      .notNull()
      .references(() => energySites.id, { onDelete: "cascade" }),
    tariffId: d.varchar({ length: 128 }),
    tariffName: d.varchar({ length: 256 }),
    utility: d.varchar({ length: 256 }),
    currency: d.varchar({ length: 16 }),
    tariffContent: d.jsonb(),
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    unique("uq_tariff_energy_site").on(t.energySiteId),
    index("idx_tariff_energy_site_id").on(t.energySiteId),
  ],
);

// Tesla OAuth credentials — encrypted at the application layer before insert
export const teslaTokens = createTable(
  "tesla_token",
  (d) => ({
    id: d
      .text()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    encryptedRefreshToken: d.text().notNull(),
    iv: d.varchar({ length: 64 }).notNull(),
    scope: d.text(),
    accessTokenExpiresAt: d.timestamp({ withTimezone: true }),
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    unique("uq_user_token").on(t.userId),
    index("idx_token_user_id").on(t.userId),
  ],
);
