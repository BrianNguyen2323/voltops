import { NextResponse } from "next/server";
import { requireAdminApi } from "~/lib/auth";
import { getPowerwallLiveStatus } from "~/lib/tesla";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  try {
    const reading = await getPowerwallLiveStatus();
    return NextResponse.json(reading);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/powerwall/live]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
