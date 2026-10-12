import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthExpired,
  type DataSource,
  type EnergyInterval,
} from "~/lib/core/types";
import { addDays, localMidnight } from "~/lib/time";
import { openDb } from "~/server/db";
import * as schema from "~/server/db/schema";
import { backfillState, backfillStep, firstSite } from "./backfill";
import type { Deps } from "./jobs";

// B038 contract assumed from SPEC Rev 4 + the brief (names not spelled out there):
//   backfillStep(deps: { db, source, fetch, now }, site, limits): Promise<void>   (throws on source error)
//   backfillState(db, site, limits, now: number): { state, daysDone, daysTotal }   (synchronous)
//   limits = the parsed env: { TESLA_BACKFILL_MAX_PER_MONTH, TESLA_MONTHLY_REQUEST_CAP }
//   schema: sites.installedOn / backfillFrom / backfillCursor, fleetRequests { month, total, backfill }

const TZ = "America/Los_Angeles";
const FIVE_MIN = 300_000;
// 2026-10-05 11:00 PDT; UTC month 2026-10, site-local today 2026-10-05
const NOW = Date.UTC(2026, 9, 5, 18, 0, 0);
const MONTH = "2026-10";
const FROM = "2026-09-27"; // today - 8
const INSTALLED = "2026-09-18"; // 10 days: 09-18 .. 09-27

const lim = (max = 2500, cap = 4500) => ({
  TESLA_BACKFILL_MAX_PER_MONTH: max,
  TESLA_MONTHLY_REQUEST_CAP: cap,
});

let dir: string;
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "voltops-backfill-"));
  db = openDb(join(dir, "test.db"));
  migrate(db, { migrationsFolder: "drizzle" });
});
afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

function addSite(o: Partial<typeof schema.sites.$inferInsert> = {}) {
  return db
    .insert(schema.sites)
    .values({
      source: "fleet-api",
      externalId: "EXT-SECRET-1",
      timezone: TZ,
      installedOn: INSTALLED,
      ...o,
    })
    .returning()
    .get();
}
const reload = (id: number) =>
  db.select().from(schema.sites).where(eq(schema.sites.id, id)).get()!;

type Range = { start_date: string; end_date: string; time_zone: string };
/**
 * A source whose getHistory returns a full day (288 intervals) for the requested day.
 * Like the real fleet client it bumps fleet_requests.total for each call, unless
 * `billed` is false (a token-refresh failure never reaches the Fleet API).
 */
function fakeSource(
  getHistory?: (id: string, r: Range) => Promise<EnergyInterval[]>,
  billed = true,
) {
  const calls: Range[] = [];
  const source: DataSource = {
    id: "fleet-api",
    listSites: () => Promise.resolve([]),
    getSiteInfo: () => Promise.reject(new Error("unused")),
    getLiveStatus: () => Promise.reject(new Error("unused")),
    getHistory: vi.fn((id: string, r: Range) => {
      calls.push(r);
      if (billed) bumpTotal();
      if (getHistory) return getHistory(id, r);
      const start = localMidnight(r.start_date.slice(0, 10), TZ);
      return Promise.resolve(
        Array.from({ length: 288 }, (_, i) => ({
          start: new Date(start + i * FIVE_MIN).toISOString(),
          solarWh: 1,
          loadWh: 1,
          gridImportWh: 1,
          gridExportWh: 1,
          batteryChargeWh: 1,
          batteryDischargeWh: 1,
        })),
      );
    }),
  };
  return { source, calls };
}
function bumpTotal() {
  db.insert(schema.fleetRequests)
    .values({ month: MONTH, total: 1 })
    .onConflictDoUpdate({
      target: schema.fleetRequests.month,
      set: { total: sql`${schema.fleetRequests.total} + 1` },
    })
    .run();
}
const noFetch = vi.fn(() =>
  Promise.reject(new Error("no network in tests")),
) as unknown as typeof fetch;
const step = async (source: DataSource, limits = lim(), now = NOW) => {
  const deps: Deps = { db, source, fetch: noFetch, now };
  const site = firstSite(db);
  if (site) await backfillStep(deps, site, limits);
};
const requested = (calls: Range[]) =>
  calls.map((c) => c.start_date.slice(0, 10));

function fillDay(siteId: number, date: string, n = 288) {
  const start = localMidnight(date, TZ);
  db.insert(schema.energyIntervals)
    .values(
      Array.from({ length: n }, (_, i) => ({
        siteId,
        start: new Date(start + i * FIVE_MIN),
        solarWh: 1,
        loadWh: 1,
        gridImportWh: 1,
        gridExportWh: 1,
        batteryChargeWh: 1,
        batteryDischargeWh: 1,
      })),
    )
    .run();
}
const setBudget = (month: string, total: number, backfill: number) =>
  db.insert(schema.fleetRequests).values({ month, total, backfill }).run();
const budgetRow = (month = MONTH) =>
  db
    .select()
    .from(schema.fleetRequests)
    .where(eq(schema.fleetRequests.month, month))
    .get();
const startAt = (id: number, cursor: string) =>
  db
    .update(schema.sites)
    .set({ backfillFrom: FROM, backfillCursor: cursor })
    .where(eq(schema.sites.id, id))
    .run();

describe("backfillStep", () => {
  it("first run: initialises from/cursor to today - 8, makes exactly 1 request for that day, steps the cursor back", async () => {
    const site = addSite();
    const { source, calls } = fakeSource();
    await step(source);
    expect(requested(calls)).toEqual([FROM]);
    expect(calls[0]!.time_zone).toBe(TZ);
    const after = reload(site.id);
    expect(after.backfillFrom).toBe(FROM);
    expect(after.backfillCursor).toBe("2026-09-26");
    expect(budgetRow()?.backfill).toBe(1);
  });

  it("stores the fetched day's intervals", async () => {
    const site = addSite();
    await step(fakeSource().source);
    const n = db
      .select()
      .from(schema.energyIntervals)
      .where(eq(schema.energyIntervals.siteId, site.id))
      .all().length;
    expect(n).toBe(288);
  });

  it("makes at most 1 request per call even when many days are missing, one day per call", async () => {
    const site = addSite();
    const { source, calls } = fakeSource();
    await step(source);
    expect(calls).toHaveLength(1);
    await step(source);
    expect(calls).toHaveLength(2);
    expect(requested(calls)).toEqual([FROM, "2026-09-26"]);
    expect(reload(site.id).backfillCursor).toBe("2026-09-25");
    expect(budgetRow()?.backfill).toBe(2);
  });

  it("skips complete days without a request or a counter increment", async () => {
    const site = addSite();
    fillDay(site.id, FROM);
    fillDay(site.id, "2026-09-26");
    const { source, calls } = fakeSource();
    await step(source);
    expect(requested(calls)).toEqual(["2026-09-25"]);
    expect(reload(site.id).backfillCursor).toBe("2026-09-24");
    expect(budgetRow()?.backfill).toBe(1);
  });

  it("an incomplete (partial) day is still requested", async () => {
    const site = addSite();
    fillDay(site.id, FROM, 100);
    const { source, calls } = fakeSource();
    await step(source);
    expect(requested(calls)).toEqual([FROM]);
  });

  it("all days complete: walks past installed_on with no request and is done", async () => {
    const site = addSite();
    for (let d = INSTALLED; d <= FROM; d = addDays(d, 1)) fillDay(site.id, d);
    const { source, calls } = fakeSource();
    await step(source);
    expect(calls).toHaveLength(0);
    expect(reload(site.id).backfillCursor).toBe(addDays(INSTALLED, -1));
    expect(budgetRow()?.backfill ?? 0).toBe(0);
    const st = backfillState(db, reload(site.id), lim(), NOW);
    expect(st.state).toBe("done");
  });

  it("walks the whole install, one request per call, then done; a fresh call (restart) makes no request", async () => {
    const site = addSite();
    const { source, calls } = fakeSource();
    for (let i = 0; i < 10; i++) await step(source);
    expect(requested(calls)).toEqual(
      Array.from({ length: 10 }, (_, i) => addDays(FROM, -i)),
    );
    expect(reload(site.id).backfillCursor).toBe("2026-09-17");
    // 11th call: cursor < installed_on, done, no request
    await step(source);
    expect(calls).toHaveLength(10);
    // "restart": brand new source, same DB
    const again = fakeSource();
    await step(again.source);
    await step(again.source);
    expect(again.calls).toHaveLength(0);
    const st = backfillState(db, reload(site.id), lim(), NOW);
    expect(st).toEqual({ state: "done", daysDone: 10, daysTotal: 10 });
  });

  it("done stays done even with the budget exhausted (done wins over paused-budget)", async () => {
    const site = addSite();
    startAt(site.id, "2026-09-17");
    setBudget(MONTH, 4500, 2500);
    const { source, calls } = fakeSource();
    await step(source);
    expect(calls).toHaveLength(0);
    expect(backfillState(db, reload(site.id), lim(), NOW).state).toBe("done");
  });

  describe("budget", () => {
    it("backfill >= MAX: no request, cursor unchanged, paused-budget", async () => {
      const site = addSite();
      startAt(site.id, "2026-09-25");
      setBudget(MONTH, 100, 2500);
      const { source, calls } = fakeSource();
      await step(source);
      expect(calls).toHaveLength(0);
      expect(reload(site.id).backfillCursor).toBe("2026-09-25");
      expect(budgetRow()).toMatchObject({ total: 100, backfill: 2500 });
      expect(backfillState(db, reload(site.id), lim(), NOW).state).toBe(
        "paused-budget",
      );
    });

    it("total >= CAP: no request, cursor unchanged, paused-budget", async () => {
      const site = addSite();
      startAt(site.id, "2026-09-25");
      setBudget(MONTH, 4500, 0);
      const { source, calls } = fakeSource();
      await step(source);
      expect(calls).toHaveLength(0);
      expect(reload(site.id).backfillCursor).toBe("2026-09-25");
      expect(backfillState(db, reload(site.id), lim(), NOW).state).toBe(
        "paused-budget",
      );
    });

    it("one below each cap still makes a request", async () => {
      const site = addSite();
      startAt(site.id, "2026-09-25");
      setBudget(MONTH, 4499, 2499);
      const { source, calls } = fakeSource();
      await step(source);
      expect(requested(calls)).toEqual(["2026-09-25"]);
      expect(budgetRow()?.backfill).toBe(2500);
      // now at MAX: next call is paused
      await step(source);
      expect(calls).toHaveLength(1);
    });

    it("limits come from the argument (custom small MAX and CAP)", async () => {
      const site = addSite();
      startAt(site.id, "2026-09-25");
      setBudget(MONTH, 5, 3);
      const { source, calls } = fakeSource();
      await step(source, lim(3, 4500));
      await step(source, lim(2500, 5));
      expect(calls).toHaveLength(0);
      await step(source, lim(4, 6));
      expect(calls).toHaveLength(1);
    });

    it("a new UTC month resumes", async () => {
      const site = addSite();
      startAt(site.id, "2026-09-25");
      setBudget("2026-09", 4500, 2500);
      const { source, calls } = fakeSource();
      await step(source); // NOW is in 2026-10, last month's rows don't count
      expect(requested(calls)).toEqual(["2026-09-25"]);
      expect(budgetRow()?.backfill).toBe(1);
      expect(budgetRow("2026-09")).toMatchObject({
        total: 4500,
        backfill: 2500,
      });
    });

    it("the month is UTC, not site-local: 2026-10-01 00:30Z is October though it is still Sept 30 in PDT", async () => {
      const site = addSite();
      startAt(site.id, "2026-09-20");
      setBudget("2026-09", 4500, 2500);
      const { source, calls } = fakeSource();
      await step(source, lim(), Date.UTC(2026, 9, 1, 0, 30));
      expect(calls).toHaveLength(1);
      expect(budgetRow("2026-10")?.backfill).toBe(1);
    });
  });

  describe("off", () => {
    it("MAX = 0: no request, no state change, state off", async () => {
      const site = addSite();
      const { source, calls } = fakeSource();
      await step(source, lim(0));
      expect(calls).toHaveLength(0);
      expect(reload(site.id).backfillCursor).toBeNull();
      expect(budgetRow()).toBeUndefined();
      expect(backfillState(db, reload(site.id), lim(0), NOW).state).toBe("off");
    });

    it("no installed_on: no request, state off", async () => {
      const site = addSite({ installedOn: null });
      const { source, calls } = fakeSource();
      await step(source);
      expect(calls).toHaveLength(0);
      expect(backfillState(db, reload(site.id), lim(), NOW).state).toBe("off");
    });

    it("no sites: no request, no throw", async () => {
      const { source, calls } = fakeSource();
      await step(source);
      expect(calls).toHaveLength(0);
    });
  });

  it("picks the first fleet-api Site that has installed_on", async () => {
    addSite({ externalId: "no-install", installedOn: null });
    const withInstall = addSite({ externalId: "with-install" });
    const { source, calls } = fakeSource();
    await step(source);
    expect(calls).toHaveLength(1);
    expect(
      (source.getHistory as ReturnType<typeof vi.fn>).mock.calls[0]![0],
    ).toBe("with-install");
    expect(reload(withInstall.id).backfillCursor).toBe("2026-09-26");
  });

  describe("errors", () => {
    const boom = () => Promise.reject(new Error("boom"));
    const attempts = async (source: DataSource, n: number) => {
      for (let i = 0; i < n; i++) await step(source).catch(() => undefined);
    };

    it("a billed 404 propagates, leaves the cursor and counts toward backfill", async () => {
      const site = addSite();
      startAt(site.id, "2026-09-25");
      const { source, calls } = fakeSource(boom);
      await expect(step(source)).rejects.toThrow("boom");
      expect(calls).toHaveLength(1);
      expect(reload(site.id).backfillCursor).toBe("2026-09-25");
      expect(budgetRow()).toMatchObject({ total: 1, backfill: 1 });
    });

    it("a failed token refresh (no Fleet request) is not counted", async () => {
      const site = addSite();
      startAt(site.id, "2026-09-25");
      const { source } = fakeSource(
        () => Promise.reject(new AuthExpired("refresh failed")),
        false,
      );
      await expect(step(source)).rejects.toThrow("refresh failed");
      expect(budgetRow()?.backfill ?? 0).toBe(0);
    });

    it("the next call retries the same day", async () => {
      const site = addSite();
      startAt(site.id, "2026-09-25");
      const bad = fakeSource(boom);
      await expect(step(bad.source)).rejects.toThrow("boom");
      const good = fakeSource();
      await step(good.source);
      expect(requested(good.calls)).toEqual(["2026-09-25"]);
      expect(reload(site.id).backfillCursor).toBe("2026-09-24");
    });

    it("3 non-auth failures on one day step the cursor on the 3rd, then the previous day is fetched", async () => {
      const site = addSite();
      startAt(site.id, "2026-09-25");
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const bad = fakeSource(boom);
      await attempts(bad.source, 2);
      expect(reload(site.id).backfillCursor).toBe("2026-09-25");
      await expect(step(bad.source)).rejects.toThrow("boom");
      expect(reload(site.id).backfillCursor).toBe("2026-09-24");
      expect(warn).toHaveBeenCalledWith(
        "[worker] backfill skipped a day after 3 failures",
      );
      const good = fakeSource();
      await step(good.source);
      expect(requested(good.calls)).toEqual(["2026-09-24"]);
      warn.mockRestore();
    });

    it("AuthExpired never steps the cursor, however often it repeats", async () => {
      const site = addSite();
      startAt(site.id, "2026-09-25");
      const { source } = fakeSource(
        () => Promise.reject(new AuthExpired("expired")),
        false,
      );
      await attempts(source, 4);
      expect(reload(site.id).backfillCursor).toBe("2026-09-25");
    });

    it("with MAX = 2 a permanently failing day makes at most 2 attempts in the month", async () => {
      const site = addSite();
      startAt(site.id, "2026-09-25");
      const { source, calls } = fakeSource(boom);
      for (let i = 0; i < 5; i++)
        await step(source, lim(2)).catch(() => undefined);
      expect(calls).toHaveLength(2);
      expect(budgetRow()?.backfill).toBe(2);
    });
  });
});
describe("backfillState", () => {
  it("before the first run: running with 0 of 0", () => {
    const site = addSite();
    expect(backfillState(db, site, lim(), NOW)).toEqual({
      state: "running",
      daysDone: 0,
      daysTotal: 0,
    });
  });

  it("10-day install: daysTotal 10, daysDone follows the cursor", () => {
    const site = addSite();
    startAt(site.id, FROM); // nothing fetched yet
    expect(backfillState(db, reload(site.id), lim(), NOW)).toEqual({
      state: "running",
      daysDone: 0,
      daysTotal: 10,
    });
    startAt(site.id, "2026-09-22"); // 09-27 .. 09-23 done = 5 days
    expect(backfillState(db, reload(site.id), lim(), NOW)).toEqual({
      state: "running",
      daysDone: 5,
      daysTotal: 10,
    });
    startAt(site.id, "2026-09-17");
    expect(backfillState(db, reload(site.id), lim(), NOW)).toEqual({
      state: "done",
      daysDone: 10,
      daysTotal: 10,
    });
  });

  it("paused-budget keeps the counts", () => {
    const site = addSite();
    startAt(site.id, "2026-09-22");
    setBudget(MONTH, 0, 2500);
    expect(backfillState(db, reload(site.id), lim(), NOW)).toEqual({
      state: "paused-budget",
      daysDone: 5,
      daysTotal: 10,
    });
  });

  it("paused by the monthly cap too", () => {
    const site = addSite();
    startAt(site.id, "2026-09-22");
    setBudget(MONTH, 4500, 0);
    expect(backfillState(db, reload(site.id), lim(), NOW).state).toBe(
      "paused-budget",
    );
  });

  it("off when MAX = 0 or installed_on is missing", () => {
    const a = addSite();
    expect(backfillState(db, a, lim(0), NOW).state).toBe("off");
    const b = addSite({ externalId: "b", installedOn: null });
    expect(backfillState(db, b, lim(), NOW).state).toBe("off");
  });

  it("is a pure read: no writes and no requests", () => {
    const site = addSite();
    backfillState(db, site, lim(), NOW);
    expect(reload(site.id).backfillCursor).toBeNull();
    expect(budgetRow()).toBeUndefined();
  });
});
