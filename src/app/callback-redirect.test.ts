/**
 * CONTRACT: the Tesla callback builds every redirect from the origin of
 * env.TESLA_REDIRECT_URI, never from request.url (which carries the bind host
 * 0.0.0.0 in the Docker standalone server).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    delete: (k: string) => void jar.delete(k),
  }),
}));
vi.mock("~/lib/auth", () => ({ requireAdminApi: async () => null }));
vi.mock("~/lib/crypto", () => ({
  encrypt: () => ({ ciphertext: "c", iv: "i" }),
}));
vi.mock("~/env", () => ({
  env: {
    TESLA_CLIENT_ID: "id",
    TESLA_CLIENT_SECRET: "secret",
    TESLA_REDIRECT_URI: "http://localhost:3000/api/auth/callback",
  },
}));

let dir: string;
const g = globalThis as unknown as {
  __voltopsDb?: { $client: { close(): void } };
};
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "voltops-cb-"));
  process.env.DATABASE_PATH = join(dir, "t.db");
  jar.clear();
  vi.resetModules();
  const { db } = await import("~/server/db");
  migrate(db, { migrationsFolder: "drizzle" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  g.__voltopsDb?.$client.close();
  delete g.__voltopsDb;
  rmSync(dir, { recursive: true, force: true });
});

const BIND = "http://0.0.0.0:3000/api/auth/callback";

async function call(qs: string) {
  const { GET } = await import("~/app/api/auth/callback/route");
  return GET(new NextRequest(`${BIND}?${qs}`));
}

it("success redirects to the TESLA_REDIRECT_URI origin, not the bind host", async () => {
  jar.set("tesla_oauth_state", "s");
  jar.set("tesla_code_verifier", "v");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("/oauth2/v3/token")
        ? Response.json({
            access_token: "a",
            refresh_token: "r",
            expires_in: 3600,
            scope: "x",
          })
        : Response.json({ response: [] }),
    ),
  );
  const res = await call("code=abc&state=s");
  expect(res.headers.get("location")).toBe("http://localhost:3000/home");
});

it("missing code redirects to the TESLA_REDIRECT_URI origin", async () => {
  const res = await call("state=s");
  const loc = res.headers.get("location") ?? "";
  expect(loc).toMatch(/^http:\/\/localhost:3000\/home/);
  expect(loc).toContain("error=invalid_request");
});

it("bad state redirects to the TESLA_REDIRECT_URI origin", async () => {
  jar.set("tesla_oauth_state", "good");
  jar.set("tesla_code_verifier", "v");
  const res = await call("code=abc&state=bad");
  const loc = res.headers.get("location") ?? "";
  expect(loc).toMatch(/^http:\/\/localhost:3000\/home/);
  expect(loc).toContain("error=invalid_state");
});

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
