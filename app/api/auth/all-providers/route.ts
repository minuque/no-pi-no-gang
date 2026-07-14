import { listRuntimeApiKeyProviders } from "@no-pi-no-gang/runtime-pi";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ providers: listRuntimeApiKeyProviders() });
}
