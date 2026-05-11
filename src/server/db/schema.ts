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
