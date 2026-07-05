import { NextResponse } from "next/server";

import { mergeSessionNodeState } from "@/lib/session-bridge";
import { listAllSessions } from "@/lib/session-reader";

export async function GET() {
  try {
    const sessions = (await listAllSessions()).map((session) => mergeSessionNodeState(session));
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
