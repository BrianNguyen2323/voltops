import crypto from "crypto";
import { cookies } from "next/headers";
import { env } from "~/env";

const COOKIE_NAME = "voltops_session";

export function sign(value: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(value);
  return `${value}.${hmac.digest("hex")}`;
}

export function verify(signedValue: string, secret: string): string | null {
  const lastDot = signedValue.lastIndexOf(".");
  if (lastDot === -1) return null;

  const value = signedValue.slice(0, lastDot);
  const signature = Buffer.from(signedValue.slice(lastDot + 1));
  const expected = Buffer.from(
    crypto.createHmac("sha256", secret).update(value).digest("hex"),
  );

  // Length check first: timingSafeEqual throws on unequal lengths.
  // Constant-time comparison to prevent timing attacks.
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(signature, expected)
  ) {
    return null;
  }
  return value;
}

export async function setSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sign(userId, env.SESSION_SECRET), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
}

export async function getSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie) return null;
  return verify(cookie.value, env.SESSION_SECRET);
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
