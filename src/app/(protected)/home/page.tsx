import { Dashboard } from "~/components/dashboard/dashboard";
import { isAuthDisabled } from "~/lib/auth";
import { db } from "~/server/db";
import { credentials } from "~/server/db/schema";

import { sampleDashboard } from "./data";

export default function HomePage() {
  const connected = !!db.select({ id: credentials.id }).from(credentials).get();
  return <Dashboard data={sampleDashboard} connected={connected} isSample showLogout={!isAuthDisabled()} />;
}
