/**
 * Read-only check that 4 Tesla Fleet API GETs work; saves anonymized fixtures.
 * Usage: pnpm verify:tesla   (needs .env.local: TESLA_CLIENT_ID, TESLA_CLIENT_SECRET,
 * VOLTOPS_SECRET_KEY; optional DATABASE_PATH, default ./data/voltops.db).
 * Rotated refresh token is saved back to the SQLite DB.
 */
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const FLEET = "https://fleet-api.prd.na.vn.cloud.tesla.com";
const REDACT_KEYS = new Set(
  "energy_site_id,id,id_s,asset_site_id,site_name,gateway_id,din,serial_number,vin,device_id,site_id,grid_installation_id,warp_site_number,vehicle_id,display_name,email,user_id,address,address_line1,address_line2,city,state,zip,postal_code,cached_data".split(","),
);
const COORD_KEYS = new Set(["latitude", "longitude", "lat", "lon", "lng"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_KEYS = ["id", "din", "serial_number", "gateway_id", "vin"];

// Same format as src/lib/crypto.ts: hex(enc || 16-byte tag), 12-byte IV.
export function encrypt(plaintext, keyHex) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const enc = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return { ciphertext: Buffer.concat([enc, c.getAuthTag()]).toString("hex"), iv: iv.toString("hex") };
}

export function decrypt(ciphertext, iv, keyHex) {
  const data = Buffer.from(ciphertext, "hex");
  const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(iv, "hex"));
  d.setAuthTag(data.subarray(-16));
  return Buffer.concat([d.update(data.subarray(0, -16)), d.final()]).toString("utf8");
}

export const missingEnv = (env) =>
  ["TESLA_CLIENT_ID", "TESLA_CLIENT_SECRET", "VOLTOPS_SECRET_KEY"].filter((k) => !env[k]);

export function sqliteTokenStore(path) {
  const Database = createRequire(import.meta.url)("better-sqlite3");
  const db = new Database(path);
  db.pragma("busy_timeout = 5000");
  return {
    async loadToken() {
      const r = db.prepare("SELECT encrypted_refresh_token, iv FROM credentials WHERE id = 1").get();
      if (!r) throw new Error(`No Tesla credentials in ${path}. Connect Tesla in the app first.`);
      return { encryptedRefreshToken: r.encrypted_refresh_token, iv: r.iv };
    },
    async saveToken(t) {
      db.prepare("UPDATE credentials SET encrypted_refresh_token = ?, iv = ?, access_token_expires_at = ?, updated_at = ? WHERE id = 1")
        .run(t.encryptedRefreshToken, t.iv, t.accessTokenExpiresAt.getTime(), Date.now());
    },
    close: () => db.close(),
  };
}

export function anonymize(value, secrets) {
  if (Array.isArray(value)) return value.map((v) => anonymize(v, secrets));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = k.toLowerCase();
      if (REDACT_KEYS.has(key)) out[k] = "REDACTED";
      else if (COORD_KEYS.has(key) && typeof v === "number") out[k] = Math.round(v * 10) / 10;
      else out[k] = anonymize(v, secrets);
    }
    return out;
  }
  if (typeof value === "string") {
    let s = value;
    for (const sec of secrets) if (String(sec) !== "") s = s.split(String(sec)).join("REDACTED");
    return UUID.test(s) ? "REDACTED" : s;
  }
  if (typeof value === "number" && secrets.some((s) => typeof s === "number" && s === value)) return "REDACTED";
  return value;
}

function localParts(tz, date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  return Object.fromEntries(f.formatToParts(date).map((x) => [x.type, Number(x.value)]));
}

function offsetMin(tz, date) {
  const p = localParts(tz, date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// wallMs = local wall time expressed as UTC-field ms; returns it with the offset valid at that instant.
function fmtLocal(tz, wallMs) {
  let off = offsetMin(tz, new Date(wallMs));
  off = offsetMin(tz, new Date(wallMs - off * 60000));
  const a = Math.abs(off);
  const pad = (n) => String(n).padStart(2, "0");
  return `${new Date(wallMs).toISOString().slice(0, 19)}${off < 0 ? "-" : "+"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function yesterdayRange(timeZone, now) {
  const p = localParts(timeZone, now);
  const start = Date.UTC(p.year, p.month - 1, p.day - 1, 0, 0, 0);
  return { start_date: fmtLocal(timeZone, start), end_date: fmtLocal(timeZone, start + 86399000) };
}

export function checkInvariant(live) {
  const residualW = live.solar_power + live.battery_power + live.grid_power - live.load_power;
  return { ok: Math.abs(residualW) <= Math.max(50, 0.05 * live.load_power), residualW };
}

export async function run(deps) {
  const { fetch, clientId, clientSecret, encryptionKey, now, log } = deps;
  const row = await deps.loadToken();
  const refreshToken = decrypt(row.encryptedRefreshToken, row.iv, encryptionKey);

  const res = await fetch("https://auth.tesla.com/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }),
  });
  if (!res.ok) throw new Error(`Token refresh failed with status ${res.status}`);
  const tok = await res.json();
  const enc = encrypt(tok.refresh_token, encryptionKey);
  await deps.saveToken({
    userId: row.userId,
    encryptedRefreshToken: enc.ciphertext,
    iv: enc.iv,
    accessTokenExpiresAt: new Date(now.getTime() + tok.expires_in * 1000),
  });

  const results = [];
  const secrets = [];
  const collect = (v) => {
    if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (SECRET_KEYS.includes(k) && x != null && typeof x !== "object") secrets.push(x);
        else collect(x);
      }
  };

  // Returns the `response` payload when ok. Fixture is written (anonymized) for any 2xx JSON.
  const call = async (name, path, query = "") => {
    let status = 0, body;
    try {
      const r = await fetch(FLEET + path + query, { method: "GET", headers: { Authorization: `Bearer ${tok.access_token}` } });
      status = r.status;
      const text = await r.text();
      try { body = JSON.parse(text); } catch { body = text; }
    } catch (e) {
      body = String(e?.message ?? e);
    }
    const is2xx = status >= 200 && status < 300;
    const ok = is2xx && !!body && typeof body === "object" && "response" in body;
    if (name === "products" && body && typeof body === "object" && "response" in body) {
      body.response = Array.isArray(body.response)
        ? body.response.filter((i) => i?.device_type === "energy" || (i?.device_type == null && typeof i?.resource_type === "string" && i.resource_type !== "" && i.resource_type !== "vehicle"))
        : [];
      if ("count" in body) body.count = body.response.length;
      collect(body);
      const sid = body.response.find((i) => i.resource_type === "battery")?.energy_site_id;
      if (sid != null) secrets.push(String(sid), Number(sid));
    }
    if (is2xx && body && typeof body === "object") await deps.writeFixture(name, anonymize(body, secrets));
    if (!ok) log(`${name} error: ${JSON.stringify(anonymize(body, secrets)).slice(0, 300)}`);
    results.push({ name, path, status, ok });
    return ok ? body.response : undefined;
  };

  const items = await call("products", "/api/1/products");
  const battery = Array.isArray(items) ? items.find((i) => i.resource_type === "battery") : undefined;
  const siteId = battery?.energy_site_id;
  if (siteId == null) {
    log("no battery product found; stopping");
  } else {
    const base = `/api/1/energy_sites/${siteId}`;
    const info = await call("site_info", `${base}/site_info`);
    const tz = info?.installation_time_zone || "UTC";
    const live = await call("live_status", `${base}/live_status`);
    if (live) log(`live_status invariant: ${JSON.stringify(checkInvariant(live))}`);
    const { start_date, end_date } = yesterdayRange(tz, now);
    const q = new URLSearchParams({ kind: "energy", period: "day", start_date, end_date, time_zone: tz });
    await call("calendar_history_energy", `${base}/calendar_history`, `?${q}`);
  }

  log("\n" + results.map((r) => `${r.ok ? "OK  " : "FAIL"} ${String(r.status).padEnd(4)} ${r.name.padEnd(24)} ${anonymize(r.path, secrets)}`).join("\n"));
  return results;
}

async function main() {
  createRequire(import.meta.url)("dotenv").config({ path: ".env.local" });
  const fs = await import("node:fs/promises");
  const env = process.env;
  const missing = missingEnv(env);
  if (missing.length) {
    console.log(`Missing env: ${missing.join(", ")}`);
    process.exit(1);
  }
  let failed = false;
  let store;
  try {
    store = sqliteTokenStore(env.DATABASE_PATH ?? "./data/voltops.db");
    const results = await run({
      fetch, clientId: env.TESLA_CLIENT_ID, clientSecret: env.TESLA_CLIENT_SECRET,
      encryptionKey: env.VOLTOPS_SECRET_KEY, now: new Date(), log: (m) => console.log(m),
      loadToken: store.loadToken, saveToken: store.saveToken,
      writeFixture: async (name, data) => {
        await fs.mkdir("fixtures/fleet-api", { recursive: true });
        await fs.writeFile(`fixtures/fleet-api/${name}.json`, JSON.stringify(data, null, 2) + "\n");
      },
    });
    failed = results.some((r) => !r.ok);
  } catch (e) {
    console.error(e.message);
    failed = true;
  } finally {
    store?.close();
  }
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
