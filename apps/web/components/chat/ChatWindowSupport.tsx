"use client";

import { useEffect, useState } from "react";

import type { AgentPhase } from "@/components/session/hooks/useAgentSession";
import type { AgentMessage, EntryTreeNode } from "@/lib/types";

export function phaseLabel(phase: AgentPhase): string {
  if (phase?.kind === "running_skill") {
    return `Running skill: ${phase.skill}...`;
  }
  if (phase?.kind === "running_command") {
    return `Running command: ${phase.command}...`;
  }
  if (phase?.kind === "running_tools") {
    const names = phase.tools.map((t) => t.name);
    if (names.length === 0) return "Running tool...";
    if (names.length === 1) return `Running ${names[0]}...`;
    if (names.length <= 3) return `Running ${names.join(", ")}...`;
    return `Running ${names.slice(0, 2).join(", ")} (+${names.length - 2})...`;
  }
  if (phase?.kind === "waiting_model") return "Waiting for model...";
  return "Thinking...";
}

export function buildActivePathIds(tree: EntryTreeNode[] | undefined, targetId: string | null): Set<string> {
  if (!tree || !targetId) return new Set();
  function find(nodes: EntryTreeNode[], path: string[]): string[] | null {
    for (const node of nodes) {
      const next = [...path, node.entry.id];
      if (node.entry.id === targetId) return next;
      const found = find(node.children, next);
      if (found) return found;
    }
    return null;
  }
  return new Set(find(tree, []) ?? []);
}

export const TYPEWRITER_PHRASES = [
  "ready when you are.",
  "ask me anything.",
  "let's build something cool.",
  "explore your codebase.",
  "draft an email.",
  "summarize that paper.",
  "plan your weekend.",
  "explain it like I'm five.",
  "pair-program with me.",
  "fix that pesky bug.",
  "translate to 中文.",
  "write a haiku.",
  "brainstorm ideas.",
  "review my pull request.",
  "what should we cook tonight?",
  "ship it.",
  "make it pretty.",
  "rubber-duck with me.",
];

export const USER_ANCHOR_MAX_VISIBLE = 9;

export const USER_ANCHOR_ROW_HEIGHT = 28;

export const USER_ANCHOR_PANEL_PADDING_Y = 14;

export function getMessageText(message: AgentMessage): string {
  const content = message.content;
  if (typeof content === "string") return content;
  return content
    .map((block) => (block.type === "text" && "text" in block ? block.text : ""))
    .filter(Boolean)
    .join("\n");
}

export function summarizeUserMessage(message: AgentMessage, fallback: string): string {
  const text = getMessageText(message).replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > 28 ? `${text.slice(0, 28)}...` : text;
}

export function getUserMessageTitle(message: AgentMessage): string | undefined {
  return getMessageText(message).replace(/\s+/g, " ").trim() || undefined;
}

export function Typewriter({ phrases }: { phrases: string[] }) {
  const [phraseIdx, setPhraseIdx] = useState(() => Math.floor(Math.random() * phrases.length));
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [caretOn, setCaretOn] = useState(true);

  useEffect(() => {
    const blink = setInterval(() => setCaretOn((v) => !v), 530);
    return () => clearInterval(blink);
  }, []);

  useEffect(() => {
    const current = phrases[phraseIdx];
    let timeout: ReturnType<typeof setTimeout>;
    if (!deleting && text === current) {
      timeout = setTimeout(() => setDeleting(true), 1800);
    } else if (deleting && text === "") {
      setDeleting(false);
      setPhraseIdx((i) => (i + 1) % phrases.length);
    } else {
      const next = deleting ? current.slice(0, text.length - 1) : current.slice(0, text.length + 1);
      timeout = setTimeout(() => setText(next), deleting ? 28 : 55);
    }
    return () => clearTimeout(timeout);
  }, [text, deleting, phraseIdx, phrases]);

  return (
    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
      {text}
      <span style={{ opacity: caretOn ? 1 : 0, color: "var(--accent)", marginLeft: 1 }}>▍</span>
    </span>
  );
}
