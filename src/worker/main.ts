import { fleetClient } from "~/lib/sources/fleet-api/client";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { sites } from "~/server/db/schema";
import { seedReplay } from "~/server/replay/seed";
import { backfillStep, firstSite } from "./backfill";
import {
  guarded,
  isTeslaIdle,
  parseBackfillLimits,
  parseSiteSettings,
  prepareTick,
  runSiteSync,
  runTesla,
  runWeather,
} from "./jobs";

const settings = parseSiteSettings(process.env);
const limits = parseBackfillLimits(process.env);

const HOUR = 3_600_000;
let idleLogged = false;
let busy = false;
let lastTesla = Math.floor(Date.now() / HOUR);
let lastWeather = 0;
let lastSiteSync = 0;

async function tick(first = false) {
  if (busy) return;
  busy = true;
  try {
    prepareTick(db, settings);
    const now = Date.now();
    const deps = { db, source: fleetClient, fetch, now };
    const teslaDue =
      first || (Math.floor(now / HOUR) > lastTesla && now % HOUR >= 120_000);
    const weatherDue = first || now - lastWeather >= 3 * HOUR;
    if (teslaDue) {
      lastTesla = Math.floor(now / HOUR);
      if (!isTeslaIdle(db)) {
        idleLogged = false;
        if (now - lastSiteSync >= 24 * HOUR) {
          lastSiteSync = now;
          await runSiteSync(deps);
        }
        await runTesla(deps);
      } else if (!idleLogged) {
        idleLogged = true;
        console.log("[worker] no fleet-api site; idle");
      }
    }
    if (weatherDue) {
      lastWeather = now;
      await runWeather(deps);
    }
    const site = isTeslaIdle(db) ? undefined : firstSite(db);
    if (site)
      await guarded("backfill", site, () => backfillStep(deps, site, limits));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(`[worker] tick ${err.name}: ${err.message}`);
  } finally {
    busy = false;
  }
}

if (process.argv.includes("--seed-only")) {
  seedReplay(db, Date.now());
  console.log("[worker] demo data seeded");
  process.exit(0);
}
// ponytail: demo goes stale after a day; restart refreshes it
if (
  process.env.VOLTOPS_DEMO === "true" &&
  !db.select().from(sites).where(eq(sites.source, "fleet-api")).get()
) {
  seedReplay(db, Date.now());
  console.log("[worker] demo data seeded");
}
void tick(true);
const timer = setInterval(() => void tick(), 60_000);
for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.on(sig, () => {
    clearInterval(timer);
    process.exit(0);
  });
