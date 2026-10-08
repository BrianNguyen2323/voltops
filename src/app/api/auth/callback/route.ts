import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env";
import { encrypt } from "~/lib/crypto";
import { requireAdminApi } from "~/lib/auth";
import { db } from "~/server/db";
import { credentials } from "~/server/db/schema";
import { fleetClient } from "~/lib/sources/fleet-api/client";
import { syncSite } from "~/server/site-sync";

// Log only Tesla's error code, never the raw body.
async function errorCode(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const error =
    typeof body === "object" && body
      ? (body as { error?: unknown }).error
      : undefined;
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
    console.error(
      "[Tesla OAuth] Token exchange failed:",
      tokenRes.status,
      await errorCode(tokenRes),
    );
    loginUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(loginUrl);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  // --- Encrypt and upsert refresh token (single row, id=1) ---

  const { ciphertext: encryptedRefreshToken, iv } = encrypt(
    tokens.refresh_token,
  );
  const cred = {
    encryptedRefreshToken,
    iv,
    scope: tokens.scope,
    accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    updatedAt: new Date(),
  };
  await db
    .insert(credentials)
    .values({ id: 1, ...cred })
    .onConflictDoUpdate({ target: credentials.id, set: cred });

  // Credentials are stored; a failed site sync must not fail the login.
  try {
    fleetClient.primeToken(
      tokens.access_token,
      Date.now() + tokens.expires_in * 1000,
    );
    const [first] = await fleetClient.listSites();
    if (first) await syncSite(db, fleetClient, first);
  } catch (err) {
    console.warn(
      "[Tesla OAuth] site sync",
      err instanceof Error ? err.name : "unknown",
    );
  }

  return NextResponse.redirect(new URL("/home", env.TESLA_REDIRECT_URI));
}
