"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EntryTreeNode, SessionEntry } from "@/lib/types";

interface Props {
  tree: EntryTreeNode[];
  activeLeafId: string | null;
  onLeafChange: (leafId: string | null) => void;
  /** When true, renders as a compact inline button for embedding in a top bar */
  inline?: boolean;
  /** When inline, use this ref's bounding rect to size/position the dropdown */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Controlled open state for inline mode */
  open?: boolean;
  /** Called when the button is clicked in inline mode */
  onToggle?: () => void;
  /** Whether a session is currently active (used to show appropriate empty reason) */
  hasSession?: boolean;
  /** Disable switching while the agent is streaming */
  disabled?: boolean;
  /** Hide the control entirely when the current session has no branch paths */
  hideWhenEmpty?: boolean;
}

// Find the set of entry IDs on the path from root to activeLeafId
function buildActivePath(nodes: EntryTreeNode[], targetId: string | null): Set<string> {
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

// Compress a linear chain into the first branching/leaf node.
// Returns the representative node to display, plus a count of skipped nodes.
function compress(node: EntryTreeNode): { node: EntryTreeNode; skipped: number } {
  let current = node;
  let skipped = 0;
  while (current.children.length === 1) {
    current = current.children[0];
    skipped++;
  }
  return { node: current, skipped };
}

function getLabel(entry: SessionEntry): string {
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
    if (msg.role === "assistant") return "[assistant]";
  }
  return entry.type;
}

// Does the tree have any branching at all?
function hasBranch(nodes: EntryTreeNode[]): boolean {
  for (const node of nodes) {
    if (node.children.length > 1) return true;
    if (hasBranch(node.children)) return true;
  }
  return false;
}

interface TreeNodeProps {
  node: EntryTreeNode;
  activePathIds: Set<string>;
  depth: number;
  isLast: boolean;
  parentLines: boolean[]; // whether ancestor at each depth has more siblings after
  onSelect: (id: string) => void;
  onPreview?: (id: string) => void;
  disabled?: boolean;
}

function TreeNodeView({
  node,
  activePathIds,
  depth,
  isLast,
  parentLines,
  onSelect,
  onPreview,
  disabled,
}: TreeNodeProps) {
  const { node: rep, skipped } = compress(node);
  const isActive = activePathIds.has(rep.entry.id);
  const isOnPath = activePathIds.has(node.entry.id) || activePathIds.has(rep.entry.id);
  const label = getLabel(rep.entry);
  const role =
    rep.entry.type === "message" && "message" in rep.entry
      ? (rep.entry.message as { role: string }).role
      : null;

  return (
    <div>
      {/* This node row */}
      <div
        title={`Switch branch path inside this .jsonl: ${label}`}
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
        {/* Indent guide lines */}
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

        {/* Branch connector */}
        <div
          style={{
            width: 16,
            flexShrink: 0,
            position: "relative",
            height: "100%",
            alignSelf: "stretch",
          }}
        >
          {/* vertical line up (to parent) */}
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
          {/* horizontal line to node */}
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

        {/* Node dot */}
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            flexShrink: 0,
            background: isActive
              ? "var(--accent)"
              : isOnPath
                ? "var(--text-muted)"
                : "var(--border)",
            border: isActive ? "none" : "1px solid var(--text-dim)",
            marginRight: 6,
            boxShadow: isActive
              ? "0 0 0 4px color-mix(in oklab, var(--accent), transparent 88%)"
              : "none",
            transition: "background 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
          }}
        />

        {/* Role badge */}
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

        {/* Skipped indicator */}
        {skipped > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-dim)", marginRight: 5, flexShrink: 0 }}>
            +{skipped}
          </span>
        )}

        {/* Label */}
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

      {/* Children */}
      {rep.children.map((child, idx) => (
        <TreeNodeView
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

function findNodePath(
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

function countBranchPaths(node: EntryTreeNode): number {
  const { node: displayNode } = compress(node);
  if (displayNode.children.length === 0) return 1;
  return displayNode.children.reduce((sum, child) => sum + countBranchPaths(child), 0);
}

function getEntryRole(entry: SessionEntry): string {
  if (entry.type === "message" && "message" in entry) {
    return (entry.message as { role: string }).role;
  }
  return entry.type;
}

function getEntryTime(entry: SessionEntry): string {
  const date = new Date(entry.timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function BranchNavigator({
  tree,
  activeLeafId,
  onLeafChange,
  inline,
  containerRef,
  open: openProp,
  onToggle,
  hasSession,
  disabled = false,
  hideWhenEmpty = false,
}: Props) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp !== undefined ? openProp : openInternal;
  const [panelMounted, setPanelMounted] = useState(open);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setPanelMounted(true);
      return;
    }
    const id = window.setTimeout(() => setPanelMounted(false), 180);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open || !inline) return;
    const anchor = containerRef?.current ?? btnRef.current;
    if (!anchor) return;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(anchor);
    return () => ro.disconnect();
  }, [open, inline, containerRef]);

  const activePathIds = useMemo(() => buildActivePath(tree, activeLeafId), [tree, activeLeafId]);
  const [previewLeafId, setPreviewLeafId] = useState<string | null>(activeLeafId);

  const handleSelect = useCallback(
    (id: string) => {
      onLeafChange(id);
      setOpenInternal(false);
    },
    [onLeafChange],
  );

  useEffect(() => {
    setPreviewLeafId(activeLeafId);
  }, [activeLeafId]);

  const noBranchReason = !hasSession
    ? "No active .jsonl session"
    : !hasBranch(tree)
      ? "This .jsonl session has no branch paths"
      : null;

  // Find first meaningful node (skip pure linear prefix)
  const compressed = tree.length > 0 ? compress(tree[0]) : null;
  const firstNode = compressed?.node ?? null;
  const hasContent = !noBranchReason && firstNode && firstNode.children.length > 1;
  const branchCount = firstNode
    ? Math.max(
        0,
        firstNode.children.reduce((total, child) => total + countBranchPaths(child), 0),
      )
    : 0;
  const currentPath = useMemo(() => findNodePath(tree, activeLeafId), [tree, activeLeafId]);
  const previewPath = useMemo(() => {
    const preferred = previewLeafId ?? activeLeafId;
    const found = findNodePath(tree, preferred);
    if (found.length > 0) return found;
    if (!firstNode?.children[0]) return [];
    return findNodePath(tree, compress(firstNode.children[0]).node.entry.id);
  }, [tree, previewLeafId, activeLeafId, firstNode]);
  const previewEntries = previewPath.filter((node) => node.entry.type === "message").slice(-6);
  const activeLabel =
    currentPath.length > 0 ? getLabel(currentPath[currentPath.length - 1].entry) : null;
  const previewLabel =
    previewPath.length > 0 ? getLabel(previewPath[previewPath.length - 1].entry) : null;

  if (hideWhenEmpty && !hasContent) return null;

  const branchIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );

  const chevron = (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="var(--text-dim)"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        marginLeft: 2,
        transform: open ? "rotate(180deg)" : "none",
        transition: "transform 0.15s",
      }}
    >
      <polyline points="2 3.5 5 6.5 8 3.5" />
    </svg>
  );

  if (inline) {
    return (
      <div style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
        <button
          ref={btnRef}
          onClick={() => (onToggle ? onToggle() : setOpenInternal((v) => !v))}
          disabled={disabled}
          title={
            disabled
              ? "Branch path switching is disabled while streaming"
              : hasContent
                ? `${branchCount} branch path${branchCount > 1 ? "s" : ""}`
                : (noBranchReason ?? "")
          }
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            margin: "auto 0",
            padding: 0,
            background: open
              ? "color-mix(in oklab, var(--accent), transparent 90%)"
              : hasContent
                ? "color-mix(in oklab, var(--accent), transparent 94%)"
                : "none",
            border: "none",
            borderRadius: 9999,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
            color: hasContent ? "var(--accent)" : "var(--text-muted)",
            transition: "color 0.1s, background 0.1s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = open
              ? "color-mix(in oklab, var(--accent), transparent 90%)"
              : hasContent
                ? "color-mix(in oklab, var(--accent), transparent 94%)"
                : "none";
            e.currentTarget.style.color = hasContent ? "var(--accent)" : "var(--text-muted)";
          }}
        >
          {branchIcon}
        </button>
        {panelMounted && dropdownPos && (
          <div
            style={{
              position: "fixed",
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              background: "var(--bg-panel)",
              borderBottom: "1px solid var(--border)",
              zIndex: 500,
              maxHeight: open ? 300 : 0,
              opacity: open ? 1 : 0,
              overflow: "hidden",
              pointerEvents: open ? "auto" : "none",
              transform: open ? "translateY(0)" : "translateY(-4px)",
              transition: "opacity 160ms ease, transform 180ms ease, max-height 180ms ease",
            }}
          >
            {hasContent && firstNode ? (
              <div style={{ padding: "4px 12px 8px 12px", maxHeight: 260, overflowY: "auto" }}>
                {firstNode.children.map((child, idx) => (
                  <TreeNodeView
                    key={child.entry.id}
                    node={child}
                    activePathIds={activePathIds}
                    depth={0}
                    isLast={idx === firstNode.children.length - 1}
                    parentLines={[]}
                    onSelect={handleSelect}
                    onPreview={setPreviewLeafId}
                    disabled={disabled}
                  />
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: "10px 16px",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                }}
              >
                {noBranchReason}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        flexShrink: 0,
        borderBottom: "1px solid var(--border)",
        background: "color-mix(in oklab, var(--bg-panel), transparent 20%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1148,
          margin: "0 auto",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <button
          onClick={() => setOpenInternal((v) => !v)}
          disabled={disabled}
          title={
            disabled
              ? "Branch path switching is disabled while streaming"
              : "Preview and switch branch paths inside this .jsonl session"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            maxWidth: "100%",
            height: 30,
            padding: "0 10px",
            borderRadius: 6,
            border: `1px solid ${open ? "color-mix(in oklab, var(--accent), transparent 72%)" : "var(--border)"}`,
            background: open ? "color-mix(in oklab, var(--accent), transparent 92%)" : "var(--bg)",
            color: open ? "var(--text)" : "var(--text-muted)",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
            transition: "background 140ms ease, border-color 140ms ease, color 140ms ease",
          }}
        >
          {branchIcon}
          <span style={{ fontSize: 12, fontWeight: 500, flexShrink: 0 }}>Branch paths</span>
          <span
            style={{
              height: 18,
              padding: "0 6px",
              borderRadius: 999,
              background: "var(--bg-hover)",
              color: "var(--text-dim)",
              fontSize: 11,
              lineHeight: "18px",
              fontFamily: "var(--font-mono)",
              flexShrink: 0,
            }}
          >
            {branchCount}
          </span>
          {activeLabel && (
            <span
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12,
                color: "var(--text-dim)",
              }}
            >
              {activeLabel}
            </span>
          )}
          {chevron}
        </button>
      </div>

      {panelMounted && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 700,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: 76,
            background: open ? "rgba(0,0,0,0.32)" : "rgba(0,0,0,0)",
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            transition: "opacity 160ms ease, background 160ms ease",
          }}
          onClick={() => setOpenInternal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(920px, calc(100vw - 40px))",
              maxHeight: "min(620px, calc(100vh - 112px))",
              display: "grid",
              gridTemplateColumns: "minmax(260px, 0.9fr) minmax(320px, 1.1fr)",
              overflow: "hidden",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-panel)",
              boxShadow: "0 24px 70px rgba(0,0,0,0.38)",
              transform: open ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.985)",
              transition: "transform 180ms ease",
            }}
          >
            <div
              style={{
                borderRight: "1px solid var(--border)",
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{ padding: "14px 16px 10px 16px", borderBottom: "1px solid var(--border)" }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  Branch paths
                </div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-dim)" }}>
                  Select a path inside the current .jsonl session
                </div>
              </div>
              <div style={{ padding: "8px 10px 12px 10px", overflowY: "auto" }}>
                {hasContent && firstNode ? (
                  firstNode.children.map((child, idx) => (
                    <TreeNodeView
                      key={child.entry.id}
                      node={child}
                      activePathIds={activePathIds}
                      depth={0}
                      isLast={idx === firstNode.children.length - 1}
                      parentLines={[]}
                      onSelect={handleSelect}
                      onPreview={setPreviewLeafId}
                      disabled={disabled}
                    />
                  ))
                ) : (
                  <div style={{ padding: 12, fontSize: 12, color: "var(--text-muted)" }}>
                    {noBranchReason ?? "This .jsonl session has no branch paths"}
                  </div>
                )}
              </div>
            </div>

            <div style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  padding: "14px 16px 10px 16px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    boxShadow: "0 0 0 4px color-mix(in oklab, var(--accent), transparent 88%)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {previewLabel ?? "Preview"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-dim)" }}>
                    {previewEntries.length} visible message{previewEntries.length !== 1 ? "s" : ""}
                    {previewLeafId === activeLeafId ? " · current path" : ""}
                  </div>
                </div>
              </div>
              <div style={{ padding: 16, overflowY: "auto" }}>
                {previewEntries.length > 0 ? (
                  previewEntries.map((node) => (
                    <div
                      key={node.entry.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "52px 1fr",
                        gap: 10,
                        padding: "9px 0",
                        borderBottom:
                          "1px solid color-mix(in oklab, var(--border), transparent 45%)",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                          color: "var(--text-dim)",
                          paddingTop: 1,
                        }}
                      >
                        {getEntryTime(node.entry)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "inline-flex",
                            height: 17,
                            alignItems: "center",
                            padding: "0 5px",
                            borderRadius: 4,
                            background: "var(--bg-hover)",
                            color: "var(--text-muted)",
                            fontSize: 10.5,
                            fontFamily: "var(--font-mono)",
                            marginBottom: 5,
                          }}
                        >
                          {getEntryRole(node.entry)}
                        </div>
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: 12,
                            lineHeight: "18px",
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {getLabel(node.entry)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
                    Hover a branch path to preview its message trail.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
