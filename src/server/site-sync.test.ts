import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DataSource, SiteInfo } from "~/lib/core/types";
import { mapSiteInfo } from "~/lib/sources/fleet-api/map";
import { openDb } from "~/server/db";
import { sites, tariffSchedule } from "~/server/db/schema";
import { syncSite } from "./site-sync";

const EXT = "ext-1";
const fixtureInfo: SiteInfo = mapSiteInfo(
  JSON.parse(readFileSync("fixtures/fleet-api/site_info.json", "utf8")),
);

let dir: string;
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "voltops-sync-"));
  db = openDb(join(dir, "t.db"));
  migrate(db, { migrationsFolder: "drizzle" });
});
afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

const fake = (info: SiteInfo, id: DataSource["id"] = "fleet-api") => {
  const asked: string[] = [];
  const source = {
    id,
    listSites: () => Promise.resolve([EXT]),
    getSiteInfo: (s: string) => {
      asked.push(s);
      return Promise.resolve(info);
    },
  } as unknown as DataSource;
  return { source, asked };
};
const rows = () => db.select().from(sites).all();
const schedule = (siteId: number) =>
  db
    .select()
    .from(tariffSchedule)
    .where(eq(tariffSchedule.siteId, siteId))
    .get();

describe("syncSite", () => {
  it("inserts the site from getSiteInfo, returns its id", async () => {
    const { source, asked } = fake(fixtureInfo);
    const id = await syncSite(db, source, EXT);
    expect(asked).toEqual([EXT]);
    const [row] = rows();
    expect(rows()).toHaveLength(1);
    expect(id).toBe(row!.id);
    expect(row).toMatchObject({
      source: "fleet-api",
      externalId: EXT,
      name: fixtureInfo.name,
      timezone: fixtureInfo.timezone,
      usableCapacityWh: fixtureInfo.usableCapacityWh,
      backupReservePct: fixtureInfo.backupReservePct,
    });
    expect(row!.createdAt).toBeInstanceOf(Date);
    expect(row!.updatedAt).toBeInstanceOf(Date);
  });

  it("inserts the tariff schedule from the tariff", async () => {
    const id = await syncSite(db, fake(fixtureInfo).source, EXT);
    const t = fixtureInfo.tariff!;
    expect(schedule(id)).toMatchObject({
      tariffId: t.id,
      name: t.name,
      utility: t.utility,
      currency: t.currency,
      content: t.content,
    });
  });

  it("a second sync updates the same row (one row per external id)", async () => {
    const id = await syncSite(db, fake(fixtureInfo).source, EXT);
    const created = rows()[0]!.createdAt;
    const next: SiteInfo = {
      ...fixtureInfo,
      name: "renamed",
      timezone: "Europe/Berlin",
      usableCapacityWh: 1234,
      backupReservePct: 77,
    };
    const id2 = await syncSite(db, fake(next).source, EXT);
    expect(id2).toBe(id);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      name: "renamed",
      timezone: "Europe/Berlin",
      usableCapacityWh: 1234,
      backupReservePct: 77,
    });
    expect(rows()[0]!.createdAt).toEqual(created);
    expect(rows()[0]!.updatedAt!.getTime()).toBeGreaterThanOrEqual(
      created!.getTime(),
    );
  });

  it("different external ids get different rows", async () => {
    const a = await syncSite(db, fake(fixtureInfo).source, "a");
    const b = await syncSite(db, fake(fixtureInfo).source, "b");
    expect(a).not.toBe(b);
    expect(rows()).toHaveLength(2);
  });

  it("replaces the tariff schedule (still one row per site)", async () => {
    const id = await syncSite(db, fake(fixtureInfo).source, EXT);
    const next: SiteInfo = {
      ...fixtureInfo,
      tariff: {
        id: "NEW-ID",
        name: "New plan",
        utility: "New utility",
        currency: "EUR",
        content: { replaced: true },
      },
    };
    await syncSite(db, fake(next).source, EXT);
    expect(db.select().from(tariffSchedule).all()).toHaveLength(1);
    expect(schedule(id)).toMatchObject({
      tariffId: "NEW-ID",
      name: "New plan",
      utility: "New utility",
      currency: "EUR",
      content: { replaced: true },
    });
  });

  it("tariff: null leaves the existing schedule alone", async () => {
    const id = await syncSite(db, fake(fixtureInfo).source, EXT);
    const before = schedule(id);
    await syncSite(db, fake({ ...fixtureInfo, tariff: null }).source, EXT);
    expect(schedule(id)).toEqual(before);
  });

  it("tariff: null on first sync creates no schedule", async () => {
    await syncSite(db, fake({ ...fixtureInfo, tariff: null }).source, EXT);
    expect(db.select().from(tariffSchedule).all()).toHaveLength(0);
  });

  it("never touches latitude, longitude or temperatureUnit", async () => {
    const id = await syncSite(db, fake(fixtureInfo).source, EXT);
    db.update(sites)
      .set({ latitude: 12.5, longitude: -45.25, temperatureUnit: "F" })
      .where(eq(sites.id, id))
      .run();
    await syncSite(db, fake({ ...fixtureInfo, name: "x" }).source, EXT);
    expect(rows()[0]).toMatchObject({
      name: "x",
      latitude: 12.5,
      longitude: -45.25,
      temperatureUnit: "F",
    });
  });

  it("stores source.id as the site source", async () => {
    await syncSite(db, fake(fixtureInfo, "replay").source, EXT);
    expect(rows()[0]!.source).toBe("replay");
  });
});
