import { NextResponse } from "next/server";
import { getSession } from "~/lib/session";
import { getPowerwallLiveStatus } from "~/lib/tesla";

export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const reading = await getPowerwallLiveStatus();
    return NextResponse.json(reading);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/powerwall/live]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
