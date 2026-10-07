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
const fleet = vi.hoisted(() => ({ getLiveStatus: vi.fn() }));
vi.mock("~/lib/sources/fleet-api/client", () => ({ fleetClient: fleet }));

let dir: string;
const g = globalThis as unknown as {
  __voltopsDb?: { $client: { close(): void } };
};
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "voltops-routes-"));
  process.env.DATABASE_PATH = join(dir, "t.db");
  delete process.env.AUTH_DISABLED;
  fleet.getLiveStatus.mockReset();
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
  expect(fleet.getLiveStatus).not.toHaveBeenCalled();
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

const addSite = (db: { $client: { prepare(s: string): { run(): void } } }) =>
  db.$client
    .prepare(
      "INSERT INTO sites (source, external_id) VALUES ('fleet-api', 'ext-42')",
    )
    .run();

it("/api/powerwall/live (admin) 404s when there is no fleet-api site", async () => {
  process.env.AUTH_DISABLED = "true";
  const { GET } = await import("~/app/api/powerwall/live/route");
  const res = await GET();
  expect(res.status).toBe(404);
  expect(await res.json()).toHaveProperty("error");
  expect(fleet.getLiveStatus).not.toHaveBeenCalled();
});

it("/api/powerwall/live (admin) returns fleetClient.getLiveStatus(externalId)", async () => {
  process.env.AUTH_DISABLED = "true";
  const { db } = await import("~/server/db");
  addSite(db);
  const sample = { ts: "2026-10-05T18:06:04.000Z", solarW: 1 };
  fleet.getLiveStatus.mockResolvedValue(sample);
  const { GET } = await import("~/app/api/powerwall/live/route");
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(sample);
  expect(fleet.getLiveStatus).toHaveBeenCalledWith("ext-42");
});

it("/api/powerwall/live (admin) maps AuthExpired to 401 and other errors to 500", async () => {
  process.env.AUTH_DISABLED = "true";
  const { db } = await import("~/server/db");
  addSite(db);
  const { AuthExpired } = await import("~/lib/core/types");
  const { GET } = await import("~/app/api/powerwall/live/route");
  fleet.getLiveStatus.mockRejectedValueOnce(new AuthExpired("expired"));
  const r1 = await GET();
  expect(r1.status).toBe(401);
  expect(await r1.json()).toEqual({ error: "expired" });
  fleet.getLiveStatus.mockRejectedValueOnce(new Error("boom"));
  const r2 = await GET();
  expect(r2.status).toBe(500);
  expect(await r2.json()).toEqual({ error: "boom" });
});

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
