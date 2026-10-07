import { fleetClient } from "~/lib/sources/fleet-api/client";
import { db } from "~/server/db";
import {
  applySiteSettings,
  isTeslaIdle,
  parseSiteSettings,
  runTesla,
  runWeather,
} from "./jobs";

const settings = parseSiteSettings(process.env);

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
    const teslaDue =
      first || (Math.floor(now / HOUR) > lastTesla && now % HOUR >= 120_000);
    const weatherDue = first || now - lastWeather >= 3 * HOUR;
    if (teslaDue) {
      lastTesla = Math.floor(now / HOUR);
      if (!isTeslaIdle(db)) {
        idleLogged = false;
        await runTesla(deps);
      } else if (!idleLogged) {
        idleLogged = true;
        console.log(
          "[worker] tesla idle (no credentials or no fleet-api site)",
        );
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
