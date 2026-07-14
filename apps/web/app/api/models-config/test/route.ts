import { NextResponse } from "next/server";

import { testRuntimeModelConfig } from "@no-pi-no-gang/web-bff";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { providerName?: unknown; provider?: unknown; model?: unknown };
    const providerName = typeof body.providerName === "string" ? body.providerName.trim() : "";
    if (!providerName)
      return NextResponse.json({ ok: false, error: "providerName is required" }, { status: 400 });
    if (!isRecord(body.provider))
      return NextResponse.json({ ok: false, error: "provider is required" }, { status: 400 });
    if (!isRecord(body.model))
      return NextResponse.json({ ok: false, error: "model is required" }, { status: 400 });
    if (typeof body.model.id !== "string" || !body.model.id.trim()) {
      return NextResponse.json({ ok: false, error: "Model ID is required" }, { status: 400 });
    }
    return NextResponse.json(
      await testRuntimeModelConfig({ providerName, provider: body.provider, model: body.model }),
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
