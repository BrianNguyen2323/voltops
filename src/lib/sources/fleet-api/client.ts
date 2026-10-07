import { eq } from "drizzle-orm";
import { env } from "~/env";
import {
  AuthExpired,
  RateLimited,
  SourceUnavailable,
  type DataSource,
} from "~/lib/core/types";
import { decrypt, encrypt } from "~/lib/crypto";
import { db as defaultDb, type openDb } from "~/server/db";
import { credentials } from "~/server/db/schema";
import { mapCalendarHistory, mapLiveStatus } from "./map";

type Deps = {
  fetch: typeof fetch;
  db: ReturnType<typeof openDb>;
  now: () => number;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

const TOKEN_URL = "https://auth.tesla.com/oauth2/v3/token";
const MIN_LIFE_MS = 5 * 60_000;

export function createFleetClient(deps: Deps): DataSource {
  const { db, now } = deps;
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
    if (res.ok) return res.json() as Promise<unknown>;
    let reason = "";
    try {
      const e = ((await res.json()) as { error?: unknown }).error;
      if (typeof e === "string") reason = `: ${e}`;
    } catch {
      // non-JSON body: ignore
    }
    const msg = `${path} ${res.status}${reason}`;
    if (res.status === 401 || (res.status === 400 && url === TOKEN_URL))
      throw new AuthExpired(msg);
    if (res.status === 429) throw new RateLimited(msg);
    throw new SourceUnavailable(msg);
  }

  async function refresh(): Promise<string> {
    db.$client.exec("BEGIN IMMEDIATE");
    try {
      const row = db
        .select()
        .from(credentials)
        .where(eq(credentials.id, 1))
        .get();
      if (!row) throw new AuthExpired("No Tesla credentials stored");
      const basic = Buffer.from(`${deps.clientId}:${deps.clientSecret}`).toString("base64");
      const t = (await call("/oauth2/v3/token", TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: decrypt(row.encryptedRefreshToken, row.iv),
          client_id: deps.clientId,
        }),
      })) as { access_token: string; refresh_token: string; expires_in: number };
      const { ciphertext, iv } = encrypt(t.refresh_token);
      const expiresAt = now() + t.expires_in * 1000;
      db.update(credentials)
        .set({
          encryptedRefreshToken: ciphertext,
          iv,
          accessTokenExpiresAt: new Date(expiresAt),
          updatedAt: new Date(now()),
        })
        .where(eq(credentials.id, 1))
        .run();
      db.$client.exec("COMMIT");
      token = { value: t.access_token, expiresAt };
      return t.access_token;
    } catch (e) {
      db.$client.exec("ROLLBACK");
      throw e;
    }
  }

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt - now() >= MIN_LIFE_MS) return token.value;
    return (inflight ??= refresh().finally(() => (inflight = undefined)));
  }

  async function get(site: string, suffix: string, query = "") {
    const tpl = `/api/1/energy_sites/{siteId}/${suffix}`;
    return call(tpl, `${deps.baseUrl}/api/1/energy_sites/${site}/${suffix}${query}`, {
      headers: { Authorization: `Bearer ${await accessToken()}` },
    });
  }

  return {
    id: "fleet-api",
    async getLiveStatus(siteId) {
      return mapLiveStatus(await get(siteId, "live_status"));
    },
    async getHistory(siteId, day) {
      const q = new URLSearchParams({ kind: "energy", period: "day", ...day });
      return mapCalendarHistory(await get(siteId, "calendar_history", `?${q}`));
    },
  };
}

let instance: DataSource | undefined;
const lazy = () =>
  (instance ??= createFleetClient({
    fetch,
    db: defaultDb,
    now: Date.now,
    baseUrl: env.TESLA_FLEET_BASE_URL ?? "https://fleet-api.prd.na.vn.cloud.tesla.com",
    clientId: env.TESLA_CLIENT_ID,
    clientSecret: env.TESLA_CLIENT_SECRET,
  }));

export const fleetClient: DataSource = {
  id: "fleet-api",
  getLiveStatus: (s) => lazy().getLiveStatus(s),
  getHistory: (s, d) => lazy().getHistory(s, d),
};
