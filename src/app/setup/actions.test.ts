/**
 * CONTRACT: ~/app/setup/actions exports
 *   setupAction(prev: unknown, formData: FormData): Promise<{ error: string } | void>
 *  FormData fields: "password", "confirm".
 *  - admin already exists -> redirect("/login") (next/navigation, mocked to throw "REDIRECT:<url>"); row untouched, no session
 *  - password < 12 chars, or confirm mismatch -> returns { error }, no row inserted, no session
 *  - success -> inserts argon2id hash into admin, setSession("admin") from ~/lib/session, redirect("/home")
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const setSession = vi.fn<(u: string) => void>();
vi.mock("~/lib/session", () => ({
  setSession: (u: string) => setSession(u),
  getSession: async () => null,
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => {
    throw new Error(`REDIRECT:${u}`);
  },
}));

let dir: string;
const g = globalThis as unknown as {
  __voltopsDb?: { $client: { close(): void } };
};
const form = (password: string, confirm: string) => {
  const f = new FormData();
  f.set("password", password);
  f.set("confirm", confirm);
  return f;
};
const count = async () => {
  const { db } = await import("~/server/db");
  return (
    db.$client.prepare("SELECT count(*) c FROM admin").get() as { c: number }
  ).c;
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "voltops-setup-"));
  process.env.DATABASE_PATH = join(dir, "t.db");
  setSession.mockReset();
  vi.resetModules();
  const { db } = await import("~/server/db");
  migrate(db, { migrationsFolder: "drizzle" });
});
afterEach(() => {
  g.__voltopsDb?.$client.close();
  delete g.__voltopsDb;
  rmSync(dir, { recursive: true, force: true });
});

it("rejects short passwords and mismatched confirmation", async () => {
  const { setupAction } = await import("~/app/setup/actions");
  expect(await setupAction(undefined, form("short", "short"))).toMatchObject({
    error: expect.any(String) as string,
  });
  expect(
    await setupAction(undefined, form("long-enough-pw1", "different-pw-12")),
  ).toMatchObject({ error: expect.any(String) as string });
  expect(await count()).toBe(0);
  expect(setSession).not.toHaveBeenCalled();
});

it("success stores an argon2id hash, sets session, redirects to /home", async () => {
  const { setupAction } = await import("~/app/setup/actions");
  await expect(
    setupAction(undefined, form("long-enough-pw1", "long-enough-pw1")),
  ).rejects.toThrow("REDIRECT:/home");
  expect(setSession).toHaveBeenCalledWith("admin");
  const { db } = await import("~/server/db");
  const row = db.$client
    .prepare("SELECT password_hash h FROM admin WHERE id = 1")
    .get() as { h: string };
  expect(row.h).toContain("$argon2id$");
});

it("refuses when an admin exists: redirect /login, no overwrite", async () => {
  const { setupAction } = await import("~/app/setup/actions");
  await expect(
    setupAction(undefined, form("long-enough-pw1", "long-enough-pw1")),
  ).rejects.toThrow("REDIRECT:/home");
  setSession.mockReset();
  await expect(
    setupAction(undefined, form("another-long-pw2", "another-long-pw2")),
  ).rejects.toThrow("REDIRECT:/login");
  expect(setSession).not.toHaveBeenCalled();
  const { db } = await import("~/server/db");
  const { verifyPassword } = await import("~/lib/auth");
  const row = db.$client.prepare("SELECT password_hash h FROM admin").get() as {
    h: string;
  };
  expect(await verifyPassword(row.h, "long-enough-pw1")).toBe(true);
});

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
