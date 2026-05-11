import crypto from "crypto";
import { cookies } from "next/headers";
import { env } from "~/env";

const COOKIE_NAME = "voltops_session";

function sign(value: string): string {
  const hmac = crypto.createHmac("sha256", env.SESSION_SECRET);
  hmac.update(value);
  return `${value}.${hmac.digest("hex")}`;
}

function verify(signedValue: string): string | null {
  const lastDot = signedValue.lastIndexOf(".");
  if (lastDot === -1) return null;

  const value = signedValue.slice(0, lastDot);
  const signature = signedValue.slice(lastDot + 1);
  const expected = crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(value)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  return value;
}

export async function setSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sign(userId), {
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
  return verify(cookie.value);
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
