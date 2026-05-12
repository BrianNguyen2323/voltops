import { eq } from "drizzle-orm";
import { env } from "~/env";
import { decrypt, encrypt } from "~/lib/crypto";
import { db } from "~/server/db";
import { teslaTokens } from "~/server/db/schema";

/**
 * Decrypts the stored refresh token, exchanges it for a fresh access token,
 * then re-encrypts and stores the rotated refresh token Tesla returns.
 *
 * Tesla invalidates the previous refresh token on each use, so the DB update
 * is not optional — skipping it would lock the user out on the next call.
 */
export async function getAccessToken(userId: string): Promise<string> {
  const record = await db.query.teslaTokens.findFirst({
    where: eq(teslaTokens.userId, userId),
  });

  if (!record) {
    throw new Error(`No Tesla token found for user ${userId}`);
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
    .update(teslaTokens)
    .set({
      encryptedRefreshToken,
      iv,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(teslaTokens.userId, userId));

  return tokens.access_token;
}
