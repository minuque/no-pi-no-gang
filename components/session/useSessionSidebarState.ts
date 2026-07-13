"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTranslations } from "next-intl";

import type { SessionInfo } from "@/lib/types";

import { buildCwdSessionGroups, getRecentCwds } from "./SessionSidebarSupport";

interface SessionSidebarStateOptions {
  onSelectSession: (session: SessionInfo, restore?: boolean) => void;
  initialSessionId?: string | null;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null) => void;
  onSessionsChange?: (sessions: SessionInfo[]) => void;
}

export function useSessionSidebarState({
  onSelectSession,
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

  const handleSelectCwd = useCallback(
    (cwd: string) => {
      onCwdChange?.(cwd);
    },
    [onCwdChange],
  );

  return {
    t,
    allSessions,
    loading,
    error,
    loadSessions,
    cwdGroups,
    allSessionsSorted,
    handleSelectCwd,
  };
}
