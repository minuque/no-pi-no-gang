import { notFound } from "next/navigation";

import { CodexChatPrototype } from "@/components/prototype/codex-chat/CodexChatPrototype";

export default function CodexChatPrototypePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CodexChatPrototype />;
}
