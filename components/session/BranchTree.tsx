"use client";

import { useTranslations } from "next-intl";

import type { EntryTreeNode, SessionEntry } from "@/lib/types";

export function buildActiveBranchPath(nodes: EntryTreeNode[], targetId: string | null): Set<string> {
  if (!targetId) return new Set();
  function search(nodes: EntryTreeNode[], path: string[]): string[] | null {
    for (const node of nodes) {
      const next = [...path, node.entry.id];
      if (node.entry.id === targetId) return next;
      const found = search(node.children, next);
      if (found) return found;
    }
    return null;
  }
  return new Set(search(nodes, []) ?? []);
}

export function compressLinearBranch(node: EntryTreeNode): { node: EntryTreeNode; skipped: number } {
  let current = node;
  let skipped = 0;
  while (current.children.length === 1) {
    current = current.children[0];
    skipped++;
  }
  return { node: current, skipped };
}

export function getBranchEntryLabel(entry: SessionEntry, t?: (key: string) => string): string {
  if (entry.type === "message" && "message" in entry) {
    const msg = entry.message as { role: string; content: unknown };
    const content = msg.content;
    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join(" ");
    }
    if (text.length > 40) text = text.slice(0, 40) + "…";
    if (text) return text;
    if (msg.role === "assistant") return t ? t("assistantFallback") : "[assistant]";
  }
  return entry.type;
}

export function hasBranchingPaths(nodes: EntryTreeNode[]): boolean {
  for (const node of nodes) {
    if (node.children.length > 1) return true;
    if (hasBranchingPaths(node.children)) return true;
  }
  return false;
}

interface TreeNodeProps {
  node: EntryTreeNode;
  activePathIds: Set<string>;
  depth: number;
  isLast: boolean;
  parentLines: boolean[];
  onSelect: (id: string) => void;
  onPreview?: (id: string) => void;
  disabled?: boolean;
}

export function BranchTreeNode({
  node,
  activePathIds,
  depth,
  isLast,
  parentLines,
  onSelect,
  onPreview,
  disabled,
}: TreeNodeProps) {
  const { node: rep, skipped } = compressLinearBranch(node);
  const t = useTranslations("BranchNavigator");
  const isActive = activePathIds.has(rep.entry.id);
  const isOnPath = activePathIds.has(node.entry.id) || activePathIds.has(rep.entry.id);
  const label = getBranchEntryLabel(rep.entry, t);
  const role =
    rep.entry.type === "message" && "message" in rep.entry
      ? (rep.entry.message as { role: string }).role
      : null;

  return (
    <div>
      {}
      <div
        title={t("switchBranch", { label })}
        style={{
          display: "flex",
          alignItems: "center",
          height: 24,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : isOnPath ? 1 : 0.82,
          transform: isActive ? "translateX(1px)" : "translateX(0)",
          transition: "opacity 180ms ease, transform 180ms ease",
        }}
        onMouseEnter={() => onPreview?.(rep.entry.id)}
        onClick={() => {
          if (!disabled) onSelect(rep.entry.id);
        }}
      >
        {}
        {parentLines.map((hasLine, i) => (
          <div
            key={i}
            style={{
              width: 16,
              flexShrink: 0,
              position: "relative",
              height: "100%",
              alignSelf: "stretch",
            }}
          >
            {hasLine && (
              <div
                style={{
                  position: "absolute",
                  left: 7,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: "var(--border)",
                }}
              />
            )}
          </div>
        ))}

        {}
        <div
          style={{
            width: 16,
            flexShrink: 0,
            position: "relative",
            height: "100%",
            alignSelf: "stretch",
          }}
        >
          {}
          <div
            style={{
              position: "absolute",
              left: 7,
              top: 0,
              bottom: isLast ? "50%" : 0,
              width: 1,
              background: "var(--border)",
            }}
          />
          {}
          <div
            style={{
              position: "absolute",
              left: 7,
              top: "50%",
              width: 9,
              height: 1,
              background: "var(--border)",
            }}
          />
        </div>

        {}
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            flexShrink: 0,
            background: isActive ? "var(--accent)" : isOnPath ? "var(--text-muted)" : "var(--border)",
            border: isActive ? "none" : "1px solid var(--text-dim)",
            marginRight: 6,
            boxShadow: isActive ? "0 0 0 4px color-mix(in oklab, var(--accent), transparent 88%)" : "none",
            transition: "background 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
          }}
        />

        {}
        {role && (
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              color: role === "user" ? "var(--accent)" : "var(--text-dim)",
              background: role === "user" ? "var(--accent-soft)" : "var(--bg-hover)",
              border: `1px solid ${role === "user" ? "color-mix(in oklab, var(--accent), transparent 80%)" : "var(--border)"}`,
              borderRadius: 3,
              padding: "0 4px",
              marginRight: 5,
              flexShrink: 0,
              lineHeight: "16px",
            }}
          >
            {role === "user" ? "U" : "A"}
          </span>
        )}

        {skipped > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-dim)", marginRight: 5, flexShrink: 0 }}>
            +{skipped}
          </span>
        )}

        <span
          style={{
            fontSize: 11,
            color: isActive ? "var(--text)" : isOnPath ? "var(--text-muted)" : "var(--text-dim)",
            fontWeight: isActive ? 500 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {label}
        </span>
      </div>

      {rep.children.map((child, idx) => (
        <BranchTreeNode
          key={child.entry.id}
          node={child}
          activePathIds={activePathIds}
          depth={depth + 1}
          isLast={idx === rep.children.length - 1}
          parentLines={[...parentLines, !isLast]}
          onSelect={onSelect}
          onPreview={onPreview}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

export function findNodePath(
  nodes: EntryTreeNode[],
  targetId: string | null,
  path: EntryTreeNode[] = [],
): EntryTreeNode[] {
  if (!targetId) return [];
  for (const node of nodes) {
    const next = [...path, node];
    if (node.entry.id === targetId) return next;
    const found = findNodePath(node.children, targetId, next);
    if (found.length > 0) return found;
  }
  return [];
}

export function countBranchPaths(node: EntryTreeNode): number {
  const { node: displayNode } = compressLinearBranch(node);
  if (displayNode.children.length === 0) return 1;
  return displayNode.children.reduce((sum, child) => sum + countBranchPaths(child), 0);
}

export function getSessionEntryRole(entry: SessionEntry): string {
  if (entry.type === "message" && "message" in entry) {
    return (entry.message as { role: string }).role;
  }
  return entry.type;
}

export function formatSessionEntryTime(entry: SessionEntry): string {
  const date = new Date(entry.timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
