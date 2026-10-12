import type { DataSource } from "~/lib/core/types";
import type { openDb } from "~/server/db";
import { eq } from "drizzle-orm";
import { siteEvents, sites, tariffSchedule } from "~/server/db/schema";

/** Upserts the site (and its tariff, when present) from the source; returns `sites.id`. */
export async function syncSite(
  db: ReturnType<typeof openDb>,
  source: DataSource,
  externalId: string,
): Promise<number> {
  const info = await source.getSiteInfo(externalId);
  const now = new Date();
  const old = db
    .select()
    .from(sites)
    .where(eq(sites.externalId, externalId))
    .get();
  // A null from Tesla never clears a stored fact.
  const keep = <T>(next: T | null, prev: T | null | undefined) =>
    next ?? prev ?? null;
  const facts = {
    name: info.name,
    timezone: info.timezone,
    usableCapacityWh: info.usableCapacityWh,
    backupReservePct: info.backupReservePct,
    batteryCount: keep(info.batteryCount, old?.batteryCount),
    batteryModel: keep(info.batteryModel, old?.batteryModel),
    maxPowerW: keep(info.maxPowerW, old?.maxPowerW),
    firmware: keep(info.firmware, old?.firmware),
    installedOn: keep(info.installedOn, old?.installedOn),
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

  for (const [kind, was, is, text] of [
    ["firmware", old?.firmware, facts.firmware, `Firmware ${facts.firmware}`],
    [
      "batteries",
      old?.batteryCount,
      facts.batteryCount,
      `Batteries: ${facts.batteryCount}`,
    ],
  ] as const)
    if (was != null && is !== was)
      await db
        .insert(siteEvents)
        .values({ siteId, at: now, kind, text })
        .onConflictDoNothing();

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
