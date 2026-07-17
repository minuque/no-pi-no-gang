import type { SessionEntry as PiSessionEntry } from "@earendil-works/pi-coding-agent";
import { buildSessionContext as buildPiSessionContext } from "@earendil-works/pi-coding-agent";
import type {
  JsonObject,
  JsonValue,
  SessionContextProjection,
  SessionRecord,
} from "@no-pi-no-gang/agent-protocol";

type PersistedEntry = JsonObject & {
  id: string;
  parentId: string | null;
  timestamp: string;
  type: string;
};

function isPersistedEntry(value: JsonObject): value is PersistedEntry {
  return (
    typeof value.id === "string" &&
    (typeof value.parentId === "string" || value.parentId === null) &&
    typeof value.timestamp === "string" &&
    typeof value.type === "string"
  );
}

export function mapPiSessionEntries(sessionId: string, entries: JsonObject[]): SessionRecord[] {
  return entries.map((entry) => {
    if (!isPersistedEntry(entry)) throw new Error("Invalid Pi session entry");
    const { id, parentId, timestamp, type, ...payload } = entry;
    return {
      id,
      sessionId,
      ...(parentId === null ? {} : { parentId }),
      kind: type,
      timestamp,
      payload,
    };
  });
}

function recordToPiEntry(record: SessionRecord): PiSessionEntry {
  const payload = record.payload as JsonObject;
  return {
    type: record.kind,
    id: record.id,
    parentId: record.parentId ?? null,
    timestamp: record.timestamp,
    ...payload,
  } as PiSessionEntry;
}

function normalizeToolCalls(message: JsonValue): JsonValue {
  if (!message || Array.isArray(message) || typeof message !== "object" || message.role !== "assistant") {
    return message;
  }
  if (!Array.isArray(message.content)) return message;
  return {
    ...message,
    content: message.content.map((block) => {
      if (!block || Array.isArray(block) || typeof block !== "object" || block.type !== "toolCall") {
        return block;
      }
      return {
        type: "toolCall",
        toolCallId:
          typeof block.toolCallId === "string"
            ? block.toolCallId
            : typeof block.id === "string"
              ? block.id
              : "",
        toolName:
          typeof block.toolName === "string"
            ? block.toolName
            : typeof block.name === "string"
              ? block.name
              : "",
        input:
          block.input && typeof block.input === "object" && !Array.isArray(block.input)
            ? block.input
            : block.arguments && typeof block.arguments === "object" && !Array.isArray(block.arguments)
              ? block.arguments
              : {},
      };
    }),
  };
}

export function projectPiSessionRecords(
  records: SessionRecord[],
  leafId?: string | null,
): SessionContextProjection {
  const entries = records.map(recordToPiEntry);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const piContext = buildPiSessionContext(entries, leafId, byId);

  if (leafId === null) {
    return {
      messages: [],
      recordIds: [],
      thinkingLevel: piContext.thinkingLevel,
      model: piContext.model,
    };
  }

  let current = leafId ? byId.get(leafId) : entries[entries.length - 1];
  if (!current) {
    return {
      messages: [],
      recordIds: [],
      thinkingLevel: piContext.thinkingLevel,
      model: piContext.model,
    };
  }

  const path: PiSessionEntry[] = [];
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  let compactionId: string | undefined;
  let firstKeptEntryId: string | undefined;
  for (const entry of path) {
    if (entry.type === "compaction") {
      compactionId = entry.id;
      firstKeptEntryId = entry.firstKeptEntryId;
    }
  }

  const recordIds: string[] = [];
  if (compactionId) {
    recordIds.push(compactionId);
    const compactionIndex = path.findIndex((entry) => entry.id === compactionId);
    const firstKeptIndex = firstKeptEntryId
      ? path.findIndex((entry, index) => index < compactionIndex && entry.id === firstKeptEntryId)
      : -1;
    const startIndex = firstKeptIndex >= 0 ? firstKeptIndex : compactionIndex;
    for (let index = startIndex; index < compactionIndex; index += 1) {
      if (path[index].type === "message") recordIds.push(path[index].id);
    }
    for (let index = compactionIndex + 1; index < path.length; index += 1) {
      if (path[index].type === "message") recordIds.push(path[index].id);
    }
  } else {
    for (const entry of path) {
      if (entry.type === "message") recordIds.push(entry.id);
    }
  }

  const messages = (piContext.messages as unknown as JsonValue[]).map((message) => {
    if (
      message &&
      !Array.isArray(message) &&
      typeof message === "object" &&
      message.role === "compactionSummary"
    ) {
      return {
        role: "user",
        content: `*The conversation history before this point was compacted into the following summary:*\n\n${typeof message.summary === "string" ? message.summary : ""}`,
        ...(typeof message.timestamp === "number" ? { timestamp: message.timestamp } : {}),
      };
    }
    return normalizeToolCalls(message);
  });

  return {
    messages,
    recordIds,
    thinkingLevel: piContext.thinkingLevel,
    model: piContext.model,
  };
}
