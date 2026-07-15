import type { SlashCommandItem } from "@/lib/pi/pi-resources";

type ForkSessionResponse = { cancelled: boolean; newSessionId?: string };

async function sessionRequest<T>(url: string, method: "GET" | "PATCH" | "POST", body?: object) {
  const response = await fetch(url, {
    method,
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok || result.error) throw new Error(result.error ?? `HTTP ${response.status}`);
  return result;
}

export function forkSessionAtEntry(sessionId: string, entryId: string): Promise<ForkSessionResponse> {
  return sessionRequest(`/api/sessions/${encodeURIComponent(sessionId)}/forks`, "POST", { entryId });
}

export function requestSessionContext<T = unknown>(
  sessionId: string,
  leafId: string | null,
): Promise<{ context: { messages: T[]; entryIds: string[] } }> {
  const url = `/api/sessions/${encodeURIComponent(sessionId)}/context`;
  return leafId ? sessionRequest(url, "PATCH", { leafId }) : sessionRequest(url, "GET");
}

export function resolveSlashCommand(message: string, commands: SlashCommandItem[]) {
  const cmdMatch = message.match(/^\/(\S+)\s*(.*)$/);
  if (!cmdMatch) return null;
  const commandName = cmdMatch[1];
  if (!commands.some((command) => command.name.toLowerCase() === commandName.toLowerCase())) {
    return null;
  }
  return { commandName, message: cmdMatch[2] };
}
