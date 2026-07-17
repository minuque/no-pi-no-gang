"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import * as BranchTree from "./BranchTree";
import type { BranchNavigatorProps } from "./branch-types";

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
}: BranchNavigatorProps) {
  const t = useTranslations("BranchNavigator");
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
  const activePathIds = useMemo(
    () => BranchTree.buildActiveBranchPath(tree, activeLeafId),
    [tree, activeLeafId],
  );
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
    ? t("noActiveSession")
    : !BranchTree.hasBranchingPaths(tree)
      ? t("noBranchPaths")
      : null;
  const compressed = tree.length > 0 ? BranchTree.compressLinearBranch(tree[0]) : null;
  const firstNode = compressed?.node ?? null;
  const hasContent = !noBranchReason && firstNode && firstNode.children.length > 1;
  const branchCount = firstNode
    ? Math.max(
        0,
        firstNode.children.reduce((total, child) => total + BranchTree.countBranchPaths(child), 0),
      )
    : 0;
  const currentPath = useMemo(() => BranchTree.findNodePath(tree, activeLeafId), [tree, activeLeafId]);
  const previewPath = useMemo(() => {
    const preferred = previewLeafId ?? activeLeafId;
    const found = BranchTree.findNodePath(tree, preferred);
    if (found.length > 0) return found;
    if (!firstNode?.children[0]) return [];
    return BranchTree.findNodePath(
      tree,
      BranchTree.compressLinearBranch(firstNode.children[0]).node.entry.id,
    );
  }, [tree, previewLeafId, activeLeafId, firstNode]);
  const previewEntries = previewPath.filter((node) => node.entry.type === "message").slice(-6);
  const activeLabel =
    currentPath.length > 0
      ? BranchTree.getBranchEntryLabel(currentPath[currentPath.length - 1].entry, t)
      : null;
  const previewLabel =
    previewPath.length > 0
      ? BranchTree.getBranchEntryLabel(previewPath[previewPath.length - 1].entry, t)
      : null;
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
              ? t("disabledWhileStreaming")
              : hasContent
                ? t("branchCount", { count: branchCount })
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
                  <BranchTree.BranchTreeNode
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
          title={disabled ? t("disabledWhileStreaming") : t("previewSwitchBranch")}
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
          <span style={{ fontSize: 12, fontWeight: 500, flexShrink: 0 }}>{t("branchPaths")}</span>
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
              <div style={{ padding: "14px 16px 10px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{t("branchPaths")}</div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-dim)" }}>
                  {t("selectBranchPath")}
                </div>
              </div>
              <div style={{ padding: "8px 10px 12px 10px", overflowY: "auto" }}>
                {hasContent && firstNode ? (
                  firstNode.children.map((child, idx) => (
                    <BranchTree.BranchTreeNode
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
                    {noBranchReason ?? t("noBranchPaths")}
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
                    {previewLabel ?? t("preview")}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-dim)" }}>
                    {t("visibleMessages", { count: previewEntries.length })}
                    {previewLeafId === activeLeafId ? ` · ${t("currentPath")}` : ""}
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
                        borderBottom: "1px solid color-mix(in oklab, var(--border), transparent 45%)",
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
                        {BranchTree.formatSessionEntryTime(node.entry)}
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
                          {BranchTree.getSessionEntryRole(node.entry)}
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
                          {BranchTree.getBranchEntryLabel(node.entry, t)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "var(--text-dim)", fontSize: 12 }}>{t("hoverToPreview")}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
