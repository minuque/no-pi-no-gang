"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTheme } from "@/hooks/useTheme";
import type { EntryTreeNode as BranchTreeNode, SessionEntry, SessionInfo } from "@/lib/types";

interface Props {
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
  onNewSession?: (sessionId: string, cwd: string) => void;
  initialSessionId?: string | null;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  onSessionDeleted?: (sessionId: string) => void;
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null) => void;
  onSessionsChange?: (sessions: SessionInfo[]) => void;
  branchTree?: BranchTreeNode[];
  branchActiveLeafId?: string | null;
  onBranchLeafChange?: (leafId: string | null) => void;
  branchSwitchDisabled?: boolean;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

type SessionMeta = {
  orphaned?: boolean;
  isOrphaned?: boolean;
  hasCompaction?: boolean;
  hasCompactions?: boolean;
  compacted?: boolean;
  isStreaming?: boolean;
  streaming?: boolean;
  liveStreaming?: boolean;
  live?: boolean;
  isLive?: boolean;
  agentState?: { isStreaming?: boolean };
};

function hasAnyFlag(session: SessionInfo, keys: (keyof SessionMeta)[]): boolean {
  const meta = session as SessionInfo & SessionMeta;
  return keys.some((key) => meta[key] === true);
}

/** Return the 5 most recently active cwds across all sessions */
function getRecentCwds(sessions: SessionInfo[]): string[] {
  const latestByCwd = new Map<string, string>(); // cwd -> most recent modified
  for (const s of sessions) {
    if (!s.cwd) continue;
    const prev = latestByCwd.get(s.cwd);
    if (!prev || s.modified > prev) {
      latestByCwd.set(s.cwd, s.modified);
    }
  }
  return [...latestByCwd.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, 5)
    .map(([cwd]) => cwd);
}

function getCwdLabel(cwd: string): string {
  const normalized = cwd.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized || "Unknown project";
}

interface CwdSessionGroup {
  cwd: string;
  sessions: SessionInfo[];
  tree: ForkTreeNode[];
  modified: string;
}

interface ForkTreeNode {
  session: SessionInfo;
  children: ForkTreeNode[];
}

function buildSessionTree(sessions: SessionInfo[]): ForkTreeNode[] {
  const byId = new Map<string, ForkTreeNode>();
  for (const s of sessions) {
    byId.set(s.id, { session: s, children: [] });
  }

  // Build a map of parentSessionId chains so we can resolve missing ancestors
  const parentOf = new Map<string, string>();
  for (const s of sessions) {
    if (s.parentSessionId) parentOf.set(s.id, s.parentSessionId);
  }

  // Walk up the parentSessionId chain to find the nearest ancestor that exists in byId
  function resolveAncestor(id: string): string | null {
    let cur = parentOf.get(id);
    const visited = new Set<string>();
    while (cur) {
      if (visited.has(cur)) return null; // cycle guard
      visited.add(cur);
      if (byId.has(cur)) return cur;
      cur = parentOf.get(cur);
    }
    return null;
  }

  const roots: ForkTreeNode[] = [];
  for (const node of byId.values()) {
    const ancestor = resolveAncestor(node.session.id);
    if (ancestor) {
      byId.get(ancestor)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort each level by modified desc
  const sort = (nodes: ForkTreeNode[]) => {
    nodes.sort((a, b) => b.session.modified.localeCompare(a.session.modified));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

function branchHasSplit(nodes: BranchTreeNode[]): boolean {
  for (const node of nodes) {
    if (node.children.length > 1) return true;
    if (branchHasSplit(node.children)) return true;
  }
  return false;
}

function countBranchPaths(node: BranchTreeNode): number {
  const displayNode = compressBranchNode(node);
  if (displayNode.children.length === 0) return 1;
  return displayNode.children.reduce((total, child) => total + countBranchPaths(child), 0);
}

function countAdditionalBranches(nodes: BranchTreeNode[]): number {
  if (!branchHasSplit(nodes) || nodes.length === 0) return 0;
  const root = compressBranchRoot(nodes[0]);
  const pathCount = root.children.reduce((total, child) => total + countBranchPaths(child), 0);
  return Math.max(0, pathCount - 1);
}

function buildBranchActivePath(nodes: BranchTreeNode[], targetId: string | null): Set<string> {
  if (!targetId) return new Set();
  function search(items: BranchTreeNode[], path: string[]): string[] | null {
    for (const node of items) {
      const next = [...path, node.entry.id];
      if (node.entry.id === targetId) return next;
      const found = search(node.children, next);
      if (found) return found;
    }
    return null;
  }
  return new Set(search(nodes, []) ?? []);
}

function compressBranchRoot(node: BranchTreeNode): BranchTreeNode {
  let current = node;
  while (current.children.length === 1) current = current.children[0];
  return current;
}

function compressBranchNode(node: BranchTreeNode): BranchTreeNode {
  let current = node;
  while (current.children.length === 1) current = current.children[0];
  return current;
}

function getBranchLabel(entry: SessionEntry): string {
  if (entry.type === "message" && "message" in entry) {
    const msg = entry.message as { role: string; content: unknown };
    const content = msg.content;
    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join(" ");
    }
    if (text.length > 40) text = text.slice(0, 40) + "...";
    if (text) return text;
    if (msg.role === "assistant") return "[assistant]";
  }
  return entry.type;
}

function containsSession(nodes: ForkTreeNode[], sessionId: string | null): boolean {
  if (!sessionId) return false;
  for (const node of nodes) {
    if (node.session.id === sessionId) return true;
    if (containsSession(node.children, sessionId)) return true;
  }
  return false;
}

function buildCwdSessionGroups(sessions: SessionInfo[]): CwdSessionGroup[] {
  const byCwd = new Map<string, SessionInfo[]>();
  for (const session of sessions) {
    if (!session.cwd) continue;
    const group = byCwd.get(session.cwd);
    if (group) group.push(session);
    else byCwd.set(session.cwd, [session]);
  }

  return [...byCwd.entries()]
    .map(([cwd, groupSessions]) => ({
      cwd,
      sessions: groupSessions,
      tree: buildSessionTree(groupSessions),
      modified: groupSessions.reduce(
        (latest, session) => (session.modified > latest ? session.modified : latest),
        "",
      ),
    }))
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

function matchesSessionSearch(session: SessionInfo, query: string): boolean {
  return [session.name ?? "", session.firstMessage ?? "", session.id].some((value) =>
    value.toLowerCase().includes(query),
  );
}

function PiAgentTitle() {
  const { isDark } = useTheme();

  return (
    <img
      src={isDark ? "/pi-logo-on-dark.svg" : "/pi-logo-on-light.svg"}
      alt="No Pi No Gang"
      width={22}
      height={22}
      style={{ opacity: 0.85 }}
    />
  );
}

// Shared icon components — tiny, crisp, inline
function IconFolder({ active }: { active: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "var(--accent)" : "var(--text-dim)"}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: active ? 1 : 0.6 }}
    >
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
    </svg>
  );
}

function IconChevron({ collapsed, size = 12 }: { collapsed: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: collapsed ? "none" : "rotate(180deg)",
        transition: "transform 0.2s ease",
      }}
    >
      <polyline points="2 3.5 5 6.5 8 3.5" />
    </svg>
  );
}

function IconFork() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--text-dim)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: 0.5 }}
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// ─── Header action button ───
function HeaderBtn({
  onClick,
  disabled,
  title,
  children,
  active: activeColor,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const active = !disabled && (hovered || activeColor);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        background: active ? "var(--bg-hover)" : "none",
        border: "none",
        borderRadius: 6,
        color: activeColor ? "var(--success)" : active ? "var(--text)" : "var(--text-muted)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}

export function SessionSidebar({
  selectedSessionId,
  onSelectSession,
  onNewSession,
  initialSessionId,
  onInitialRestoreDone,
  refreshKey,
  onSessionDeleted,
  selectedCwd: selCwd,
  onCwdChange,
  onSessionsChange,
  branchTree = [],
  branchActiveLeafId = null,
  onBranchLeafChange,
  branchSwitchDisabled = false,
}: Props) {
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionRefreshDone, setSessionRefreshDone] = useState(false);
  const [expandedCwds, setExpandedCwds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const sessionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { sessions: SessionInfo[] };
      setAllSessions(data.sessions);
      onSessionsChange?.(data.sessions);
      setError(null);
      if (!showLoading) {
        setSessionRefreshDone(true);
        if (sessionRefreshTimerRef.current) clearTimeout(sessionRefreshTimerRef.current);
        sessionRefreshTimerRef.current = setTimeout(() => setSessionRefreshDone(false), 2000);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    const isFirst = !initialLoadDone.current;
    initialLoadDone.current = true;
    loadSessions(isFirst);
  }, [loadSessions, refreshKey]);

  const restoredRef = useRef(false);

  const validateCwd = useCallback(async (cwd: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/cwd/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      const data = (await res.json().catch(() => ({}))) as { cwd?: string };
      return res.ok ? (data.cwd ?? cwd) : null;
    } catch {
      return null;
    }
  }, []);

  // Auto-select cwd and restore session from URL on first load
  useEffect(() => {
    if (allSessions.length === 0) return;
    let cancelled = false;

    if (!selCwd) {
      // If restoring a session, set cwd to match that session
      if (initialSessionId) {
        if (!restoredRef.current) {
          restoredRef.current = true;
          const target = allSessions.find((s) => s.id === initialSessionId);
          if (target) {
            onSelectSession(target, true);
            onCwdChange?.(target.cwd);
            return;
          }
          onInitialRestoreDone?.();
        }
        return;
      }
      const cwds = getRecentCwds(allSessions);
      void (async () => {
        for (const cwd of cwds) {
          const validCwd = await validateCwd(cwd);
          if (cancelled) return;
          if (validCwd) {
            onCwdChange?.(validCwd);
            return;
          }
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [
    allSessions,
    selCwd,
    initialSessionId,
    onSelectSession,
    onCwdChange,
    onInitialRestoreDone,
    validateCwd,
  ]);

  const handleNewSession = useCallback(() => {
    if (!selCwd) return;
    const tempId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    onNewSession?.(tempId, selCwd);
  }, [selCwd, onNewSession]);

  const cwdGroups = useMemo(() => {
    const groups = buildCwdSessionGroups(allSessions);
    if (selCwd && !groups.some((group) => group.cwd === selCwd)) {
      return [
        {
          cwd: selCwd,
          sessions: [],
          tree: [],
          modified: "",
        },
        ...groups,
      ];
    }
    return groups;
  }, [allSessions, selCwd]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedSearchQuery.length > 0;

  const visibleCwdGroups = useMemo(() => {
    if (!isSearching) return cwdGroups;
    return cwdGroups
      .map((group) => {
        const cwdMatches = [getCwdLabel(group.cwd), group.cwd].some((value) =>
          value.toLowerCase().includes(normalizedSearchQuery),
        );
        const sessions = cwdMatches
          ? group.sessions
          : group.sessions.filter((session) =>
              matchesSessionSearch(session, normalizedSearchQuery),
            );
        return {
          ...group,
          sessions,
          tree: buildSessionTree(sessions),
        };
      })
      .filter((group) => group.sessions.length > 0);
  }, [cwdGroups, isSearching, normalizedSearchQuery]);

  useEffect(() => {
    if (!selectedSessionId) return;
    const selectedGroup = cwdGroups.find((group) => containsSession(group.tree, selectedSessionId));
    if (!selectedGroup) return;
    setExpandedCwds((prev) => {
      if (prev.has(selectedGroup.cwd)) return prev;
      const next = new Set(prev);
      next.add(selectedGroup.cwd);
      return next;
    });
  }, [cwdGroups, selectedSessionId]);

  const handleSelectCwd = useCallback(
    (cwd: string) => {
      onCwdChange?.(cwd);
      setExpandedCwds((prev) => {
        if (prev.has(cwd)) return prev;
        const next = new Set(prev);
        next.add(cwd);
        return next;
      });
    },
    [onCwdChange],
  );

  const handleToggleCwd = useCallback((cwd: string) => {
    setExpandedCwds((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header — logo + search + actions in one row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 44,
          padding: "0 8px 0 10px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          gap: 6,
        }}
      >
        <PiAgentTitle />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
            height: 28,
            padding: "0 8px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            transition: "border-color 0.15s, background 0.15s",
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-dim)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, opacity: 0.5 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search sessions"
            style={{
              flex: 1,
              minWidth: 0,
              height: 26,
              padding: 0,
              border: "none",
              outline: "none",
              background: "none",
              color: "var(--text)",
              fontSize: 12,
              fontFamily: "inherit",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              title="Clear search"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                padding: 0,
                background: "none",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                flexShrink: 0,
                opacity: 0.5,
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <HeaderBtn
          onClick={handleNewSession}
          disabled={!selCwd}
          title={selCwd ? "New .jsonl session file" : "Select a project first"}
        >
          <IconPlus />
        </HeaderBtn>
        <HeaderBtn
          onClick={() => loadSessions(false)}
          title="Refresh sessions"
          active={sessionRefreshDone}
        >
          {sessionRefreshDone ? <IconCheck /> : <IconRefresh />}
        </HeaderBtn>
      </div>

      {/* Session list */}
      <div style={{ flex: "1 1 auto", overflowY: "auto", overflowX: "hidden", minHeight: 80 }}>
        {loading && (
          <div
            style={{
              padding: "20px 16px",
              color: "var(--text-dim)",
              fontSize: 12,
              letterSpacing: "0.02em",
            }}
          >
            Loading sessions...
          </div>
        )}
        {error && (
          <div style={{ padding: "12px 16px", color: "var(--danger)", fontSize: 12 }}>{error}</div>
        )}
        {!loading && !error && cwdGroups.length === 0 && (
          <div style={{ padding: "20px 16px", color: "var(--text-dim)", fontSize: 12 }}>
            No sessions
          </div>
        )}
        {!loading &&
          !error &&
          isSearching &&
          cwdGroups.length > 0 &&
          visibleCwdGroups.length === 0 && (
            <div style={{ padding: "20px 16px", color: "var(--text-dim)", fontSize: 12 }}>
              No matching sessions
            </div>
          )}
        {visibleCwdGroups.map((group) => (
          <CwdGroupSection
            key={group.cwd}
            group={group}
            selectedSessionId={selectedSessionId}
            isActive={group.cwd === selCwd}
            isCollapsed={!isSearching && !expandedCwds.has(group.cwd)}
            onSelectCwd={handleSelectCwd}
            onToggleCwd={handleToggleCwd}
            onSelectSession={onSelectSession}
            branchTree={branchTree}
            branchActiveLeafId={branchActiveLeafId}
            onBranchLeafChange={onBranchLeafChange}
            branchSwitchDisabled={branchSwitchDisabled}
            onRenamed={loadSessions}
            onSessionDeleted={(id) => {
              onSessionDeleted?.(id);
              loadSessions();
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── CWD Group Section ───
function CwdGroupSection({
  group,
  selectedSessionId,
  isActive,
  isCollapsed,
  onSelectCwd,
  onToggleCwd,
  onSelectSession,
  onRenamed,
  onSessionDeleted,
  branchTree,
  branchActiveLeafId,
  onBranchLeafChange,
  branchSwitchDisabled,
}: {
  group: CwdSessionGroup;
  selectedSessionId: string | null;
  isActive: boolean;
  isCollapsed: boolean;
  onSelectCwd: (cwd: string) => void;
  onToggleCwd: (cwd: string) => void;
  onSelectSession: (s: SessionInfo) => void;
  branchTree: BranchTreeNode[];
  branchActiveLeafId: string | null;
  onBranchLeafChange?: (leafId: string | null) => void;
  branchSwitchDisabled: boolean;
  onRenamed?: () => void;
  onSessionDeleted?: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const empty = group.sessions.length === 0;

  return (
    <section style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "stretch",
          minHeight: 56,
          background: isActive
            ? "color-mix(in oklab, var(--accent), transparent 94%)"
            : hovered
              ? "var(--bg-hover)"
              : "transparent",
          borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
          transition: "background 0.12s",
        }}
      >
        {/* Content area */}
        <button
          onClick={() => onSelectCwd(group.cwd)}
          title={group.cwd}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px 0 10px 14px",
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            color: "var(--text)",
          }}
        >
          {/* Project name row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <IconFolder active={isActive} />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                lineHeight: "20px",
              }}
            >
              {getCwdLabel(group.cwd)}
            </span>
          </div>

          {/* Path */}
          <div
            style={{
              marginTop: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "var(--text-dim)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              lineHeight: "16px",
              opacity: 0.7,
            }}
          >
            {group.cwd}
          </div>

          {/* Metadata row */}
          <div
            style={{
              marginTop: 5,
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--text-dim)",
              fontSize: 11.5,
              lineHeight: "16px",
            }}
          >
            <span>
              {group.sessions.length} session{group.sessions.length !== 1 ? "s" : ""}
            </span>
            {group.modified && (
              <span title={group.modified}>{formatRelativeTime(group.modified)}</span>
            )}
          </div>
        </button>

        {/* Chevron — right side */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCwd(group.cwd);
          }}
          title={isCollapsed ? "Expand" : "Collapse"}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            width: 32,
            paddingTop: 16,
            flexShrink: 0,
            background: "none",
            border: "none",
            color: "var(--text-dim)",
            cursor: "pointer",
            opacity: hovered || isActive ? 0.7 : 0.35,
            transition: "opacity 0.15s",
          }}
        >
          <IconChevron collapsed={isCollapsed} />
        </button>
      </div>

      {/* Session tree */}
      {!isCollapsed && (
        <div style={{ padding: "6px 0 0 14px" }}>
          {empty ? (
            <div
              style={{
                padding: "12px 12px 10px 4px",
                color: "var(--text-dim)",
                fontSize: 12,
                opacity: 0.6,
              }}
            >
              No sessions in this project
            </div>
          ) : (
            group.tree.map((node) => (
              <SessionTreeItem
                key={node.session.id}
                node={node}
                selectedSessionId={selectedSessionId}
                onSelectSession={onSelectSession}
                onRenamed={onRenamed}
                onSessionDeleted={onSessionDeleted}
                branchTree={branchTree}
                branchActiveLeafId={branchActiveLeafId}
                onBranchLeafChange={onBranchLeafChange}
                branchSwitchDisabled={branchSwitchDisabled}
                depth={0}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

// ─── Session Tree Item (recursive) ───
function SessionTreeItem({
  node,
  selectedSessionId,
  onSelectSession,
  onRenamed,
  onSessionDeleted,
  branchTree,
  branchActiveLeafId,
  onBranchLeafChange,
  branchSwitchDisabled,
  depth,
}: {
  node: ForkTreeNode;
  selectedSessionId: string | null;
  onSelectSession: (s: SessionInfo) => void;
  onRenamed?: () => void;
  onSessionDeleted?: (id: string) => void;
  branchTree: BranchTreeNode[];
  branchActiveLeafId: string | null;
  onBranchLeafChange?: (leafId: string | null) => void;
  branchSwitchDisabled: boolean;
  depth: number;
}) {
  const isSelectedPath = containsSession([node], selectedSessionId);
  const [collapsed, setCollapsed] = useState(true);
  const hasChildren = node.children.length > 0;
  const branchCount =
    node.session.id === selectedSessionId ? countAdditionalBranches(branchTree) : 0;
  const showLeafBranches = branchCount > 0;
  const branchRoot = branchTree.length > 0 ? compressBranchRoot(branchTree[0]) : null;
  const branchActivePathIds = useMemo(
    () => buildBranchActivePath(branchTree, branchActiveLeafId),
    [branchTree, branchActiveLeafId],
  );

  useEffect(() => {
    if (isSelectedPath) setCollapsed(false);
  }, [isSelectedPath]);

  return (
    <div>
      <SessionItem
        session={node.session}
        isSelected={node.session.id === selectedSessionId}
        onClick={() => onSelectSession(node.session)}
        onRenamed={onRenamed}
        onDeleted={(id) => onSessionDeleted?.(id)}
        depth={depth}
        hasChildren={hasChildren}
        branchCount={branchCount}
        liveStreamingFallback={node.session.id === selectedSessionId && branchSwitchDisabled}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />
      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <SessionTreeItem
              key={child.session.id}
              node={child}
              selectedSessionId={selectedSessionId}
              onSelectSession={onSelectSession}
              onRenamed={onRenamed}
              onSessionDeleted={onSessionDeleted}
              branchTree={branchTree}
              branchActiveLeafId={branchActiveLeafId}
              onBranchLeafChange={onBranchLeafChange}
              branchSwitchDisabled={branchSwitchDisabled}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
      {showLeafBranches && branchRoot && branchRoot.children.length > 1 && (
        <div style={{ marginLeft: (depth + 1) * 14 + 6, padding: "1px 0 6px 0" }}>
          {branchRoot.children.map((child) => (
            <BranchLeafItem
              key={child.entry.id}
              node={child}
              activePathIds={branchActivePathIds}
              depth={0}
              onSelect={onBranchLeafChange}
              disabled={branchSwitchDisabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BranchLeafItem({
  node,
  activePathIds,
  depth,
  onSelect,
  disabled,
}: {
  node: BranchTreeNode;
  activePathIds: Set<string>;
  depth: number;
  onSelect?: (leafId: string | null) => void;
  disabled: boolean;
}) {
  const displayNode = compressBranchNode(node);
  const isActive = activePathIds.has(displayNode.entry.id);
  const isOnPath = activePathIds.has(node.entry.id) || isActive;
  const label = displayNode.label ?? getBranchLabel(displayNode.entry);
  const indent = depth * 14;

  return (
    <div>
      <button
        onClick={() => {
          if (!disabled) onSelect?.(displayNode.entry.id);
        }}
        disabled={disabled}
        title={
          disabled
            ? "Branch path switching is disabled while streaming"
            : `Switch branch path inside this .jsonl: ${label}`
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: `calc(100% - ${indent}px)`,
          height: 26,
          padding: "0 8px 0 0",
          marginLeft: indent,
          background: isActive ? "color-mix(in oklab, var(--accent), transparent 92%)" : "none",
          border: "none",
          borderLeft: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "0 4px 4px 0",
          color: isActive ? "var(--text)" : isOnPath ? "var(--text-muted)" : "var(--text-dim)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            marginLeft: 7,
            flexShrink: 0,
            background: isActive
              ? "var(--accent)"
              : isOnPath
                ? "var(--text-muted)"
                : "var(--border)",
          }}
        />
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 11.5,
            lineHeight: "20px",
          }}
        >
          {label}
        </span>
      </button>
      {displayNode.children.map((child) => (
        <BranchLeafItem
          key={child.entry.id}
          node={child}
          activePathIds={activePathIds}
          depth={depth + 1}
          onSelect={onSelect}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

// ─── Single Session Item ───
function SessionItem({
  session,
  isSelected,
  onClick,
  onRenamed,
  onDeleted,
  depth = 0,
  hasChildren = false,
  branchCount = 0,
  liveStreamingFallback = false,
  collapsed = false,
  onToggleCollapse,
}: {
  session: SessionInfo;
  isSelected: boolean;
  onClick: () => void;
  onRenamed?: () => void;
  onDeleted?: (id: string) => void;
  depth?: number;
  hasChildren?: boolean;
  branchCount?: number;
  liveStreamingFallback?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [actionsFocused, setActionsFocused] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const title = session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12);
  const isFork = Boolean(session.parentSessionId) || depth > 0;
  const isOrphaned = hasAnyFlag(session, ["orphaned", "isOrphaned"]);
  const hasCompaction = hasAnyFlag(session, ["hasCompaction", "hasCompactions", "compacted"]);
  const agentState = (session as SessionInfo & SessionMeta).agentState;
  const isLiveStreaming =
    liveStreamingFallback ||
    agentState?.isStreaming === true ||
    hasAnyFlag(session, ["isStreaming", "streaming", "liveStreaming", "live", "isLive"]);

  const startRename = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setRenameValue(session.name ?? "");
      setRenaming(true);
      setTimeout(() => inputRef.current?.select(), 0);
    },
    [session.name],
  );

  const commitRename = useCallback(async () => {
    const name = renameValue.trim();
    setRenaming(false);
    if (name === (session.name ?? "")) return;
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onRenamed?.();
    } catch {
      // ignore
    }
  }, [renameValue, session.id, session.name, onRenamed]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  }, []);

  const handleDeleteConfirm = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setConfirmDelete(false);
      setDeleting(true);
      try {
        await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
        onDeleted?.(session.id);
      } catch {
        setDeleting(false);
      }
    },
    [session.id, onDeleted],
  );

  const handleDeleteCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

  const rowH = 48;

  // Depth thread color — fades with depth, forms vertical line when same-depth items stack
  const depthColor =
    depth === 0
      ? "color-mix(in oklab, var(--accent), transparent 86%)"
      : depth === 1
        ? "color-mix(in oklab, var(--accent), transparent 92%)"
        : "color-mix(in oklab, var(--accent), transparent 95%)";

  const borderColor = confirmDelete ? "var(--danger)" : isSelected ? "var(--accent)" : depthColor;
  const showRowActions = hovered || actionsFocused;

  return (
    <div
      onClick={confirmDelete || renaming ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setActionsFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setActionsFocused(false);
        }
      }}
      style={{
        position: "relative",
        height: rowH,
        display: "flex",
        alignItems: "center",
        marginLeft: depth * 14,
        paddingLeft: 8,
        paddingRight: 8,
        cursor: confirmDelete || renaming ? "default" : "pointer",
        background: confirmDelete
          ? "color-mix(in oklab, var(--danger), transparent 93%)"
          : isSelected
            ? "color-mix(in oklab, var(--accent), transparent 93%)"
            : hovered
              ? "var(--bg-selected)"
              : "transparent",
        borderLeft: `2px solid ${borderColor}`,
        borderRadius: "0 5px 5px 0",
        transition: "background 0.15s, border-color 0.15s",
        opacity: deleting ? 0.4 : 1,
        gap: 8,
        overflow: "hidden",
        marginBottom: 2,
      }}
    >
      {confirmDelete ? (
        <>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12.5,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Delete{" "}
            <b>
              &ldquo;{title.slice(0, 24)}
              {title.length > 24 ? "…" : ""}&rdquo;
            </b>
            ?
          </span>
          <button onClick={handleDeleteConfirm} style={btnDanger}>
            Delete
          </button>
          <button onClick={handleDeleteCancel} style={btnGhost}>
            Cancel
          </button>
        </>
      ) : renaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          autoFocus
          style={{
            flex: 1,
            fontSize: 13,
            padding: "4px 7px",
            border: "1px solid var(--accent)",
            borderRadius: 4,
            outline: "none",
            background: "var(--bg)",
            color: "var(--text)",
            height: 28,
          }}
        />
      ) : (
        <>
          {/* Fork icon */}
          {isFork && <IconFork />}

          {/* Text content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: isSelected ? 500 : 400,
                lineHeight: "18px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--text)",
              }}
              title={title}
            >
              {title}
            </div>
            <div
              style={{
                marginTop: 1,
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
                overflow: "hidden",
                whiteSpace: "nowrap",
                color: "var(--text-dim)",
                fontSize: 11.5,
                lineHeight: "16px",
              }}
            >
              {/* Session type badge */}
              {isFork && (
                <SessionMetaBadge title="Fork: separate .jsonl session file" tone="accent">
                  fork
                </SessionMetaBadge>
              )}
              {isOrphaned && (
                <SessionMetaBadge
                  title="Orphaned: parent .jsonl session file is missing"
                  tone="danger"
                >
                  orphan
                </SessionMetaBadge>
              )}
              {hasCompaction && (
                <SessionMetaBadge title="Has compaction entries in this .jsonl session" tone="warn">
                  compact
                </SessionMetaBadge>
              )}
              {isLiveStreaming && (
                <SessionMetaBadge title="Live streaming is active in this session" tone="success">
                  live
                </SessionMetaBadge>
              )}
              <span title={session.modified} style={{ flexShrink: 0 }}>
                {formatRelativeTime(session.modified)}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {session.messageCount} msg{session.messageCount !== 1 ? "s" : ""}
              </span>
              {branchCount > 0 && (
                <span
                  title="Branch paths inside this .jsonl session file"
                  style={{ flexShrink: 0 }}
                >
                  {branchCount} branch path{branchCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Fork collapse toggle */}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse?.();
              }}
              title={collapsed ? "Expand fork .jsonl files" : "Collapse fork .jsonl files"}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 18,
                height: 18,
                padding: 0,
                flexShrink: 0,
                background: "none",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                opacity: hovered ? 0.6 : 0.3,
                transition: "opacity 0.15s",
              }}
            >
              <IconChevron collapsed={collapsed} size={10} />
            </button>
          )}

          {/* Hover action buttons */}
          <div
            style={{
              display: "flex",
              gap: 5,
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 2,
              padding: 3,
              borderRadius: 8,
              background: "color-mix(in oklab, var(--bg-panel), transparent 4%)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.10), 0 0 0 1px var(--border)",
              opacity: showRowActions ? 1 : 0,
              pointerEvents: showRowActions ? "auto" : "none",
              transition: "opacity 0.15s",
            }}
          >
            <button
              onClick={startRename}
              title="Rename"
              style={btnIcon}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-selected)";
                e.currentTarget.style.color = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <IconEdit />
            </button>
            <button
              onClick={handleDeleteClick}
              title="Delete"
              style={btnIcon}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "color-mix(in oklab, var(--danger), transparent 90%)";
                e.currentTarget.style.color = "var(--danger)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <IconTrash />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Shared button styles ───
function SessionMetaBadge({
  children,
  title,
  tone = "muted",
}: {
  children: React.ReactNode;
  title: string;
  tone?: "muted" | "accent" | "warn" | "danger" | "success";
}) {
  const toneVar = tone === "muted" ? null : `var(--${tone})`;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 17,
        maxWidth: 72,
        padding: "0 5px",
        borderRadius: 3,
        background: toneVar
          ? `color-mix(in oklab, ${toneVar}, transparent 88%)`
          : "var(--bg-hover)",
        border: `1px solid ${
          toneVar ? `color-mix(in oklab, ${toneVar}, transparent 68%)` : "var(--border)"
        }`,
        color: toneVar ?? "var(--text-dim)",
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        lineHeight: "17px",
        flexShrink: 0,
        opacity: 0.9,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

const btnIcon: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  padding: 0,
  background: "var(--bg-hover)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-muted)",
  cursor: "pointer",
  flexShrink: 0,
  transition: "background 0.12s, color 0.12s, border-color 0.12s",
};

const btnDanger: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 26,
  padding: "0 10px",
  background: "var(--danger)",
  border: "none",
  borderRadius: 5,
  color: "var(--accent-on)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const btnGhost: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 26,
  padding: "0 10px",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
  whiteSpace: "nowrap",
};
