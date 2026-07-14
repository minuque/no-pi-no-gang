import { listRuntimeOAuthProviders } from "@no-pi-no-gang/web-bff";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers = listRuntimeOAuthProviders();

  const EXCLUDED = new Set(["anthropic"]);
  const DISPLAY_NAMES: Record<string, string> = {
    "openai-codex": "ChatGPT Plus/Pro",
    "github-copilot": "GitHub Copilot",
  };

  const result = await Promise.all(
    providers
      .filter((p) => !EXCLUDED.has(p.id))
      .map(async (p) => {
        return {
          id: p.id,
          name: DISPLAY_NAMES[p.id] ?? p.name,
          usesCallbackServer: p.usesCallbackServer ?? false,
          loggedIn: p.loggedIn,
        };
      }),
  );

  return Response.json({ providers: result });
}
