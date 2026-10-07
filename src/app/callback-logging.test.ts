/**
 * CONTRACT (B008): the Tesla callback never logs Tesla response bodies or the
 * tariff ID. Failure logs are `[msg, status, error-code-or-"unknown"]`.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";

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

const SITE_ID = 987654321012;
const MARKERS = [
  String(SITE_ID),
  "42 Secret Lane",
  "TARIFF-MARKER-XYZ",
  "BODY-ONLY-MARKER",
];

let dir: string;
const g = globalThis as unknown as {
  __voltopsDb?: { $client: { close(): void } };
};
let spies: MockInstance<(...args: unknown[]) => void>[];

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "voltops-cblog-"));
  process.env.DATABASE_PATH = join(dir, "t.db");
  jar.clear();
  jar.set("tesla_oauth_state", "s");
  jar.set("tesla_code_verifier", "v");
  vi.resetModules();
  const { db } = await import("~/server/db");
  migrate(db, { migrationsFolder: "drizzle" });
  spies = (["log", "warn", "error"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
}, 60000);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  g.__voltopsDb?.$client.close();
  delete g.__voltopsDb;
  rmSync(dir, { recursive: true, force: true });
});

const token = () =>
  Response.json({
    access_token: "a",
    refresh_token: "r",
    expires_in: 3600,
    scope: "x",
  });
const products = () =>
  Response.json({
    response: [{ resource_type: "battery", energy_site_id: SITE_ID }],
  });

function stubFetch(handlers: {
  products: () => Response;
  siteInfo?: () => Response;
  token?: () => Response;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/oauth2/v3/token")) return (handlers.token ?? token)();
      if (url.endsWith("/products")) return handlers.products();
      return handlers.siteInfo!();
    }),
  );
}

async function run() {
  const { GET } = await import("~/app/api/auth/callback/route");
  await GET(
    new NextRequest("http://0.0.0.0:3000/api/auth/callback?code=abc&state=s"),
  );
}

const allArgs = () => spies.flatMap((s) => s.mock.calls);
const logged = () => JSON.stringify(allArgs());
const expectNoMarkers = () => {
  for (const m of MARKERS) expect(logged()).not.toContain(m);
};
const warns = () => (spies[1]!.mock.calls);

const leakyBody = {
  error: "forbidden",
  address: "42 Secret Lane",
  bodyOnly: "BODY-ONLY-MARKER",
  id: String(SITE_ID),
};

it("products non-OK logs status + error code only", async () => {
  stubFetch({ products: () => Response.json(leakyBody, { status: 403 }) });
  await run();
  expect(warns()).toContainEqual([
    "[Tesla OAuth] Could not fetch products:",
    403,
    "forbidden",
  ]);
  expectNoMarkers();
});

it("site_info non-OK logs status + error code only", async () => {
  stubFetch({
    products,
    siteInfo: () => Response.json(leakyBody, { status: 429 }),
  });
  await run();
  expect(warns()).toContainEqual([
    "[Tesla OAuth] Could not fetch site_info:",
    429,
    "forbidden",
  ]);
  expectNoMarkers();
});

it("non-JSON error body logs \"unknown\" and does not crash", async () => {
  stubFetch({
    products,
    siteInfo: () =>
      new Response("<html>42 Secret Lane BODY-ONLY-MARKER</html>", {
        status: 500,
      }),
  });
  await run();
  expect(warns()).toContainEqual([
    "[Tesla OAuth] Could not fetch site_info:",
    500,
    "unknown",
  ]);
  expectNoMarkers();
});

it("non-string error field logs \"unknown\"", async () => {
  stubFetch({
    products: () =>
      Response.json({ error: { detail: "BODY-ONLY-MARKER" } }, { status: 400 }),
  });
  await run();
  expect(warns()).toContainEqual([
    "[Tesla OAuth] Could not fetch products:",
    400,
    "unknown",
  ]);
  expectNoMarkers();
});

it("token exchange non-OK logs status + error code only", async () => {
  stubFetch({
    token: () => Response.json({ ...leakyBody, error: "invalid_grant" }, { status: 400 }),
    products,
  });
  await run();
  expect(spies[2]!.mock.calls).toContainEqual([
    "[Tesla OAuth] Token exchange failed:",
    400,
    "invalid_grant",
  ]);
  expectNoMarkers();
});

it("JSON null error body logs \"unknown\" and does not throw", async () => {
  stubFetch({ products: () => new Response("null", { status: 502 }) });
  await run();
  expect(warns()).toContainEqual([
    "[Tesla OAuth] Could not fetch products:",
    502,
    "unknown",
  ]);
});

it("success path logs timezone and site status but no tariff ID", async () => {
  stubFetch({
    products,
    siteInfo: () =>
      Response.json({
        response: {
          installation_time_zone: "America/Los_Angeles",
          tariff_id: "TARIFF-MARKER-XYZ",
          utility: "BODY-ONLY-MARKER",
          tariff_content: { name: "Plan", currency: "USD" },
        },
      }),
  });
  await run();
  const logs = spies[0]!.mock.calls;
  expect(logs).toContainEqual(["[Tesla OAuth] Energy site:", "found"]);
  expect(logs).toContainEqual([
    "[Tesla OAuth] Timezone:",
    "America/Los_Angeles",
  ]);
  expect(logged()).not.toContain("Tariff");
  expectNoMarkers();
});

// B002: the callback stores site facts from site_info.
async function siteRow() {
  const { db } = await import("~/server/db");
  return db.$client
    .prepare(
      "SELECT name, usable_capacity_wh AS cap, backup_reserve_pct AS reserve FROM sites",
    )
    .all();
}

it("stores name, capacity (nested nameplate_energy_watts) and reserve from site_info", async () => {
  const fixture = JSON.parse(
    readFileSync("fixtures/fleet-api/site_info.json", "utf8"),
  ) as { response: Record<string, unknown> };
  fixture.response.site_name = "My Home";
  stubFetch({ products, siteInfo: () => Response.json(fixture) });
  await run();
  expect(await siteRow()).toEqual([
    { name: "My Home", cap: 27000, reserve: 20 },
  ]);
  expectNoMarkers();
  expect(logged()).not.toContain("My Home");
});

it("re-running the callback updates the site facts", async () => {
  const body = (name: string, wh: number, pct: number) => () =>
    Response.json({
      response: {
        site_name: name,
        backup_reserve_percent: pct,
        components: { gateways: [{ nameplate_energy_watts: wh }] },
      },
    });
  stubFetch({ products, siteInfo: body("A", 13500, 10) });
  await run();
  jar.set("tesla_oauth_state", "s");
  jar.set("tesla_code_verifier", "v");
  stubFetch({ products, siteInfo: body("B", 27000, 35) });
  await run();
  expect(await siteRow()).toEqual([{ name: "B", cap: 27000, reserve: 35 }]);
});

it("missing site_info values store null", async () => {
  stubFetch({
    products,
    siteInfo: () =>
      Response.json({ response: { installation_time_zone: "America/Los_Angeles" } }),
  });
  await run();
  expect(await siteRow()).toEqual([{ name: null, cap: null, reserve: null }]);
});

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });
