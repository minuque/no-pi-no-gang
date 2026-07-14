import { NextResponse } from "next/server";

import { getRuntimeApiKeyProvider, removeRuntimeApiKey, setRuntimeApiKey } from "@no-pi-no-gang/runtime-pi";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ provider: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { provider } = await params;
  return NextResponse.json(getRuntimeApiKeyProvider(provider));
}

export async function POST(req: Request, { params }: Params) {
  const { provider } = await params;
  try {
    const { apiKey } = (await req.json()) as { apiKey?: string };
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
    }
    setRuntimeApiKey(provider, apiKey.trim());
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { provider } = await params;
  try {
    removeRuntimeApiKey(provider);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
