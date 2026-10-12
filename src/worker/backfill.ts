import { eq, sql } from "drizzle-orm";
import { AuthExpired, RateLimited } from "~/lib/core/types";
import { addDays, localDate } from "~/lib/time";
import type { openDb } from "~/server/db";
import * as s from "~/server/db/schema";
import { energyHistory } from "~/server/history";
import { dayRange, type Deps } from "./jobs";

type Db = ReturnType<typeof openDb>;
type Site = typeof s.sites.$inferSelect;
export type BackfillLimits = {
  TESLA_BACKFILL_MAX_PER_MONTH: number;
  TESLA_MONTHLY_REQUEST_CAP: number;
};

const month = (now: number) => new Date(now).toISOString().slice(0, 7);
const days = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 864e5;

const paused = (db: Db, l: BackfillLimits, now: number) => {
  const r = db
    .select()
    .from(s.fleetRequests)
    .where(eq(s.fleetRequests.month, month(now)))
    .get();
  return (
    (r?.backfill ?? 0) >= l.TESLA_BACKFILL_MAX_PER_MONTH ||
    (r?.total ?? 0) >= l.TESLA_MONTHLY_REQUEST_CAP
  );
};

/** Pure read. `done` beats `paused-budget`; `off` also covers a Site without installed_on. */
export function backfillState(
  db: Db,
  site: Site,
  limits: BackfillLimits,
  now: number,
) {
  const { installedOn, backfillFrom, backfillCursor } = site;
  if (!limits.TESLA_BACKFILL_MAX_PER_MONTH || !installedOn)
    return { state: "off" as const, daysDone: 0, daysTotal: 0 };
  if (!backfillFrom || !backfillCursor)
    return { state: "running" as const, daysDone: 0, daysTotal: 0 };
  const daysTotal = Math.max(0, days(backfillFrom, installedOn) + 1);
  const daysDone = Math.min(
    daysTotal,
    Math.max(0, days(backfillFrom, backfillCursor)),
  );
  const state =
    backfillCursor < installedOn
      ? ("done" as const)
      : paused(db, limits, now)
        ? ("paused-budget" as const)
        : ("running" as const);
  return { state, daysDone, daysTotal };
}

export const firstSite = (db: Db) =>
  db
    .select()
    .from(s.sites)
    .where(eq(s.sites.source, "fleet-api"))
    .all()
    .find((x) => x.installedOn);

const SKIP_AFTER = 3;
// In memory, per db: a restart resets it. Keyed `${siteId}:${day}`.
const failures = new WeakMap<object, Map<string, number>>();
const fleetTotal = (db: Db, now: number) =>
  db
    .select()
    .from(s.fleetRequests)
    .where(eq(s.fleetRequests.month, month(now)))
    .get()?.total ?? 0;

/**
 * At most one Tesla request per call. Every billed attempt counts toward the
 * backfill budget (the client raised `total`). Errors propagate; the 3rd
 * non-auth failure on one day steps the cursor past it.
 */
export async function backfillStep(
  { db, source, now }: Deps,
  site: Site,
  limits: BackfillLimits,
) {
  const installedOn = site.installedOn;
  if (!limits.TESLA_BACKFILL_MAX_PER_MONTH || !installedOn) return;
  const tz = site.timezone ?? "UTC";
  // syncEnergy owns the last 7 days
  const from = site.backfillFrom ?? addDays(localDate(now, tz), -8);
  let cursor = site.backfillCursor ?? from;
  const history = energyHistory(db, site);
  while (cursor >= installedOn && history.isComplete(cursor))
    cursor = addDays(cursor, -1);
  let saved = { from: site.backfillFrom, cursor: site.backfillCursor };
  const save = () => {
    if (saved.from === from && saved.cursor === cursor) return;
    saved = { from, cursor };
    db.update(s.sites)
      .set({ backfillFrom: from, backfillCursor: cursor })
      .where(eq(s.sites.id, site.id))
      .run();
  };
  save();
  if (cursor < installedOn || paused(db, limits, now)) return;
  const before = fleetTotal(db, now);
  const fails = failures.get(db) ?? new Map<string, number>();
  failures.set(db, fails);
  const key = `${site.id}:${cursor}`;
  try {
    history.putIntervals(
      await source.getHistory(site.externalId, dayRange(cursor, tz)),
    );
    fails.delete(key);
    cursor = addDays(cursor, -1);
    save();
  } catch (e) {
    if (!(e instanceof AuthExpired || e instanceof RateLimited)) {
      const n = (fails.get(key) ?? 0) + 1;
      fails.set(key, n);
      if (n >= SKIP_AFTER) {
        fails.delete(key);
        console.warn("[worker] backfill skipped a day after 3 failures");
        cursor = addDays(cursor, -1);
        save();
      }
    }
    throw e;
  } finally {
    if (fleetTotal(db, now) > before)
      db.insert(s.fleetRequests)
        .values({ month: month(now), backfill: 1 })
        .onConflictDoUpdate({
          target: s.fleetRequests.month,
          set: { backfill: sql`${s.fleetRequests.backfill} + 1` },
        })
        .run();
  }
}
