import { z } from "zod";
import { server } from "~/env.schema.js";
import { fleetClient } from "~/lib/sources/fleet-api/client";
import { db } from "~/server/db";
import { sites } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { applySiteSettings, runTesla, runWeather } from "./jobs";

const settings = z
  .object({
    SITE_LATITUDE: server.SITE_LATITUDE,
    SITE_LONGITUDE: server.SITE_LONGITUDE,
    TEMPERATURE_UNIT: server.TEMPERATURE_UNIT,
  })
  .parse(process.env);

const HOUR = 3_600_000;
let idleLogged = false;
let busy = false;
let lastTesla = Math.floor(Date.now() / HOUR);
let lastWeather = 0;

async function tick(first = false) {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();
    const deps = { db, source: fleetClient, fetch, now };
    const teslaDue = first || (Math.floor(now / HOUR) > lastTesla && now % HOUR >= 120_000);
    const weatherDue = first || now - lastWeather >= 3 * HOUR;
    if (teslaDue) {
      lastTesla = Math.floor(now / HOUR);
      if (db.select().from(sites).where(eq(sites.source, "fleet-api")).all().length) {
        idleLogged = false;
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
  } finally {
    busy = false;
  }
}

applySiteSettings(db, settings);
void tick(true);
const timer = setInterval(() => void tick(), 60_000);
for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.on(sig, () => {
    clearInterval(timer);
    process.exit(0);
  });
