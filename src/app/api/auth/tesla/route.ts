import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "~/env";

function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function GET() {
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  const codeChallenge = base64URLEncode(
    Buffer.from(crypto.createHash("sha256").update(codeVerifier).digest()),
  );
  const state = base64URLEncode(crypto.randomBytes(16));

  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  };

  cookieStore.set("tesla_code_verifier", codeVerifier, cookieOpts);
  cookieStore.set("tesla_oauth_state", state, cookieOpts);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.TESLA_CLIENT_ID,
    redirect_uri: env.TESLA_REDIRECT_URI,
    scope: "openid email offline_access energy_device_data",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return NextResponse.redirect(
    `https://auth.tesla.com/oauth2/v3/authorize?${params.toString()}`,
  );
}
