import { NextResponse } from "next/server";
import { getSession } from "~/lib/session";
import { getPowerwallLiveStatus } from "~/lib/tesla";

export async function GET() {
  const userId = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const reading = await getPowerwallLiveStatus(userId);
    return NextResponse.json(reading);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/powerwall/live]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
