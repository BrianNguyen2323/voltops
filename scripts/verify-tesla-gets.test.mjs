import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  encrypt,
  decrypt,
  anonymize,
  yesterdayRange,
  checkInvariant,
  run,
} from "./verify-tesla-gets.mjs";

const KEY = "ab".repeat(32);
const SITE = 1234567890123;
const OLD_RT = "OLD-REFRESH-TOKEN-xyz";
const NEW_RT = "NEW-REFRESH-TOKEN-abc";
const ACCESS = "ACCESS-TOKEN-secret-123";
const CLIENT_ID = "client-id-1";
const CLIENT_SECRET = "client-secret-SHH";
const FLEET = "https://fleet-api.prd.na.vn.cloud.tesla.com";
const NOW = new Date("2026-11-02T12:00:00Z");

// ---------- crypto ----------
test("encrypt/decrypt round trip", () => {
  const { ciphertext, iv } = encrypt("hello world", KEY);
  assert.equal(iv.length, 24);
  assert.notEqual(ciphertext, "hello world");
  assert.equal(decrypt(ciphertext, iv, KEY), "hello world");
});

test("decrypt reads ciphertext made in documented format (enc || tag, hex)", () => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(KEY, "hex"), iv);
  const enc = Buffer.concat([c.update("secret-token", "utf8"), c.final()]);
  const ct = Buffer.concat([enc, c.getAuthTag()]).toString("hex");
  assert.equal(decrypt(ct, iv.toString("hex"), KEY), "secret-token");
});

test("encrypt output is decryptable by node:crypto and uses random IV", () => {
  const a = encrypt("x", KEY);
  const b = encrypt("x", KEY);
  assert.notEqual(a.iv, b.iv);
  const data = Buffer.from(a.ciphertext, "hex");
  const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(KEY, "hex"), Buffer.from(a.iv, "hex"));
  d.setAuthTag(data.subarray(-16));
  assert.equal(Buffer.concat([d.update(data.subarray(0, -16)), d.final()]).toString(), "x");
});

// ---------- anonymize ----------
test("anonymize redacts keys at depth, in arrays, case-insensitively", () => {
  const out = anonymize(
    { a: { b: [{ VIN: "v", Site_Name: "Home", keep: 1 }], email: "e@x.com" }, zip: "90210" },
    [],
  );
  assert.deepEqual(out, {
    a: { b: [{ VIN: "REDACTED", Site_Name: "REDACTED", keep: 1 }], email: "REDACTED" },
    zip: "REDACTED",
  });
});

test("anonymize redacts every listed key", () => {
  const keys = "energy_site_id,id,id_s,asset_site_id,site_name,gateway_id,din,serial_number,vin,email,user_id,address,address_line1,address_line2,city,state,zip,postal_code".split(",");
  const out = anonymize(Object.fromEntries(keys.map((k) => [k, "v"])), []);
  for (const k of keys) assert.equal(out[k], "REDACTED", k);
});

test("anonymize rounds coordinates to 1 decimal", () => {
  const out = anonymize({ location: { latitude: 37.77493, longitude: -122.41942, lat: 1.26, lon: 2.34, lng: -3.04 } }, []);
  assert.deepEqual(out.location, { latitude: 37.8, longitude: -122.4, lat: 1.3, lon: 2.3, lng: -3 });
});

test("anonymize replaces secret substrings and numeric secrets", () => {
  const out = anonymize(
    { note: "site 98765 and 98765 again", n: 98765, other: 5, list: ["x98765y"] },
    ["98765", 98765],
  );
  assert.equal(out.note, "site REDACTED and REDACTED again");
  assert.equal(out.n, "REDACTED");
  assert.equal(out.other, 5);
  assert.deepEqual(out.list, ["xREDACTEDy"]);
});

test("anonymize does not mutate input", () => {
  const input = { id: "abc", nested: { latitude: 1.234, s: "98765" }, arr: [{ vin: "v" }] };
  const snap = structuredClone(input);
  const out = anonymize(input, ["98765"]);
  assert.deepEqual(input, snap);
  assert.notEqual(out, input);
  assert.notEqual(out.nested, input.nested);
});

// ---------- yesterdayRange ----------
test("yesterdayRange handles DST end in Los Angeles", () => {
  assert.deepEqual(yesterdayRange("America/Los_Angeles", NOW), {
    start_date: "2026-11-01T00:00:00-07:00",
    end_date: "2026-11-01T23:59:59-08:00",
  });
});

test("yesterdayRange UTC uses +00:00", () => {
  assert.deepEqual(yesterdayRange("UTC", NOW), {
    start_date: "2026-11-01T00:00:00+00:00",
    end_date: "2026-11-01T23:59:59+00:00",
  });
});

// ---------- checkInvariant ----------
test("checkInvariant passes within tolerance", () => {
  const r = checkInvariant({ solar_power: 3000, battery_power: -500, grid_power: 100, load_power: 2600 });
  assert.equal(r.residualW, 0);
  assert.equal(r.ok, true);
});

test("checkInvariant fails outside tolerance", () => {
  const r = checkInvariant({ solar_power: 3000, battery_power: 0, grid_power: 0, load_power: 1000 });
  assert.equal(r.residualW, 2000);
  assert.equal(r.ok, false);
});

// ---------- run() ----------
const PRODUCTS = {
  response: [
    { id: "veh-1", vin: "5YJ-VIN-1", resource_type: "vehicle" },
    { resource_type: "battery", energy_site_id: SITE, id: "STE-DIN-001", gateway_id: "GW-9", site_name: "My House" },
  ],
};
const SITE_INFO = { response: { installation_time_zone: "America/Los_Angeles", id: "STE-DIN-001", site_name: "My House", energy_site_id: SITE } };
const LIVE = { response: { solar_power: 3000, battery_power: -500, grid_power: 100, load_power: 2600, energy_site_id: SITE } };
const CAL = { response: { serial_number: "SN-77", time_series: [{ solar_energy_exported: 5 }], note: `site ${SITE}` } };

function setup(over = {}) {
  const calls = [];
  const events = [];
  const logs = [];
  const written = {};
  const routes = {
    "/api/1/products": () => [200, PRODUCTS],
    "/site_info": () => [200, SITE_INFO],
    "/live_status": () => [200, LIVE],
    "/calendar_history": () => [200, CAL],
    ...over.routes,
  };
  const fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.startsWith("https://auth.tesla.com/oauth2/v3/token")) {
      events.push("refresh");
      if (over.refresh) return over.refresh();
      return new Response(JSON.stringify({ access_token: ACCESS, refresh_token: NEW_RT, expires_in: 28800 }), { status: 200 });
    }
    events.push("fleet");
    const key = Object.keys(routes).find((k) => u.includes(k));
    const [status, body] = routes[key]();
    return new Response(JSON.stringify(body), { status });
  };
  const old = encrypt(OLD_RT, KEY);
  const saved = [];
  const deps = {
    fetch,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    encryptionKey: KEY,
    now: NOW,
    log: (m) => logs.push(String(m)),
    loadToken: async () => ({ userId: "u1", encryptedRefreshToken: old.ciphertext, iv: old.iv }),
    saveToken: async (t) => { events.push("save"); saved.push(t); },
    writeFixture: async (name, data) => { written[name] = data; },
  };
  return { deps, calls, events, logs, written, saved };
}
const fleetCalls = (calls) => calls.filter((c) => c.url.startsWith(FLEET));

test("run: refresh request is shaped correctly", async () => {
  const s = setup();
  await run(s.deps);
  const r = s.calls[0];
  assert.equal(r.url, "https://auth.tesla.com/oauth2/v3/token");
  assert.equal(r.init.method, "POST");
  assert.equal(r.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(r.init.headers.Authorization, "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"));
  const body = new URLSearchParams(String(r.init.body));
  assert.equal(body.get("grant_type"), "refresh_token");
  assert.equal(body.get("refresh_token"), OLD_RT);
  assert.equal(body.get("client_id"), CLIENT_ID);
});

test("run: saves rotated encrypted token before the first Fleet request", async () => {
  const s = setup();
  await run(s.deps);
  assert.deepEqual(s.events.slice(0, 3), ["refresh", "save", "fleet"]);
  const t = s.saved[0];
  assert.equal(t.userId, "u1");
  assert.equal(decrypt(t.encryptedRefreshToken, t.iv, KEY), NEW_RT);
  assert.equal(t.accessTokenExpiresAt.getTime(), NOW.getTime() + 28800 * 1000);
});

test("run: all Fleet requests are GET with Bearer auth, 4 right paths", async () => {
  const s = setup();
  const results = await run(s.deps);
  const f = fleetCalls(s.calls);
  assert.equal(f.length, 4);
  for (const c of f) {
    assert.ok(!c.init.method || c.init.method === "GET");
    assert.equal(c.init.headers.Authorization, `Bearer ${ACCESS}`);
  }
  assert.equal(f[0].url, `${FLEET}/api/1/products`);
  assert.equal(f[1].url, `${FLEET}/api/1/energy_sites/${SITE}/site_info`);
  assert.equal(f[2].url, `${FLEET}/api/1/energy_sites/${SITE}/live_status`);
  assert.deepEqual(results.map((r) => r.name), ["products", "site_info", "live_status", "calendar_history_energy"]);
  assert.ok(results.every((r) => r.ok && r.status === 200));
  assert.equal(results[3].path, `/api/1/energy_sites/${SITE}/calendar_history`);
});

test("run: calendar_history query params", async () => {
  const s = setup();
  await run(s.deps);
  const u = new URL(fleetCalls(s.calls)[3].url);
  assert.equal(u.pathname, `/api/1/energy_sites/${SITE}/calendar_history`);
  assert.equal(u.searchParams.get("kind"), "energy");
  assert.equal(u.searchParams.get("period"), "day");
  assert.equal(u.searchParams.get("time_zone"), "America/Los_Angeles");
  assert.equal(u.searchParams.get("start_date"), "2026-11-01T00:00:00-07:00");
  assert.equal(u.searchParams.get("end_date"), "2026-11-01T23:59:59-08:00");
  assert.ok(!u.search.includes("+") && !u.search.includes(":00:00-07:00"), "values URL-encoded");
});

test("run: fixtures are anonymized, no site id or device ids anywhere", async () => {
  const s = setup();
  await run(s.deps);
  assert.deepEqual(Object.keys(s.written).sort(), ["calendar_history_energy", "live_status", "products", "site_info"]);
  const blob = JSON.stringify(s.written);
  for (const secret of [String(SITE), "STE-DIN-001", "GW-9", "SN-77", "5YJ-VIN-1", "veh-1", "My House"]) {
    assert.ok(!blob.includes(secret), `leaked ${secret}`);
  }
  assert.equal(s.written.live_status.response.solar_power, 3000);
});

test("run: refresh failure throws without leaking token, no save, no Fleet calls", async () => {
  const s = setup({ refresh: () => new Response(`bad ${OLD_RT}`, { status: 401 }) });
  await assert.rejects(run(s.deps), (e) => {
    assert.ok(e instanceof Error);
    assert.ok(e.message.includes("401"));
    assert.ok(!e.message.includes(OLD_RT));
    return true;
  });
  assert.equal(s.saved.length, 0);
  assert.equal(fleetCalls(s.calls).length, 0);
});

test("run: no battery product stops after products", async () => {
  const s = setup({ routes: { "/api/1/products": () => [200, { response: [{ id: "v", resource_type: "vehicle" }] }] } });
  const results = await run(s.deps);
  assert.equal(fleetCalls(s.calls).length, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "products");
});

test("run: site_info 500 still runs live_status and calendar with UTC", async () => {
  const s = setup({ routes: { "/site_info": () => [500, { error: "boom" }] } });
  const results = await run(s.deps);
  assert.equal(fleetCalls(s.calls).length, 4);
  const si = results.find((r) => r.name === "site_info");
  assert.equal(si.ok, false);
  assert.equal(si.status, 500);
  assert.ok(results.find((r) => r.name === "live_status").ok);
  const u = new URL(fleetCalls(s.calls)[3].url);
  assert.equal(u.searchParams.get("time_zone"), "UTC");
  assert.equal(u.searchParams.get("start_date"), "2026-11-01T00:00:00+00:00");
  assert.ok(!("site_info" in s.written));
});

test("run: ok requires a `response` key", async () => {
  const s = setup({ routes: { "/live_status": () => [200, { nope: 1 }] } });
  const results = await run(s.deps);
  assert.equal(results.find((r) => r.name === "live_status").ok, false);
});

test("run: no token or secret ever reaches log", async () => {
  const s = setup({ routes: { "/site_info": () => [500, { error: `fail ${SITE}` }] } });
  await run(s.deps);
  assert.ok(s.logs.length > 0);
  const all = s.logs.join("\n");
  for (const secret of [ACCESS, OLD_RT, NEW_RT, CLIENT_SECRET]) {
    assert.ok(!all.includes(secret), `logged ${secret}`);
  }
  assert.ok(!all.includes(String(SITE)), "error body not anonymized");
});

test("run: long error bodies are truncated in log", async () => {
  const s = setup({ routes: { "/live_status": () => [500, { error: "x".repeat(2000) }] } });
  await run(s.deps);
  assert.ok(!s.logs.join("\n").includes("x".repeat(400)));
});
