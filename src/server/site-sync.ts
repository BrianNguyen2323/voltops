import type { DataSource } from "~/lib/core/types";
import type { openDb } from "~/server/db";
import { sites, tariffSchedule } from "~/server/db/schema";

/** Upserts the site (and its tariff, when present) from the source; returns `sites.id`. */
export async function syncSite(
  db: ReturnType<typeof openDb>,
  source: DataSource,
  externalId: string,
): Promise<number> {
  const info = await source.getSiteInfo(externalId);
  const now = new Date();
  const facts = {
    name: info.name,
    timezone: info.timezone,
    usableCapacityWh: info.usableCapacityWh,
    backupReservePct: info.backupReservePct,
  };
  const [row] = await db
    .insert(sites)
    .values({
      source: source.id,
      externalId,
      ...facts,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: sites.externalId,
      set: { source: source.id, ...facts, updatedAt: now },
    })
    .returning({ id: sites.id });
  const siteId = row!.id;

  const t = info.tariff;
  if (t) {
    const set = {
      tariffId: t.id,
      name: t.name,
      utility: t.utility,
      currency: t.currency,
      content: t.content,
      updatedAt: now,
    };
    await db
      .insert(tariffSchedule)
      .values({ siteId, ...set })
      .onConflictDoUpdate({ target: tariffSchedule.siteId, set });
  }
  return siteId;
}
