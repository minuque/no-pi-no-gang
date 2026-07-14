import { listRuntimeApiKeyProviders } from "@no-pi-no-gang/web-bff";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ providers: listRuntimeApiKeyProviders() });
}
