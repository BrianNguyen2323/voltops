import { Dashboard } from "~/components/dashboard/dashboard";
import { isAuthDisabled } from "~/lib/auth";
import { checkSnapshot, toDashboardView, type DashboardSnapshot } from "~/lib/dashboard";
import { fleetClient } from "~/lib/sources/fleet-api/client";
import { db } from "~/server/db";
import { credentials } from "~/server/db/schema";
import { firstSiteId, loadSnapshot } from "~/server/snapshot/load";

import { sampleSnapshot } from "./data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const connected = !!db.select({ id: credentials.id }).from(credentials).get();
  let snapshot: DashboardSnapshot = sampleSnapshot;
  let isSample = true;
  try {
    const id = firstSiteId(db);
    if (id !== null) {
      snapshot = await loadSnapshot({ db, source: fleetClient, now: Date.now() }, id);
      isSample = false;
    }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[dashboard snapshot]", err.name, err.message);
  }
  // toDashboardView assumes a checked snapshot; log problems rather than render a quietly wrong view.
  for (const p of checkSnapshot(snapshot)) console.warn("[dashboard snapshot]", p);
  return (
    <Dashboard
      view={toDashboardView(snapshot)}
      connected={connected}
      isSample={isSample}
      showLogout={!isAuthDisabled()}
    />
  );
}
