"use client";

import { useCallback, useEffect, useRef } from "react";
import { sendAgentCommand as postAgentCommand } from "../lib/agent/agent-client";
import type { RuntimeCommand } from "../lib/agent/runtime-command";
import type { AnyAgentEvent as AgentEvent } from "../lib/events/event-types";
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

export interface SessionConnectionAgentState {
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

export type SessionLoadResult = (SessionData & { agentState?: SessionConnectionAgentState }) | null;

export interface SessionContextResult {
  context: { messages: AgentMessage[]; entryIds: string[] };
}

export type SessionConnectionEvent =
  | { type: "connecting" }
  | { type: "connected" }
  | { type: "probe"; statusCode: number | null };

interface UseSessionConnectionOptions {
  onConnectionEvent?: (event: SessionConnectionEvent) => void;
}

export function resolveSessionId(sessionId: string | null): string {
  if (!sessionId) throw new Error("sessionId is required");
  return sessionId;
}

function shouldDisconnectConnection(statusCode: number | null): boolean {
  return statusCode === 404;
}

export function useSessionConnection(sessionId: string | null, options: UseSessionConnectionOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const connectionProbeRef = useRef<AbortController | null>(null);
  const onEventRef = useRef<((event: AgentEvent) => void) | null>(null);
  const sessionIdRef = useRef<string | null>(sessionId);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const report = useCallback((event: SessionConnectionEvent) => {
    optionsRef.current.onConnectionEvent?.(event);
  }, []);

  const disconnectEvents = useCallback(() => {
    connectionProbeRef.current?.abort();
    connectionProbeRef.current = null;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const connectEvents = useCallback(
    (nextSessionId?: string) => {
      const sid = nextSessionId ?? sessionIdRef.current;
      if (!sid) return;
      sessionIdRef.current = sid;
      disconnectEvents();
      report({ type: "connecting" });
      const es = new EventSource(`/api/agent/${encodeURIComponent(sid)}/events`);
      eventSourceRef.current = es;
      es.onopen = () => {
        if (eventSourceRef.current === es) {
          connectionProbeRef.current?.abort();
          connectionProbeRef.current = null;
          report({ type: "connected" });
        }
      };
      es.onmessage = (e) => {
        if (eventSourceRef.current === es) report({ type: "connected" });
        try {
          const event = JSON.parse(e.data) as AgentEvent;
          onEventRef.current?.(event);
        } catch {}
      };
      es.onerror = () => {
        if (eventSourceRef.current !== es) return;
        connectionProbeRef.current?.abort();
        const probe = new AbortController();
        connectionProbeRef.current = probe;
        fetch(`/api/sessions/${encodeURIComponent(sid)}`, {
          cache: "no-store",
          signal: probe.signal,
        })
          .then((res) => {
            if (eventSourceRef.current !== es || sessionIdRef.current !== sid || probe.signal.aborted) {
              return;
            }
            if (shouldDisconnectConnection(res.status)) {
              es.close();
              eventSourceRef.current = null;
            }
            report({ type: "probe", statusCode: res.status });
          })
          .catch(() => {
            if (eventSourceRef.current !== es || sessionIdRef.current !== sid || probe.signal.aborted) {
              return;
            }
            report({ type: "probe", statusCode: null });
          });
      };
    },
    [disconnectEvents, report],
  );

  const sendAgentCommand = useCallback(
    async <T>(command: RuntimeCommand, nextSessionId?: string): Promise<T> => {
      const sid = resolveSessionId(nextSessionId ?? sessionIdRef.current);
      return postAgentCommand<T>(sid, command);
    },
    [],
  );

  return {
    eventSourceRef,
    onEventRef,
    connectEvents,
    disconnectEvents,
    sendAgentCommand,
  };
}
