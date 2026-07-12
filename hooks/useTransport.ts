"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { sendAgentCommand as postAgentCommand } from "../lib/agent/agent-client";
import type { AnyAgentEvent as AgentEvent, AgentEventStatus } from "../lib/events/event-types";
import type { AgentMessage, EntryTreeNode, SessionInfo } from "../lib/types";

export interface SessionData {
  sessionId: string;
  filePath: string;
  info?: SessionInfo | null;
  tree: EntryTreeNode[];
  leafId: string | null;
  context: {
    messages: AgentMessage[];
    entryIds: string[];
    thinkingLevel: string;
    model: { provider: string; modelId: string; contextWindow?: number } | null;
  };
}

export interface TransportAgentState {
  running: boolean;
  state?: {
    isStreaming?: boolean;
    isCompacting?: boolean;
    exists?: boolean;
    running?: boolean;
    lastUpdated?: string;
    contextUsage?: {
      percent: number | null;
      contextWindow: number;
      tokens: number | null;
    } | null;
    systemPrompt?: string;
    thinkingLevel?: string;
  };
}

export type SessionLoadResult = (SessionData & { agentState?: TransportAgentState }) | null;

export interface SessionContextResult {
  context: { messages: AgentMessage[]; entryIds: string[] };
}

interface UseTransportOptions {
  isAgentRunning?: () => boolean;
  onStatusChange?: (status: AgentEventStatus) => void;
  onDestroyed?: () => void;
}

export function resolveSessionId(sessionId: string | null): string {
  if (!sessionId) throw new Error("sessionId is required");
  return sessionId;
}

export function useTransport(sessionId: string | null, options: UseTransportOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [eventStatus, setEventStatusState] = useState<AgentEventStatus>("idle");
  const [sessionExists, setSessionExists] = useState(sessionId !== null);
  const [sessionDestroyed, setSessionDestroyed] = useState(false);
  const [agentLastUpdated, setAgentLastUpdated] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef<((event: AgentEvent) => void) | null>(null);
  const sessionIdRef = useRef<string | null>(sessionId);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    sessionIdRef.current = sessionId;
    setSessionExists(sessionId !== null);
    if (sessionId) setSessionDestroyed(false);
  }, [sessionId]);

  const setEventStatus = useCallback((status: AgentEventStatus) => {
    setEventStatusState(status);
    optionsRef.current.onStatusChange?.(status);
  }, []);

  const disconnectEvents = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const connectEvents = useCallback(
    (nextSessionId?: string) => {
      const sid = nextSessionId ?? sessionIdRef.current;
      if (!sid) return;
      sessionIdRef.current = sid;
      disconnectEvents();
      setEventStatus("connecting");
      const es = new EventSource(`/api/agent/${encodeURIComponent(sid)}/events`);
      eventSourceRef.current = es;
      es.onopen = () => {
        if (eventSourceRef.current === es) setEventStatus("connected");
      };
      es.onmessage = (e) => {
        if (eventSourceRef.current === es) setEventStatus("connected");
        try {
          const event = JSON.parse(e.data) as AgentEvent;
          onEventRef.current?.(event);
        } catch {}
      };
      es.onerror = () => {
        if (eventSourceRef.current !== es) return;
        es.close();
        eventSourceRef.current = null;
        fetch(`/api/sessions/${encodeURIComponent(sid)}`, { cache: "no-store" })
          .then((res) => {
            if (res.status === 404) {
              setSessionExists(false);
              setSessionDestroyed(true);
              setAgentLastUpdated(new Date().toISOString());
              optionsRef.current.onDestroyed?.();
              setEventStatus("destroyed");
              return;
            }
            setSessionExists(true);
            setSessionDestroyed(false);
            if (optionsRef.current.isAgentRunning?.()) {
              setEventStatus("reconnecting");
              setTimeout(() => {
                if (optionsRef.current.isAgentRunning?.()) connectEvents(sid);
              }, 1000);
            } else {
              setEventStatus("readonly");
            }
          })
          .catch(() => {
            if (optionsRef.current.isAgentRunning?.()) {
              setEventStatus("reconnecting");
              setTimeout(() => {
                if (optionsRef.current.isAgentRunning?.()) connectEvents(sid);
              }, 1000);
            } else {
              setEventStatus("readonly");
            }
          });
      };
    },
    [disconnectEvents, setEventStatus],
  );

  const loadSession = useCallback(
    async (showLoading = false, includeState = false, nextSessionId?: string): Promise<SessionLoadResult> => {
      const sid = nextSessionId ?? sessionIdRef.current;
      if (!sid) return null;
      try {
        if (showLoading) setLoading(true);
        setLoadingError(null);
        const url = includeState
          ? `/api/sessions/${encodeURIComponent(sid)}?includeState`
          : `/api/sessions/${encodeURIComponent(sid)}`;
        const res = await fetch(url);
        if (res.status === 404) {
          setSessionExists(false);
          setSessionDestroyed(true);
          setAgentLastUpdated(new Date().toISOString());
          setEventStatus("destroyed");
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSessionExists(true);
        setSessionDestroyed(false);
        return (await res.json()) as SessionLoadResult;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setLoadingError(message);
        return null;
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [setEventStatus],
  );

  const loadContext = useCallback(
    async (leafId: string | null, nextSessionId?: string): Promise<SessionContextResult | null> => {
      const sid = nextSessionId ?? sessionIdRef.current;
      if (!sid) return null;
      try {
        const url = leafId
          ? `/api/sessions/${encodeURIComponent(sid)}/context?leafId=${encodeURIComponent(leafId)}`
          : `/api/sessions/${encodeURIComponent(sid)}/context`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as SessionContextResult;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [],
  );

  const sendAgentCommand = useCallback(
    async <T>(command: Record<string, unknown>, nextSessionId?: string): Promise<T> => {
      const sid = resolveSessionId(nextSessionId ?? sessionIdRef.current);
      return postAgentCommand<T>(sid, command);
    },
    [],
  );

  return {
    loading,
    error,
    loadingError,
    eventStatus,
    sessionExists,
    sessionDestroyed,
    agentLastUpdated,
    eventSourceRef,
    onEventRef,
    connectEvents,
    disconnectEvents,
    loadSession,
    loadContext,
    sendAgentCommand,
  };
}
