export type ActivityState = "running" | "success" | "error";

export interface PrototypeActivity {
  detail: string;
  duration?: string;
  label: string;
  state: ActivityState;
}

export const prototypeActivities: PrototypeActivity[] = [
  { label: "Read design contract", detail: "DESIGN.md", duration: "0.8s", state: "success" },
  { label: "Searched chat renderer", detail: "18 matches in 7 files", duration: "1.4s", state: "success" },
  { label: "Edit", detail: "apps/web/components/chat/CodexMessage.tsx", duration: "2.1s", state: "success" },
  { label: "Run verify:fast", detail: "Typecheck · Lint · Unit tests", state: "running" },
  { label: "Preview image", detail: "Unsupported image payload", duration: "0.2s", state: "error" },
];

export const prototypeCode = `export function resolveChatStyle(value: string | null) {
  return value === "codex" ? "codex" : "claude";
}`;

export const prototypeDiff = [
  { kind: "context", text: "export function ChatSurface() {" },
  { kind: "remove", text: "  return <MessageView messages={messages} />;" },
  { kind: "add", text: "  return <CodexMessageList messages={messages} />;" },
  { kind: "context", text: "}" },
] as const;

export const prototypeRows = [
  ["Renderer", "Claude", "Codex"],
  ["User message", "Bubble", "Bubble"],
  ["Agent message", "Accent rail", "Plain text"],
  ["Tool result", "Timeline", "Activity row"],
];

export const prototypeTasks = [
  [true, "Map real message blocks"],
  [true, "Keep Claude renderer unchanged"],
  [false, "Validate narrow layout"],
] as const;
