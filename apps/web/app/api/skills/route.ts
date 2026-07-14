import { NextResponse } from "next/server";

import { getRuntimeSkills, setRuntimeSkillModelInvocation } from "@no-pi-no-gang/web-bff";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  try {
    return NextResponse.json(await getRuntimeSkills(cwd));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { filePath: string; disableModelInvocation: boolean };
    const { filePath, disableModelInvocation } = body;
    if (!filePath) return NextResponse.json({ error: "filePath required" }, { status: 400 });
    if (!existsSync(filePath)) return NextResponse.json({ error: "file not found" }, { status: 404 });

    setRuntimeSkillModelInvocation(filePath, disableModelInvocation);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
