"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SessionInfo } from "@/lib/types";

import { buildCwdSessionGroups, getCwdLabel, matchesSessionSearch } from "./SessionSidebarSupport";

export interface UseSessionSearchOptions {
  allSessions: SessionInfo[];
  selectedCwd: string | null;
  onSelectSession: (session: SessionInfo) => void;
  onCwdChange?: (cwd: string | null) => void;
}

export function useSessionSearch({
  allSessions,
  selectedCwd,
  onSelectSession,
  onCwdChange,
}: UseSessionSearchOptions) {
  const t = useTranslations("SessionSidebar");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedSearchQuery.length > 0;
  const cwdGroups = useMemo(() => buildCwdSessionGroups(allSessions), [allSessions]);

  const searchCwdGroups = useMemo(() => {
    const groups = [...cwdGroups].sort((a, b) => {
      if (a.cwd === selectedCwd && b.cwd !== selectedCwd) return -1;
      if (b.cwd === selectedCwd && a.cwd !== selectedCwd) return 1;
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
        return { ...group, sessions };
      })
      .filter((group) => group.sessions.length > 0);
  }, [cwdGroups, isSearching, normalizedSearchQuery, selectedCwd, t]);

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
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchInputRef,
    searchCwdGroups,
    handleSearchSelectSession,
  };
}
