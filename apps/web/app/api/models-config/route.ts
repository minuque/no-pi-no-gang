import { NextResponse } from "next/server";

import { readRuntimeModelsConfig, writeRuntimeModelsConfig } from "@no-pi-no-gang/web-bff";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readRuntimeModelsConfig());
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    writeRuntimeModelsConfig(body);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
