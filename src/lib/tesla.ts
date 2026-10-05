import { eq } from "drizzle-orm";
import { env } from "~/env";
import { decrypt, encrypt } from "~/lib/crypto";
import { db } from "~/server/db";
import { credentials, sites } from "~/server/db/schema";

const TESLA_FLEET_BASE = "https://fleet-api.prd.na.vn.cloud.tesla.com";

export type PowerwallReading = {
  solar_kw: number;
  battery_pct: number;
  battery_kw: number;   // positive = discharging to home, negative = charging from solar
  home_kw: number;
  grid_kw: number;      // positive = importing from grid, negative = exporting to grid
  timestamp: string;
};

/**
 * Decrypts the stored refresh token, exchanges it for a fresh access token,
 * then re-encrypts and stores the rotated refresh token Tesla returns.
 *
 * Tesla invalidates the previous refresh token on each use, so the DB update
 * is not optional — skipping it would lock the user out on the next call.
 */
export async function getAccessToken(): Promise<string> {
  const record = await db.query.credentials.findFirst({
    where: eq(credentials.id, 1),
  });

  if (!record) {
    throw new Error("No Tesla credentials stored");
  }

  const refreshToken = decrypt(record.encryptedRefreshToken, record.iv);

  const basicAuth = Buffer.from(
    `${env.TESLA_CLIENT_ID}:${env.TESLA_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch("https://auth.tesla.com/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.TESLA_CLIENT_ID,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tesla token refresh failed: ${res.status} ${body}`);
  }

  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Store the rotated refresh token before returning — Tesla invalidates the old one immediately
  const { ciphertext: encryptedRefreshToken, iv } = encrypt(tokens.refresh_token);

  await db
    .update(credentials)
    .set({
      encryptedRefreshToken,
      iv,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(credentials.id, 1));

  return tokens.access_token;
}

async function fleetGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${TESLA_FLEET_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tesla Fleet API ${path} failed: ${res.status} ${body}`);
  }
  return (await res.json()) as T;
}

export async function getPowerwallLiveStatus(): Promise<PowerwallReading> {
  // Check DB first — no token refresh wasted if the user has no Powerwall
  const site = await db.query.sites.findFirst({
    where: eq(sites.source, "fleet-api"),
    columns: { externalId: true },
  });

  if (!site) {
    throw new Error("No Powerwall energy site found");
  }

  const siteId = site.externalId;
  const accessToken = await getAccessToken();

  const data = await fleetGet<{
    response: {
      solar_power: number;
      percentage_charged: number;
      battery_power: number;
      load_power: number;
      grid_power: number;
      timestamp: string;
    };
  }>(`/api/1/energy_sites/${siteId}/live_status`, accessToken);

  const r = data.response;

  const reading: PowerwallReading = {
    solar_kw: Math.round((r.solar_power / 1000) * 1000) / 1000,
    battery_pct: Math.round(r.percentage_charged * 10) / 10,
    battery_kw: Math.round((r.battery_power / 1000) * 1000) / 1000,
    home_kw: Math.round((r.load_power / 1000) * 1000) / 1000,
    grid_kw: Math.round((r.grid_power / 1000) * 1000) / 1000,
    timestamp: r.timestamp,
  };

  // --- DEBUG: remove before production ---
  console.log("[Powerwall Live Status]");
  console.log(`  Energy Site ID : ${siteId}`);
  console.log(`  Solar          : ${reading.solar_kw} kW`);
  console.log(`  Battery        : ${reading.battery_pct}% (${reading.battery_kw > 0 ? "+" : ""}${reading.battery_kw} kW)`);
  console.log(`  Home Load      : ${reading.home_kw} kW`);
  console.log(`  Grid           : ${reading.grid_kw > 0 ? "importing" : "exporting"} ${Math.abs(reading.grid_kw)} kW`);
  console.log(`  Timestamp      : ${reading.timestamp}`);
  // --- END DEBUG ---

  return reading;
}
