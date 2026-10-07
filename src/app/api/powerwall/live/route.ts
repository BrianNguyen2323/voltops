import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminApi } from "~/lib/auth";
import { AuthExpired } from "~/lib/core/types";
import { fleetClient } from "~/lib/sources/fleet-api/client";
import { db } from "~/server/db";
import { sites } from "~/server/db/schema";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const site = await db.query.sites.findFirst({
    where: eq(sites.source, "fleet-api"),
    columns: { externalId: true },
  });
  if (!site) {
    return NextResponse.json({ error: "No Powerwall energy site found" }, { status: 404 });
  }

  try {
    return NextResponse.json(await fleetClient.getLiveStatus(site.externalId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/powerwall/live]", message);
    return NextResponse.json(
      { error: message },
      { status: err instanceof AuthExpired ? 401 : 500 },
    );
  }
}
