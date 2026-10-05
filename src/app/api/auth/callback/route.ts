import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { env } from "~/env";
import { encrypt } from "~/lib/crypto";
import { setSession } from "~/lib/session";
import { db } from "~/server/db";
import { energySites, tariffSchedules, teslaTokens, users } from "~/server/db/schema";

const FLEET_BASE = "https://fleet-api.prd.na.vn.cloud.tesla.com";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const loginUrl = new URL("/login", request.url);

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
    const body = await tokenRes.text();
    console.error("[Tesla OAuth] Token exchange failed:", tokenRes.status, body);
    loginUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(loginUrl);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    id_token: string;
    expires_in: number;
    scope: string;
  };

  // Decode the JWT id_token to extract user identity (no verification needed —
  // the token came directly from Tesla's token endpoint over HTTPS)
  const idPayload = JSON.parse(
    Buffer.from(tokens.id_token.split(".")[1]!, "base64url").toString(),
  ) as { sub: string; email: string; name?: string };

  console.log("[Tesla OAuth] Identity:", idPayload.sub, idPayload.email);

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
        console.warn("[Tesla OAuth] Could not fetch site_info:", await infoRes.text());
      }
    }
  } else {
    console.warn("[Tesla OAuth] Could not fetch products:", await productsRes.text());
  }

  console.log("[Tesla OAuth] Energy site:", teslaEnergySiteId ?? "none found");
  console.log("[Tesla OAuth] Timezone:", siteInfo?.installation_time_zone ?? "none");
  console.log("[Tesla OAuth] Tariff:", siteInfo?.tariff_id ?? "none");

  // --- Find or create user ---

  let user = await db.query.users.findFirst({
    where: eq(users.teslaUserId, idPayload.sub),
  });

  if (!user) {
    const [created] = await db
      .insert(users)
      .values({
        teslaUserId: idPayload.sub,
        email: idPayload.email,
        displayName: idPayload.name,
      })
      .returning();
    user = created;
    console.log("[Tesla OAuth] Created user:", user?.id);
  } else {
    console.log("[Tesla OAuth] Existing user:", user.id);
  }

  if (!user) {
    console.error("[Tesla OAuth] Failed to create user in DB");
    loginUrl.searchParams.set("error", "db_error");
    return NextResponse.redirect(loginUrl);
  }

  // --- Upsert energy site (keyed on Tesla's site ID so re-logins stay idempotent) ---
  // latitude/longitude/city/state are not returned by site_info — left null until
  // a separate geocoding step populates them (deferred to weather API integration).

  let siteRowId: string | null = null;

  if (teslaEnergySiteId) {
    const [siteRow] = await db
      .insert(energySites)
      .values({
        userId: user.id,
        teslaEnergySiteId,
        timezone: siteInfo?.installation_time_zone ?? null,
      })
      .onConflictDoUpdate({
        target: energySites.teslaEnergySiteId,
        set: {
          timezone: siteInfo?.installation_time_zone ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: energySites.id });

    siteRowId = siteRow?.id ?? null;
  }

  // --- Upsert tariff schedule (one per site, refreshed on each login) ---

  if (siteRowId && siteInfo?.tariff_id) {
    await db
      .insert(tariffSchedules)
      .values({
        energySiteId: siteRowId,
        tariffId: siteInfo.tariff_id,
        tariffName: siteInfo.tariff_content?.name ?? null,
        utility: siteInfo.utility ?? null,
        currency: siteInfo.tariff_content?.currency ?? null,
        tariffContent: siteInfo.tariff_content ?? null,
      })
      .onConflictDoUpdate({
        target: tariffSchedules.energySiteId,
        set: {
          tariffId: siteInfo.tariff_id,
          tariffName: siteInfo.tariff_content?.name ?? null,
          utility: siteInfo.utility ?? null,
          currency: siteInfo.tariff_content?.currency ?? null,
          tariffContent: siteInfo.tariff_content ?? null,
          updatedAt: new Date(),
        },
      });
  }

  // --- Encrypt and upsert refresh token ---

  const { ciphertext: encryptedRefreshToken, iv } = encrypt(tokens.refresh_token);

  await db
    .insert(teslaTokens)
    .values({
      userId: user.id,
      encryptedRefreshToken,
      iv,
      scope: tokens.scope,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    })
    .onConflictDoUpdate({
      target: teslaTokens.userId,
      set: {
        encryptedRefreshToken,
        iv,
        scope: tokens.scope,
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        updatedAt: new Date(),
      },
    });

  await setSession(user.id);

  return NextResponse.redirect(new URL("/home", request.url));
}
