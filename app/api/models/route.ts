import { getRuntimeModels } from "@no-pi-no-gang/runtime-pi";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(getRuntimeModels());
  } catch {
    return Response.json({
      models: {},
      modelList: [],
      defaultModel: null,
      thinkingLevels: {},
      thinkingLevelMaps: {},
    });
  }
}
