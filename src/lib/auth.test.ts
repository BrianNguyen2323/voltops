/**
 * CONTRACT (implementer must match):
 *  ~/lib/auth exports:
 *   hashPassword(pw: string): Promise<string>           argon2id hash ("$argon2id$...")
 *   verifyPassword(hash: string, pw: string): Promise<boolean>
 *   isAuthDisabled(): boolean                           env AUTH_DISABLED === "true" (read at call time)
 *   createAdmin(pw: string): Promise<void>              inserts admin row id=1 with hash; REJECTS (throws) if one exists
 *   requireAdmin(): Promise<void>                       page use. Calls `redirect()` from "next/navigation"
 *       ("/setup" if no admin row, "/login" if no session); resolves if ok / AUTH_DISABLED.
 *   requireAdminApi(): Promise<Response | null>         API use. null = ok, else 401 JSON Response.
 *  Session is read via getSession() from ~/lib/session (mocked here; "admin" = valid).
 *  Admin row lives in the default `db` from ~/server/db, using env DATABASE_PATH.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn<() => Promise<string | null>>();
vi.mock("~/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

let dir: string;
const g = globalThis as unknown as {
  __voltopsDb?: { $client: { close(): void } };
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "voltops-auth-"));
  process.env.DATABASE_PATH = join(dir, "t.db");
  delete process.env.AUTH_DISABLED;
  getSession.mockReset();
  vi.resetModules();
  const { db } = await import("~/server/db");
  migrate(db, { migrationsFolder: "drizzle" });
});

afterEach(() => {
  g.__voltopsDb?.$client.close();
  delete g.__voltopsDb;
  rmSync(dir, { recursive: true, force: true });
  delete process.env.AUTH_DISABLED;
});

const load = () => import("~/lib/auth");

describe("password hashing", () => {
  it("round-trips and rejects a wrong password", async () => {
    const { hashPassword, verifyPassword } = await load();
    const h = await hashPassword("correct horse battery");
    expect(h).toContain("$argon2id$");
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword(h, "correct horse battery")).toBe(true);
    expect(await verifyPassword(h, "wrong password!!")).toBe(false);
  });
});

describe("createAdmin", () => {
  it("inserts the single admin row; a second call is rejected without overwriting", async () => {
    const { createAdmin, verifyPassword } = await load();
    const { db } = await import("~/server/db");
    await createAdmin("first-password-12");
    await expect(createAdmin("second-password-12")).rejects.toThrow();
    const rows = db.$client
      .prepare("SELECT id, password_hash h FROM admin")
      .all() as { id: number; h: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(1);
    expect(await verifyPassword(rows[0]!.h, "first-password-12")).toBe(true);
  });
});

describe("isAuthDisabled", () => {
  it("is true only for the string 'true'", async () => {
    const { isAuthDisabled } = await load();
    expect(isAuthDisabled()).toBe(false);
    process.env.AUTH_DISABLED = "1";
    expect(isAuthDisabled()).toBe(false);
    process.env.AUTH_DISABLED = "true";
    expect(isAuthDisabled()).toBe(true);
  });
});

describe("requireAdmin", () => {
  it("no admin row -> redirect /setup (even with a session)", async () => {
    getSession.mockResolvedValue("admin");
    const { requireAdmin } = await load();
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/setup");
  });

  it("admin exists, no session -> redirect /login", async () => {
    const { createAdmin, requireAdmin } = await load();
    await createAdmin("first-password-12");
    getSession.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
  });

  it("admin exists, valid session -> ok", async () => {
    const { createAdmin, requireAdmin } = await load();
    await createAdmin("first-password-12");
    getSession.mockResolvedValue("admin");
    await expect(requireAdmin()).resolves.not.toThrow();
  });

  it("AUTH_DISABLED=true -> ok with no admin and no session", async () => {
    process.env.AUTH_DISABLED = "true";
    getSession.mockResolvedValue(null);
    const { requireAdmin, requireAdminApi } = await load();
    await expect(requireAdmin()).resolves.not.toThrow();
    expect(await requireAdminApi()).toBeNull();
  });
});

describe("requireAdminApi", () => {
  it("no session -> 401 JSON; valid session -> null", async () => {
    const { createAdmin, requireAdminApi } = await load();
    await createAdmin("first-password-12");
    getSession.mockResolvedValue(null);
    const res = await requireAdminApi();
    expect(res?.status).toBe(401);
    expect(res?.headers.get("content-type")).toContain("application/json");
    getSession.mockResolvedValue("admin");
    expect(await requireAdminApi()).toBeNull();
  });
});

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
