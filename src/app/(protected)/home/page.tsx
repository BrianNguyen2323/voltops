import { Dashboard } from "~/components/dashboard/dashboard";
import { isAuthDisabled } from "~/lib/auth";
import { checkSnapshot, toDashboardView } from "~/lib/dashboard";
import { db } from "~/server/db";
import { credentials } from "~/server/db/schema";

import { sampleSnapshot } from "./data";

export default function HomePage() {
  const connected = !!db.select({ id: credentials.id }).from(credentials).get();
  // toDashboardView assumes a checked snapshot; log problems rather than render a quietly wrong view.
  for (const p of checkSnapshot(sampleSnapshot))
    console.warn("[dashboard snapshot]", p);
  return (
    <Dashboard
      view={toDashboardView(sampleSnapshot)}
      connected={connected}
      isSample
      showLogout={!isAuthDisabled()}
    />
  );
}
