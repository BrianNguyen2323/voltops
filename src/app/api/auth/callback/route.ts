import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { env } from "~/env";
import { encrypt } from "~/lib/crypto";
import { setSession } from "~/lib/session";
import { db } from "~/server/db";
import { teslaTokens, users } from "~/server/db/schema";

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

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.TESLA_CLIENT_ID,
    code,
    redirect_uri: env.TESLA_REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  console.log("[Tesla OAuth] Exchanging code, redirect_uri:", env.TESLA_REDIRECT_URI);

  const tokenRes = await fetch("https://auth.tesla.com/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: tokenBody,
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

  // Find or create user
  let user = await db.query.users.findFirst({
    where: eq(users.teslaUserId, idPayload.sub),
  });

  console.log("[Tesla OAuth] Existing user:", user ? user.id : "not found");

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
  }

  if (!user) {
    console.error("[Tesla OAuth] Failed to create user in DB");
    loginUrl.searchParams.set("error", "db_error");
    return NextResponse.redirect(loginUrl);
  }

  // Encrypt refresh token before storing
  const { ciphertext: encryptedRefreshToken, iv } = encrypt(
    tokens.refresh_token,
  );

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
        accessTokenExpiresAt: new Date(
          Date.now() + tokens.expires_in * 1000,
        ),
        updatedAt: new Date(),
      },
    });

  await setSession(user.id);

  return NextResponse.redirect(new URL("/home", request.url));
}
