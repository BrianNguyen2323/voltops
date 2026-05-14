/**
 * One-time Tesla Fleet API partner registration.
 *
 * Tesla requires each application to be registered per region before
 * user-token API calls will succeed. Run this once after deploying.
 *
 * Usage:
 *   node scripts/register-tesla-partner.mjs
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { config } = require("dotenv");

config({ path: ".env.local" });

const CLIENT_ID = process.env.TESLA_CLIENT_ID;
const CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET;
const FLEET_BASE = "https://fleet-api.prd.na.vn.cloud.tesla.com";
const DOMAIN = "voltops.netlify.app";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing TESLA_CLIENT_ID or TESLA_CLIENT_SECRET in .env.local");
  process.exit(1);
}

// Step 1: Get a client credentials token (app-level, not user-level)
console.log("Step 1: Obtaining client credentials token...");

const tokenRes = await fetch("https://auth.tesla.com/oauth2/v3/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "openid energy_device_data energy_cmds",
    audience: FLEET_BASE,
  }),
});

if (!tokenRes.ok) {
  const body = await tokenRes.text();
  console.error("Token request failed:", tokenRes.status, body);
  process.exit(1);
}

const { access_token } = await tokenRes.json();
console.log("  Client credentials token obtained.");

// Step 2: Register the partner account in this region
console.log(`\nStep 2: Registering domain "${DOMAIN}" with Tesla Fleet API...`);

const registerRes = await fetch(`${FLEET_BASE}/api/1/partner_accounts`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${access_token}`,
  },
  body: JSON.stringify({ domain: DOMAIN }),
});

const registerBody = await registerRes.text();

if (!registerRes.ok) {
  console.error("Registration failed:", registerRes.status, registerBody);
  process.exit(1);
}

console.log("Registration response:", registerBody);
console.log("\nDone. Your app is now registered with Tesla Fleet API.");
