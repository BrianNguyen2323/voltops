/**
 * CONTRACT: ~/app/login/actions exports
 *   loginAction(prev: unknown, formData: FormData): Promise<{ error: string } | void>
 *     field "password". Wrong password (or no admin) -> { error: "Incorrect password" } exactly, no session.
 *     Success -> setSession("admin"), redirect("/home") (mocked to throw "REDIRECT:/home").
 *   logoutAction(): Promise<void>   calls clearSession() from ~/lib/session, then redirect("/login").
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const sess = vi.hoisted(() => ({
  setSession: vi.fn(),
  clearSession: vi.fn(),
}));
vi.mock("~/lib/session", () => ({ ...sess, getSession: async () => null }));
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
const form = (password: string) => {
  const f = new FormData();
  f.set("password", password);
  return f;
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "voltops-login-"));
  process.env.DATABASE_PATH = join(dir, "t.db");
  sess.setSession.mockReset();
  sess.clearSession.mockReset();
  vi.resetModules();
  const { db } = await import("~/server/db");
  migrate(db, { migrationsFolder: "drizzle" });
  const { createAdmin } = await import("~/lib/auth");
  await createAdmin("right-password-12");
});
afterEach(() => {
  g.__voltopsDb?.$client.close();
  delete g.__voltopsDb;
  rmSync(dir, { recursive: true, force: true });
});

it("wrong password -> generic error, no session", async () => {
  const { loginAction } = await import("~/app/login/actions");
  expect(await loginAction(undefined, form("nope-nope-nope"))).toEqual({
    error: "Incorrect password",
  });
  expect(sess.setSession).not.toHaveBeenCalled();
});

it("right password -> session + redirect /home", async () => {
  const { loginAction } = await import("~/app/login/actions");
  await expect(
    loginAction(undefined, form("right-password-12")),
  ).rejects.toThrow("REDIRECT:/home");
  expect(sess.setSession).toHaveBeenCalledWith("admin");
});

it("logout clears the session and redirects to /login", async () => {
  const { logoutAction } = await import("~/app/login/actions");
  await expect(logoutAction()).rejects.toThrow("REDIRECT:/login");
  expect(sess.clearSession).toHaveBeenCalled();
});

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
