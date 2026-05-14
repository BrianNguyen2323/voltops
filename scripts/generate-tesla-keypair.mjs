/**
 * Generates a P-256 EC key pair for Tesla Fleet API command signing.
 *
 * Run once:
 *   node scripts/generate-tesla-keypair.mjs
 *
 * After running:
 *  1. The public key is written to public/.well-known/appspecific/com.tesla.3p.public-key.pem
 *     → commit this file and deploy so Tesla can fetch it
 *  2. Copy the printed TESLA_PRIVATE_KEY value into .env.local and your Netlify env vars
 *     → never commit the private key
 */

import { generateKeyPairSync } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

// Write public key to the well-known path Next.js will serve as a static file
const publicKeyPath = join(
  root,
  "public",
  ".well-known",
  "appspecific",
  "com.tesla.3p.public-key.pem",
);
mkdirSync(dirname(publicKeyPath), { recursive: true });
writeFileSync(publicKeyPath, publicKey, "utf8");

console.log("Public key written to:");
console.log(" ", publicKeyPath.replace(root, "").replace(/\\/g, "/").slice(1));
console.log("\nCommit that file and deploy to Netlify before running register-tesla-partner.mjs again.");
console.log("\n--- Add this to .env.local AND your Netlify environment variables ---");
console.log(`TESLA_PRIVATE_KEY="${privateKey.replace(/\n/g, "\\n")}"`);
console.log("---------------------------------------------------------------------");
console.log("\nDo NOT commit the private key.");
