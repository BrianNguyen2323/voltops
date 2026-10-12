import { eq, sql } from "drizzle-orm";
import { addDays, localDate } from "~/lib/time";
import type { openDb } from "~/server/db";
import * as s from "~/server/db/schema";
import { energyHistory } from "~/server/history";
import { dayRange, guarded, type Deps } from "./jobs";

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

const firstSite = (db: Db) =>
  db
    .select()
    .from(s.sites)
    .where(eq(s.sites.source, "fleet-api"))
    .all()
    .find((x) => x.installedOn);

export async function runBackfill(deps: Deps, limits: BackfillLimits) {
  const site = firstSite(deps.db);
  if (site) await guarded("backfill", site, () => backfillStep(deps, limits));
}

/** At most one Tesla request per call; errors propagate with the cursor unchanged. */
export async function backfillStep(
  { db, source, now }: Deps,
  limits: BackfillLimits,
) {
  if (!limits.TESLA_BACKFILL_MAX_PER_MONTH) return;
  const site = firstSite(db);
  const installedOn = site?.installedOn;
  if (!site || !installedOn) return;
  const tz = site.timezone ?? "UTC";
  // syncEnergy owns the last 7 days
  const from = site.backfillFrom ?? addDays(localDate(now, tz), -8);
  let cursor = site.backfillCursor ?? from;
  const history = energyHistory(db, site);
  while (cursor >= installedOn && history.isComplete(cursor))
    cursor = addDays(cursor, -1);
  const save = () =>
    db
      .update(s.sites)
      .set({ backfillFrom: from, backfillCursor: cursor })
      .where(eq(s.sites.id, site.id))
      .run();
  save();
  if (cursor < installedOn || paused(db, limits, now)) return;
  history.putIntervals(
    await source.getHistory(site.externalId, dayRange(cursor, tz)),
  );
  db.insert(s.fleetRequests)
    .values({ month: month(now), backfill: 1 })
    .onConflictDoUpdate({
      target: s.fleetRequests.month,
      set: { backfill: sql`${s.fleetRequests.backfill} + 1` },
    })
    .run();
  cursor = addDays(cursor, -1);
  save();
}
