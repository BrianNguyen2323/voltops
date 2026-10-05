import { hash, verify } from "@node-rs/argon2";
import { redirect } from "next/navigation";
import { getSession } from "~/lib/session";
import { db } from "~/server/db";
import { admin } from "~/server/db/schema";

// Argon2id (algorithm: 2), library defaults otherwise.
export const hashPassword = (pw: string) => hash(pw, { algorithm: 2 });
export const verifyPassword = (h: string, pw: string) =>
  verify(h, pw).catch(() => false);

// Read at call time (not via ~/env) so it works under tests and runtime toggles.
export const isAuthDisabled = () => process.env.AUTH_DISABLED === "true";

export const formString = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

export const getAdminHash = () =>
  db.select({ h: admin.passwordHash }).from(admin).get()?.h ?? null;

// Single-row PK/CHECK (id = 1) makes a concurrent second insert throw.
export async function createAdmin(pw: string): Promise<void> {
  db.insert(admin)
    .values({ id: 1, passwordHash: await hashPassword(pw), createdAt: new Date() })
    .run();
}

export async function requireAdmin(): Promise<void> {
  if (isAuthDisabled()) return;
  if (!getAdminHash()) redirect("/setup");
  if ((await getSession()) !== "admin") redirect("/login");
}

export async function requireAdminApi(): Promise<Response | null> {
  if (isAuthDisabled()) return null;
  if (getAdminHash() && (await getSession()) === "admin") return null;
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
