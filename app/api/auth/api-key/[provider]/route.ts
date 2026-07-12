import { NextResponse } from "next/server";

import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ provider: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { provider } = await params;
  const authStorage = AuthStorage.create();
  const registry = ModelRegistry.create(authStorage);
  const status = registry.getProviderAuthStatus(provider);
  const displayName = registry.getProviderDisplayName(provider);
  const models = registry.getAll().filter((m) => m.provider === provider).length;
  return NextResponse.json({
    provider,
    displayName,
    configured: status.configured,
    source: status.source,
    models,
  });
}

export async function POST(req: Request, { params }: Params) {
  const { provider } = await params;
  try {
    const { apiKey } = (await req.json()) as { apiKey?: string };
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
    }
    const authStorage = AuthStorage.create();
    authStorage.set(provider, { type: "api_key", key: apiKey.trim() });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { provider } = await params;
  try {
    const authStorage = AuthStorage.create();
    authStorage.remove(provider);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
