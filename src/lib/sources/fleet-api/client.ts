import { eq, sql } from "drizzle-orm";
import { env } from "~/env";
import {
  AuthExpired,
  RateLimited,
  SourceUnavailable,
  type DataSource,
} from "~/lib/core/types";
import { decrypt, encrypt } from "~/lib/crypto";
import { db as defaultDb, type openDb } from "~/server/db";
import { credentials, fleetRequests } from "~/server/db/schema";
import {
  mapCalendarHistory,
  mapLiveStatus,
  mapProducts,
  mapSiteInfo,
} from "./map";

type Deps = {
  fetch: typeof fetch;
  db: ReturnType<typeof openDb>;
  now: () => number;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  sleep?: (ms: number) => Promise<void>;
};

const TOKEN_URL = "https://auth.tesla.com/oauth2/v3/token";
const MIN_LIFE_MS = 5 * 60_000;
const ROW = eq(credentials.id, 1);

export type FleetClient = DataSource & {
  primeToken(value: string, expiresAt: number): void;
};

export function createFleetClient(deps: Deps): FleetClient {
  const { db, now } = deps;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let token: { value: string; expiresAt: number } | undefined;
  let inflight: Promise<string> | undefined;

  // Messages: path template + status + Tesla's `error` string. Never bodies/tokens/site ids.
  async function call(path: string, url: string, init?: RequestInit) {
    let res: Response;
    try {
      res = await deps.fetch(url, init);
    } catch {
      throw new SourceUnavailable(`${path} network failure`);
    }
    // Tesla bills every response below 500, not the token endpoint
    if (res.status < 500 && url !== TOKEN_URL)
      db.insert(fleetRequests)
        .values({ month: new Date(now()).toISOString().slice(0, 7), total: 1 })
        .onConflictDoUpdate({
          target: fleetRequests.month,
          set: { total: sql`${fleetRequests.total} + 1` },
        })
        .run();
    if (res.ok) return res.json() as Promise<unknown>;
    let reason = "";
    try {
      const e = ((await res.json()) as { error?: unknown }).error;
      if (typeof e === "string") reason = `: ${e}`;
    } catch {
      // non-JSON body: ignore
    }
    const msg = `${path} ${res.status}${reason}`;
    if (res.status === 401 && url !== TOKEN_URL) token = undefined;
    if (res.status === 401 || (res.status === 400 && url === TOKEN_URL))
      throw new AuthExpired(msg);
    if (res.status === 429) throw new RateLimited(msg);
    throw new SourceUnavailable(msg);
  }

  const LEASE_MS = 30_000;
  const WAIT_STEP_MS = 250;
  const WAIT_MAX_MS = 35_000;

  // Lease instead of a transaction held across the POST: each DB step is one sync transaction.
  function acquireLease(): string | undefined {
    return db.transaction((tx) => {
      const row = tx.select().from(credentials).where(ROW).get();
      if (!row) throw new AuthExpired("No Tesla credentials stored");
      if (row.refreshLockUntil && row.refreshLockUntil.getTime() > now())
        return undefined;
      tx.update(credentials)
        .set({ refreshLockUntil: new Date(now() + LEASE_MS) })
        .where(ROW)
        .run();
      return decrypt(row.encryptedRefreshToken, row.iv);
    });
  }

  async function refresh(): Promise<string> {
    let refreshToken: string | undefined;
    for (
      let waited = 0;
      !(refreshToken = acquireLease());
      waited += WAIT_STEP_MS
    ) {
      if (waited >= WAIT_MAX_MS)
        throw new SourceUnavailable("token refresh lock timeout");
      await sleep(WAIT_STEP_MS);
    }
    try {
      const basic = Buffer.from(
        `${deps.clientId}:${deps.clientSecret}`,
      ).toString("base64");
      const t = (await call("/oauth2/v3/token", TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: deps.clientId,
        }),
      })) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };
      const { ciphertext, iv } = encrypt(t.refresh_token);
      const expiresAt = now() + t.expires_in * 1000;
      db.update(credentials)
        .set({
          encryptedRefreshToken: ciphertext,
          iv,
          accessTokenExpiresAt: new Date(expiresAt),
          updatedAt: new Date(now()),
          refreshLockUntil: null,
        })
        .where(ROW)
        .run();
      token = { value: t.access_token, expiresAt };
      return t.access_token;
    } catch (e) {
      db.update(credentials).set({ refreshLockUntil: null }).where(ROW).run();
      throw e;
    }
  }

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt - now() >= MIN_LIFE_MS) return token.value;
    return (inflight ??= refresh().finally(() => (inflight = undefined)));
  }
  async function get(site: string, suffix: string, query = "") {
    const tpl = `/api/1/energy_sites/{siteId}/${suffix}`;
    return call(
      tpl,
      `${deps.baseUrl}/api/1/energy_sites/${site}/${suffix}${query}`,
      {
        headers: { Authorization: `Bearer ${await accessToken()}` },
      },
    );
  }

  return {
    id: "fleet-api",
    primeToken(value, expiresAt) {
      token = { value, expiresAt };
    },
    async listSites() {
      return mapProducts(
        await call("/api/1/products", `${deps.baseUrl}/api/1/products`, {
          headers: { Authorization: `Bearer ${await accessToken()}` },
        }),
      );
    },
    async getSiteInfo(siteId) {
      return mapSiteInfo(await get(siteId, "site_info"));
    },
    async getLiveStatus(siteId) {
      return mapLiveStatus(await get(siteId, "live_status"));
    },
    async getHistory(siteId, day) {
      const q = new URLSearchParams({ kind: "energy", period: "day", ...day });
      return mapCalendarHistory(await get(siteId, "calendar_history", `?${q}`));
    },
  };
}

let instance: FleetClient | undefined;
const lazy = () =>
  (instance ??= createFleetClient({
    fetch: (...a) => fetch(...a),
    db: defaultDb,
    now: Date.now,
    baseUrl:
      env.TESLA_FLEET_BASE_URL ?? "https://fleet-api.prd.na.vn.cloud.tesla.com",
    clientId: env.TESLA_CLIENT_ID,
    clientSecret: env.TESLA_CLIENT_SECRET,
  }));

export const fleetClient: FleetClient = {
  id: "fleet-api",
  primeToken: (v, e) => lazy().primeToken(v, e),
  listSites: () => lazy().listSites(),
  getSiteInfo: (s) => lazy().getSiteInfo(s),
  getLiveStatus: (s) => lazy().getLiveStatus(s),
  getHistory: (s, d) => lazy().getHistory(s, d),
};
