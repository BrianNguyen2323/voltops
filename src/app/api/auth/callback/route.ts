import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env";
import { encrypt } from "~/lib/crypto";
import { requireAdminApi } from "~/lib/auth";
import { db } from "~/server/db";
import { credentials, sites, tariffSchedule } from "~/server/db/schema";

const FLEET_BASE = "https://fleet-api.prd.na.vn.cloud.tesla.com";

// Log only Tesla's error code, never the raw body.
async function errorCode(res: Response): Promise<string> {
  const { error } = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof error === "string" ? error : "unknown";
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Browser-facing origin; request.url carries the bind host (0.0.0.0) in Docker.
  const loginUrl = new URL("/home", env.TESLA_REDIRECT_URI);

  if (error) {
    loginUrl.searchParams.set("error", "access_denied");
    return NextResponse.redirect(loginUrl);
  }

  if (!code || !state) {
    loginUrl.searchParams.set("error", "invalid_request");
    return NextResponse.redirect(loginUrl);
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("tesla_oauth_state")?.value;
  const codeVerifier = cookieStore.get("tesla_code_verifier")?.value;

  cookieStore.delete("tesla_oauth_state");
  cookieStore.delete("tesla_code_verifier");

  if (!storedState || state !== storedState || !codeVerifier) {
    loginUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(loginUrl);
  }

  // Exchange authorization code for tokens
  // Tesla requires client credentials via Basic Auth header, not request body
  const basicAuth = Buffer.from(
    `${env.TESLA_CLIENT_ID}:${env.TESLA_CLIENT_SECRET}`,
  ).toString("base64");

  const tokenRes = await fetch("https://auth.tesla.com/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.TESLA_CLIENT_ID,
      code,
      redirect_uri: env.TESLA_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    console.error("[Tesla OAuth] Token exchange failed:", tokenRes.status, await errorCode(tokenRes));
    loginUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(loginUrl);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  // --- Fetch energy site using the fresh access token (no separate refresh needed) ---

  type ProductsResponse = {
    response: { energy_site_id?: number; resource_type?: string }[];
  };
  type SiteInfoResponse = {
    response: {
      installation_time_zone?: string;
      tariff_id?: string;
      utility?: string;
      tariff_content?: {
        name?: string;
        currency?: string;
        [key: string]: unknown;
      };
    };
  };

  let teslaEnergySiteId: string | null = null;
  let siteInfo: SiteInfoResponse["response"] | null = null;

  const productsRes = await fetch(`${FLEET_BASE}/api/1/products`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (productsRes.ok) {
    const products = (await productsRes.json()) as ProductsResponse;
    const site = products.response.find((p) => p.resource_type === "battery");
    if (site?.energy_site_id) {
      teslaEnergySiteId = String(site.energy_site_id);

      const infoRes = await fetch(
        `${FLEET_BASE}/api/1/energy_sites/${teslaEnergySiteId}/site_info`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      if (infoRes.ok) {
        siteInfo = ((await infoRes.json()) as SiteInfoResponse).response;
      } else {
        console.warn("[Tesla OAuth] Could not fetch site_info:", infoRes.status, await errorCode(infoRes));
      }
    }
  } else {
    console.warn("[Tesla OAuth] Could not fetch products:", productsRes.status, await errorCode(productsRes));
  }

  console.log("[Tesla OAuth] Energy site:", teslaEnergySiteId ? "found" : "none found");
  console.log("[Tesla OAuth] Timezone:", siteInfo?.installation_time_zone ?? "none");

  // --- Upsert site (keyed on Tesla's site ID so re-logins stay idempotent) ---

  const now = new Date();
  let siteRowId: number | null = null;

  if (teslaEnergySiteId) {
    const tz = siteInfo?.installation_time_zone ?? null;
    const [siteRow] = await db
      .insert(sites)
      .values({
        source: "fleet-api",
        externalId: teslaEnergySiteId,
        timezone: tz,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: sites.externalId,
        set: { timezone: tz, updatedAt: now },
      })
      .returning({ id: sites.id });
    siteRowId = siteRow?.id ?? null;
  }

  // --- Upsert tariff schedule (one per site, refreshed on each login) ---

  if (siteRowId && siteInfo?.tariff_id) {
    const row = {
      tariffId: siteInfo.tariff_id,
      name: siteInfo.tariff_content?.name ?? null,
      utility: siteInfo.utility ?? null,
      currency: siteInfo.tariff_content?.currency ?? null,
      content: siteInfo.tariff_content ?? null,
      updatedAt: now,
    };
    await db
      .insert(tariffSchedule)
      .values({ siteId: siteRowId, ...row })
      .onConflictDoUpdate({ target: tariffSchedule.siteId, set: row });
  }

  // --- Encrypt and upsert refresh token (single row, id=1) ---

  const { ciphertext: encryptedRefreshToken, iv } = encrypt(tokens.refresh_token);
  const cred = {
    encryptedRefreshToken,
    iv,
    scope: tokens.scope,
    accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    updatedAt: now,
  };
  await db
    .insert(credentials)
    .values({ id: 1, ...cred })
    .onConflictDoUpdate({ target: credentials.id, set: cred });

  return NextResponse.redirect(new URL("/home", env.TESLA_REDIRECT_URI));
}
