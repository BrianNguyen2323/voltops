/**
 * CONTRACT:
 *  Route handlers GET from ~/app/api/powerwall/live/route, ~/app/api/auth/tesla/route,
 *  ~/app/api/auth/callback/route must return 401 (or a 3xx redirect for the two
 *  auth routes) when there is no admin session, and must not call Tesla.
 *  They gate via ~/lib/auth (requireAdminApi) which reads ~/lib/session getSession (mocked null).
 *  An admin exists in the temp DB so the gate falls through to the session check.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("~/lib/session", () => ({ getSession: async () => null }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => {
    throw new Error(`REDIRECT:${u}`);
  },
}));
const tesla = vi.hoisted(() => ({ getPowerwallLiveStatus: vi.fn() }));
vi.mock("~/lib/tesla", () => tesla);

let dir: string;
const g = globalThis as unknown as {
  __voltopsDb?: { $client: { close(): void } };
};
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "voltops-routes-"));
  process.env.DATABASE_PATH = join(dir, "t.db");
  delete process.env.AUTH_DISABLED;
  vi.resetModules();
  const { db } = await import("~/server/db");
  migrate(db, { migrationsFolder: "drizzle" });
  db.$client
    .prepare("INSERT INTO admin (id, password_hash) VALUES (1, 'x')")
    .run();
});
afterEach(() => {
  g.__voltopsDb?.$client.close();
  delete g.__voltopsDb;
  rmSync(dir, { recursive: true, force: true });
});

const OK_STATUS = [401, 302, 303, 307, 308];

it("/api/powerwall/live returns 401 without a session", async () => {
  const { GET } = await import("~/app/api/powerwall/live/route");
  expect((await GET()).status).toBe(401);
  expect(tesla.getPowerwallLiveStatus).not.toHaveBeenCalled();
});

it("/api/auth/tesla returns 401 or redirects (not to Tesla) without a session", async () => {
  const { GET } = await import("~/app/api/auth/tesla/route");
  const res = await GET();
  expect(OK_STATUS).toContain(res.status);
  expect(res.headers.get("location") ?? "").not.toContain("tesla.com");
});

it("/api/auth/callback returns 401 or redirects without a session", async () => {
  const { GET } = await import("~/app/api/auth/callback/route");
  const res = await GET(
    new NextRequest("http://localhost/api/auth/callback?code=abc&state=x"),
  );
  expect(OK_STATUS).toContain(res.status);
  expect(res.headers.get("location") ?? "").not.toContain("tesla.com");
});

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
