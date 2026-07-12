"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTranslations } from "next-intl";

import type { SessionInfo } from "@/lib/types";

import {
  buildCwdSessionGroups,
  getCwdLabel,
  getRecentCwds,
  matchesSessionSearch,
} from "./SessionSidebarSupport";

interface SessionSidebarStateOptions {
  onSelectSession: (session: SessionInfo, restore?: boolean) => void;
  onNewSession?: (tempId: string, cwd: string) => void;
  initialSessionId?: string | null;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null) => void;
  onSessionsChange?: (sessions: SessionInfo[]) => void;
}

export function useSessionSidebarState({
  onSelectSession,
  onNewSession,
  initialSessionId,
  onInitialRestoreDone,
  refreshKey,
  selectedCwd: selCwd,
  onCwdChange,
  onSessionsChange,
}: SessionSidebarStateOptions) {
  const t = useTranslations("SessionSidebar");

  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);

  const acRef = useRef<AbortController | null>(null);

  const loadSessions = useCallback(
    async (showLoading = false) => {
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      try {
        if (showLoading) setLoading(true);
        const res = await fetch("/api/sessions", { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { sessions: SessionInfo[] };
        setAllSessions(data.sessions);
        onSessionsChange?.(data.sessions);
        setError(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(String(e));
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [onSessionsChange],
  );

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

  useEffect(() => {
    if (allSessions.length === 0) return;
    let cancelled = false;

    if (!selCwd) {
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
          modified: "",
        },
        ...groups,
      ];
    }
    return groups;
  }, [allSessions, selCwd]);

  const allSessionsSorted = useMemo(
    () => [...allSessions].sort((a, b) => b.modified.localeCompare(a.modified)),
    [allSessions],
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const isSearching = normalizedSearchQuery.length > 0;

  const searchCwdGroups = useMemo(() => {
    const groups = [...cwdGroups].sort((a, b) => {
      if (a.cwd === selCwd && b.cwd !== selCwd) return -1;
      if (b.cwd === selCwd && a.cwd !== selCwd) return 1;
      return b.modified.localeCompare(a.modified);
    });

    return groups
      .map((group) => {
        const cwdMatches = [getCwdLabel(group.cwd, t), group.cwd].some((value) =>
          value.toLowerCase().includes(normalizedSearchQuery),
        );
        const sessions = [
          ...(!isSearching || cwdMatches
            ? group.sessions
            : group.sessions.filter((session) => matchesSessionSearch(session, normalizedSearchQuery))),
        ].sort((a, b) => b.modified.localeCompare(a.modified));
        return {
          ...group,
          sessions,
        };
      })
      .filter((group) => group.sessions.length > 0);
  }, [cwdGroups, isSearching, normalizedSearchQuery, selCwd, t]);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSelectCwd = useCallback(
    (cwd: string) => {
      onCwdChange?.(cwd);
    },
    [onCwdChange],
  );

  const handleSearchSelectSession = useCallback(
    (session: SessionInfo) => {
      setSearchOpen(false);
      setSearchQuery("");
      onCwdChange?.(session.cwd);
      onSelectSession(session);
    },
    [onCwdChange, onSelectSession],
  );

  return {
    t,
    allSessions,
    loading,
    error,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchInputRef,
    loadSessions,
    handleNewSession,
    cwdGroups,
    allSessionsSorted,
    searchCwdGroups,
    handleSelectCwd,
    handleSearchSelectSession,
  };
}
