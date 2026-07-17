import { mkdirSync } from "fs";
import { NextResponse } from "next/server";
import { homedir } from "os";
import { join } from "path";

export async function POST() {
  try {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const dir = join(homedir(), `pi-cwd-${date}`);
    mkdirSync(dir, { recursive: true });
    return NextResponse.json({ cwd: dir });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
