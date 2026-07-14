import { logoutRuntimeProvider } from "@no-pi-no-gang/runtime-pi";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!logoutRuntimeProvider(provider)) {
    return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }
  return Response.json({ ok: true });
}
