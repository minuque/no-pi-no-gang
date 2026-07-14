import { NextResponse } from "next/server";

import { getSessionContextById } from "@/lib/session/session-reader";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const leafId = url.searchParams.get("leafId") ?? undefined;

  try {
    const context = await getSessionContextById(id, leafId);
    if (!context) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ context });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
