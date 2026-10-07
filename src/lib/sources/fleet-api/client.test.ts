import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.VOLTOPS_SECRET_KEY = "ab".repeat(32);

import { AuthExpired, RateLimited, SourceUnavailable } from "~/lib/core/types";
import { decrypt, encrypt } from "~/lib/crypto";
import { openDb } from "~/server/db";
import { credentials, sites } from "~/server/db/schema";
import { createFleetClient } from "./client";

const BASE = "https://fleet.test";
const SITE = "1234567890";
const fx = (n: string): unknown =>
  JSON.parse(readFileSync(`fixtures/fleet-api/${n}.json`, "utf8"));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const tok = () =>
  json({ access_token: "a", refresh_token: "r", expires_in: 28800 });

let dir: string;
let db: ReturnType<typeof openDb>;
let now: number;
let tokenN: number;
const fetchMock =
  vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>();

const seed = () => {
  const { ciphertext, iv } = encrypt("rt-0");
  db.insert(credentials)
    .values({ id: 1, encryptedRefreshToken: ciphertext, iv })
    .run();
};
const mk = () =>
  createFleetClient({
    fetch: fetchMock as unknown as typeof fetch,
    db,
    now: () => now,
    baseUrl: BASE,
    clientId: "cid",
    clientSecret: "csecret",
  });
const tokenCalls = () =>
  fetchMock.mock.calls.filter(([u]) =>
    String(u).startsWith("https://auth.tesla.com/"),
  );
const apiCalls = () =>
  fetchMock.mock.calls.filter(([u]) => String(u).startsWith(BASE));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "voltops-fleet-"));
  db = openDb(join(dir, "t.db"));
  migrate(db, { migrationsFolder: "drizzle" });
  now = Date.parse("2026-10-05T18:00:00Z");
  tokenN = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation((u) => {
    const url = String(u);
    if (url.startsWith("https://auth.tesla.com/oauth2/v3/token")) {
      tokenN++;
      return Promise.resolve(
        json({
          access_token: `at-${tokenN}`,
          refresh_token: `rt-${tokenN}`,
          expires_in: 28800,
        }),
      );
    }
    if (url.includes("/live_status"))
      return Promise.resolve(json(fx("live_status")));
    if (url.includes("/calendar_history"))
      return Promise.resolve(json(fx("calendar_history_energy")));
    return Promise.resolve(json({}, 404));
  });
});
afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("fleet client", () => {
  it("is a fleet-api DataSource", () => {
    expect(mk().id).toBe("fleet-api");
  });

  it("refreshes the token with Basic auth, then GETs live_status with Bearer", async () => {
    seed();
    const s = await mk().getLiveStatus(SITE);
    expect(s.solarW).toBe(5469);
    const [tUrl, tInit] = tokenCalls()[0]!;
    expect(String(tUrl)).toBe("https://auth.tesla.com/oauth2/v3/token");
    expect(tInit!.method).toBe("POST");
    const h = new Headers(tInit!.headers);
    expect(h.get("authorization")).toBe(
      `Basic ${Buffer.from("cid:csecret").toString("base64")}`,
    );
    const body = new URLSearchParams((tInit!.body as URLSearchParams).toString());
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-0");
    const [aUrl, aInit] = apiCalls()[0]!;
    expect(String(aUrl)).toBe(`${BASE}/api/1/energy_sites/${SITE}/live_status`);
    expect(new Headers(aInit!.headers).get("authorization")).toBe(
      "Bearer at-1",
    );
  });

  it("stores the rotated refresh token encrypted and the expiry", async () => {
    seed();
    await mk().getLiveStatus(SITE);
    const row = db
      .select()
      .from(credentials)
      .where(eq(credentials.id, 1))
      .get()!;
    expect(row.encryptedRefreshToken).not.toContain("rt-1");
    expect(decrypt(row.encryptedRefreshToken, row.iv)).toBe("rt-1");
    expect(row.accessTokenExpiresAt!.getTime()).toBe(now + 28800 * 1000);
  });

  it("caches the access token while >= 5 min of life remain", async () => {
    seed();
    const c = mk();
    await c.getLiveStatus(SITE);
    now += 28800 * 1000 - 6 * 60_000;
    await c.getLiveStatus(SITE);
    expect(tokenCalls()).toHaveLength(1);
    expect(apiCalls()).toHaveLength(2);
  });

  it("refreshes again when < 5 min of life remain", async () => {
    seed();
    const c = mk();
    await c.getLiveStatus(SITE);
    now += 28800 * 1000 - 4 * 60_000;
    await c.getLiveStatus(SITE);
    expect(tokenCalls()).toHaveLength(2);
    expect(new Headers(apiCalls()[1]![1]!.headers).get("authorization")).toBe(
      "Bearer at-2",
    );
    const row = db.select().from(credentials).get()!;
    expect(decrypt(row.encryptedRefreshToken, row.iv)).toBe("rt-2");
  });

  it("shares one in-flight refresh between concurrent callers", async () => {
    seed();
    const c = mk();
    await Promise.all([
      c.getLiveStatus(SITE),
      c.getLiveStatus(SITE),
      c.getLiveStatus(SITE),
    ]);
    expect(tokenCalls()).toHaveLength(1);
    expect(apiCalls()).toHaveLength(3);
  });

  it("rolls back when the refresh fails (credentials unchanged, lock released)", async () => {
    seed();
    const before = db.select().from(credentials).get()!;
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(json({ error: "invalid_grant" }, 400)),
    );
    await expect(mk().getLiveStatus(SITE)).rejects.toBeInstanceOf(AuthExpired);
    expect(db.select().from(credentials).get()).toEqual(before);
    await expect(mk().getLiveStatus(SITE)).resolves.toBeDefined();
  });

  it("getHistory builds the calendar_history query and maps the result", async () => {
    seed();
    const r = await mk().getHistory(SITE, {
      start_date: "2026-10-04T00:00:00-07:00",
      end_date: "2026-10-04T23:59:59-07:00",
      time_zone: "America/Los_Angeles",
    });
    expect(r).toHaveLength(288);
    const u = new URL(String(apiCalls()[0]![0]));
    expect(u.pathname).toBe(`/api/1/energy_sites/${SITE}/calendar_history`);
    expect(Object.fromEntries(u.searchParams)).toEqual({
      kind: "energy",
      period: "day",
      start_date: "2026-10-04T00:00:00-07:00",
      end_date: "2026-10-04T23:59:59-07:00",
      time_zone: "America/Los_Angeles",
    });
  });

  describe("errors", () => {
    it("no credentials row -> AuthExpired('No Tesla credentials stored')", async () => {
      const e = await mk()
        .getLiveStatus(SITE)
        .catch((x: unknown) => x);
      expect(e).toBeInstanceOf(AuthExpired);
      expect((e as Error).message).toContain("No Tesla credentials stored");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([400, 401])("refresh %i -> AuthExpired", async (st) => {
      seed();
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve(json({ error: "bad" }, st)),
      );
      await expect(mk().getLiveStatus(SITE)).rejects.toBeInstanceOf(
        AuthExpired,
      );
    });

    it.each([
      [401, AuthExpired],
      [429, RateLimited],
      [500, SourceUnavailable],
    ])("API %i maps to the typed error", async (st, Cls) => {
      seed();
      fetchMock.mockImplementation((u) =>
        Promise.resolve(
          String(u).startsWith(BASE) ? json({ error: "x" }, st) : tok(),
        ),
      );
      await expect(mk().getLiveStatus(SITE)).rejects.toBeInstanceOf(Cls);
    });

    it("network failure -> SourceUnavailable", async () => {
      seed();
      fetchMock.mockImplementation((u) =>
        String(u).startsWith(BASE)
          ? Promise.reject(new Error("ECONNRESET"))
          : Promise.resolve(tok()),
      );
      await expect(mk().getLiveStatus(SITE)).rejects.toBeInstanceOf(
        SourceUnavailable,
      );
    });

    it("error classes extend Error and set name", () => {
      expect(new AuthExpired("x").name).toBe("AuthExpired");
      expect(new RateLimited("x").name).toBe("RateLimited");
      expect(new SourceUnavailable("x").name).toBe("SourceUnavailable");
      expect(new RateLimited("x")).toBeInstanceOf(Error);
    });

    it("messages carry status and Tesla error string but never body, tokens or site id", async () => {
      seed();
      fetchMock.mockImplementation((u) =>
        Promise.resolve(
          String(u).startsWith(BASE)
            ? json(
                { error: "boom_reason", secret: "BODY-LEAK", detail: "at-LEAK" },
                500,
              )
            : json({
                access_token: "at-LEAK",
                refresh_token: "rt-LEAK",
                expires_in: 28800,
              }),
        ),
      );
      const e = (await mk()
        .getLiveStatus(SITE)
        .catch((x: unknown) => x)) as Error;
      expect(e.message).toContain("500");
      expect(e.message).toContain("boom_reason");
      expect(e.message).not.toContain(SITE);
      expect(e.message).not.toContain("LEAK");
      expect(e.message).not.toContain("rt-0");
    });
  });

  describe("hardening (B010)", () => {
    const TOKEN = "https://auth.tesla.com/oauth2/v3/token";
    // Hold the token POST on a deferred promise; returns the release fn.
    const holdRefresh = () => {
      let release!: (r: Response) => void;
      const gate = new Promise<Response>((r) => (release = r));
      fetchMock.mockImplementation((u) => {
        const url = String(u);
        if (url.startsWith(TOKEN)) return gate;
        if (url.includes("/live_status"))
          return Promise.resolve(json(fx("live_status")));
        return Promise.resolve(json({}, 404));
      });
      return release;
    };
    const externalIds = () =>
      db
        .select()
        .from(sites)
        .all()
        .map((r) => r.externalId);

    it("a shared-db write during an in-flight refresh survives a failed refresh", async () => {
      seed();
      const release = holdRefresh();
      const p = mk()
        .getLiveStatus(SITE)
        .catch((x: unknown) => x);
      await vi.waitFor(() => expect(tokenCalls()).toHaveLength(1));
      db.insert(sites)
        .values({ source: "fleet-api", externalId: "during-refresh" })
        .run();
      release(json({ error: "invalid_grant" }, 400));
      expect(await p).toBeInstanceOf(AuthExpired);
      expect(externalIds()).toEqual(["during-refresh"]);
    });

    it("the shared db can run db.transaction() during an in-flight refresh", async () => {
      seed();
      const release = holdRefresh();
      const p = mk().getLiveStatus(SITE);
      await vi.waitFor(() => expect(tokenCalls()).toHaveLength(1));
      expect(() =>
        db.transaction((tx) => {
          tx.insert(sites)
            .values({ source: "fleet-api", externalId: "in-tx" })
            .run();
        }),
      ).not.toThrow();
      release(tok());
      await p;
      expect(externalIds()).toEqual(["in-tx"]);
    });

    it("after an API 401 the next call refreshes again", async () => {
      seed();
      let apiN = 0;
      fetchMock.mockImplementation((u) => {
        if (String(u).startsWith(TOKEN)) {
          tokenN++;
          return Promise.resolve(
            json({
              access_token: `at-${tokenN}`,
              refresh_token: `rt-${tokenN}`,
              expires_in: 28800,
            }),
          );
        }
        return Promise.resolve(
          ++apiN === 1
            ? json({ error: "token_expired" }, 401)
            : json(fx("live_status")),
        );
      });
      const c = mk();
      await expect(c.getLiveStatus(SITE)).rejects.toBeInstanceOf(AuthExpired);
      await expect(c.getLiveStatus(SITE)).resolves.toBeDefined();
      expect(tokenCalls()).toHaveLength(2);
      expect(new Headers(apiCalls()[1]![1]!.headers).get("authorization")).toBe(
        "Bearer at-2",
      );
    });
  });
});
