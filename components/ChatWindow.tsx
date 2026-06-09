"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage, SessionInfo, SessionTreeNode, ToolResultMessage } from "@/lib/types";
import { MessageView } from "./MessageView";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ChatMinimap, MINIMAP_WIDTH } from "./ChatMinimap";
import { SessionLoading } from "./SessionLoading";
import { useAgentSession, type AgentPhase } from "@/hooks/useAgentSession";
import { useChatScroll } from "@/hooks/useChatScroll";
import { useDragDrop } from "@/hooks/useDragDrop";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  session: SessionInfo | null;
  newSessionCwd: string | null;
  onAgentEnd?: () => void;
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionForked?: (newSessionId: string) => void;
  modelsRefreshKey?: number;
  chatInputRef?: React.RefObject<ChatInputHandle | null>;
  onBranchDataChange?: (tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  onSessionStatsChange?: (stats: { tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null) => void;
  onContextUsageChange?: (usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => void;
  recentCwds?: string[];
  homeDir?: string;
  onCwdSelect?: (cwd: string) => void;
  onCwdDefault?: () => void;
}

function phaseLabel(phase: AgentPhase): string {
  if (phase?.kind === "running_skill") {
    return `Running skill: ${phase.skill}...`;
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

const TYPEWRITER_PHRASES = [
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

function Typewriter({ phrases }: { phrases: string[] }) {
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

export function ChatWindow({ session, newSessionCwd, onAgentEnd, onSessionCreated, onSessionForked, modelsRefreshKey, chatInputRef, onBranchDataChange, onSystemPromptChange, onSessionStatsChange, onContextUsageChange, recentCwds, homeDir = "", onCwdSelect, onCwdDefault }: Props) {
  const {
    data, loading, error, messages, entryIds, streamState, commands,
    agentRunning, modelNames, modelList, modelThinkingLevels, modelThinkingLevelMaps, thinkingLevel,
    retryInfo, contextUsage, forkingEntryId,
    displayModel: displayModelValue, sessionStats,
    agentPhase,
    activeLeafId,
    isNew,
    handleSend, handleAbort, handleFork, handleNavigate, handleModelChange,
    handleThinkingLevelChange, handleAgentEventRef,
  } = useAgentSession({
    session, newSessionCwd, onAgentEnd, onSessionCreated, onSessionForked,
    modelsRefreshKey, onBranchDataChange, onSystemPromptChange,
  });

  const { isDark } = useTheme();

  // Push session stats up to AppShell for the top bar.
  // Compare scalar fields to avoid loops from new object identity each render.
  const statsKey = sessionStats
    ? `${sessionStats.tokens.input}|${sessionStats.tokens.output}|${sessionStats.tokens.cacheRead}|${sessionStats.tokens.cacheWrite}|${sessionStats.cost ?? 0}`
    : null;
  const sessionStatsRef = useRef(sessionStats);
  sessionStatsRef.current = sessionStats;
  useEffect(() => {
    onSessionStatsChange?.(sessionStatsRef.current);
  }, [statsKey, onSessionStatsChange]);
  useEffect(() => () => { onSessionStatsChange?.(null); }, [onSessionStatsChange]);

  // Push context usage up to AppShell as well.
  const ctxKey = contextUsage
    ? `${contextUsage.percent ?? "null"}|${contextUsage.contextWindow}|${contextUsage.tokens ?? "null"}`
    : null;
  const contextUsageRef = useRef(contextUsage);
  contextUsageRef.current = contextUsage;
  useEffect(() => {
    onContextUsageChange?.(contextUsageRef.current);
  }, [ctxKey, onContextUsageChange]);
  useEffect(() => () => { onContextUsageChange?.(null); }, [onContextUsageChange]);

  const onDrop = useCallback((files: File[]) => {
    chatInputRef?.current?.addImages(files);
  }, [chatInputRef]);

  const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(onDrop);

  // Retry: re-send last user message
  const handleRetry = useCallback(() => {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (!lastUser) return;
    let content = "";
    if (typeof lastUser.content === "string") {
      content = lastUser.content;
    } else {
      content = (lastUser.content as Array<{ type: string; text?: string }>)
        .filter(b => b.type === "text")
        .map(b => b.text ?? "")
        .join("\n");
    }
    if (content) handleSend(content);
  }, [messages, handleSend]);

  // Edit and resend: send edited content as a new message
  const handleEditResend = useCallback((content: string) => {
    handleSend(content);
  }, [handleSend]);

  const isEmptyNew = isNew && messages.length === 0 && !streamState.isStreaming && !agentRunning;

  const availableThinkingLevels = displayModelValue
    ? (modelThinkingLevels[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;

  const currentThinkingLevelMap = displayModelValue
    ? (modelThinkingLevelMaps[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;

  const cwd = session?.cwd ?? newSessionCwd;
  const projectName = cwd ? cwd.split(/[/\\]/).pop() : undefined;

  const branchOptions = useMemo(() => {
    const options: { id: string; label: string }[] = [];
    const tree = data?.tree;
    if (!tree) return options;
    function walk(nodes: SessionTreeNode[]) {
      for (const node of nodes) {
        if (node.children.length > 1) {
          for (const child of node.children) {
            if (child.label) options.push({ id: child.entry.id, label: child.label });
          }
        }
        walk(node.children);
      }
    }
    walk(tree);
    return options;
  }, [data?.tree]);

  const activeBranch = useMemo(() => {
    const tree = data?.tree;
    if (!tree || !activeLeafId) return undefined;
    function find(nodes: SessionTreeNode[]): string | undefined {
      for (const node of nodes) {
        if (node.entry.id === activeLeafId) return node.label;
        const found = find(node.children);
        if (found) return found;
      }
      return undefined;
    }
    return find(tree);
  }, [data?.tree, activeLeafId]);

  // Streaming metrics — token count + TPS
  const streamStartRef = useRef<number | null>(null);
  const [streamingTokens, setStreamingTokens] = useState<number>(0);
  const [streamingTps, setStreamingTps] = useState<number | null>(null);
  const streamStateRef = useRef(streamState);
  streamStateRef.current = streamState;

  useEffect(() => {
    if (!agentRunning) {
      streamStartRef.current = null;
      setStreamingTokens(0);
      setStreamingTps(null);
      return;
    }
    const tick = () => {
      const msg = streamStateRef.current.streamingMessage;
      if (!msg) return;
      const content = msg.content;
      if (!content) return;
      let chars = 0;
      if (typeof content === "string") {
        chars = content.length;
      } else if (Array.isArray(content)) {
        for (const b of content) {
          if (b.type === "text") chars += (b as { text?: string }).text?.length ?? 0;
          else if (b.type === "thinking") chars += (b as { thinking?: string }).thinking?.length ?? 0;
          else if (b.type === "toolCall") chars += JSON.stringify((b as { input?: unknown }).input ?? {}).length;
        }
      }
      const est = Math.round(chars / 4);
      setStreamingTokens(est);
      const now = Date.now();
      if (streamStartRef.current === null) streamStartRef.current = now;
      const elapsed = (now - streamStartRef.current) / 1000;
      if (elapsed > 0.5) setStreamingTps(est / elapsed);
    };
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
  }, [agentRunning]);

  // ── Native scroll controller (replaces Virtuoso) ──
  const {
    containerRef: scrollContainerRef,
    scrollToBottom,
    isAtBottom,
  } = useChatScroll();

  // Pre-compute tool result lookup (needed by all message renders)
  const toolResultsMap = useMemo(() => {
    const map = new Map<string, ToolResultMessage>();
    for (const msg of messages) {
      if (msg.role === "toolResult") {
        map.set((msg as ToolResultMessage).toolCallId, msg as ToolResultMessage);
      }
    }
    return map;
  }, [messages]);

  // Last assistant index (for Retry button)
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  }, [messages]);

  // Initial scroll to bottom when session loads with existing messages.
  const didInitialScroll = useRef(false);
  useEffect(() => { didInitialScroll.current = false; }, [session?.id]);
  useEffect(() => {
    if (!didInitialScroll.current && messages.length > 0 && !agentRunning) {
      didInitialScroll.current = true;
      scrollToBottom("instant");
    }
  }, [messages.length, agentRunning, scrollToBottom]);

  // When agent starts, jump to bottom so the user sees their message + response.
  useEffect(() => {
    if (agentRunning) {
      scrollToBottom("auto");
    }
  }, [agentRunning, scrollToBottom]);

  const chatInputElement = (
    <ChatInput
      ref={chatInputRef}
      onSend={handleSend}
      onAbort={handleAbort}
      isStreaming={agentRunning}
      model={displayModelValue}
      modelNames={modelNames}
      modelList={modelList}
      onModelChange={handleModelChange}
      thinkingLevel={thinkingLevel}
      onThinkingLevelChange={session || isNew ? handleThinkingLevelChange : undefined}
      availableThinkingLevels={availableThinkingLevels}
      thinkingLevelMap={currentThinkingLevelMap}
      retryInfo={retryInfo}
      commands={commands}
      contextUsage={contextUsage}
      currentProject={projectName}
      activeBranch={activeBranch}
      branchOptions={branchOptions}
      onBranchChange={handleNavigate}
      recentCwds={recentCwds}
      homeDir={homeDir}
      onCwdSelect={onCwdSelect}
      onCwdDefault={onCwdDefault}
      streamingTokens={streamingTokens}
      streamingTps={streamingTps}
    />
  );

  if (loading) {
    return <SessionLoading />;
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex animate-[drop-zone-in_0.15s_ease_both] items-center justify-center backdrop-blur-[1px]" style={{ background: "var(--accent-subtle)" }}>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[0, 0.8, 1.6].map((delay) => (
              <div
                key={delay}
                className="absolute h-[720px] w-[720px] rounded-full animate-[drop-ripple_2.4s_ease-out_infinite_backwards]"
                style={{
                  transformOrigin: "center",
                  animationDelay: `${delay}s`,
                  border: "1.5px solid var(--accent-ring)",
                }}
              />
            ))}
          </div>
          <svg
            width="280" height="280" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg"
            style={{ filter: "drop-shadow(0 6px 18px color-mix(in oklab, var(--accent), transparent 82%))" }}
          >
            <rect x="28" y="44" width="84" height="60" rx="8" fill="var(--accent-soft)" stroke="var(--accent-ring)" strokeWidth="1.8"/>
            <path d="M36 100 L54 72 L68 88 L80 74 L104 100Z" fill="color-mix(in oklab, var(--accent), transparent 84%)" stroke="color-mix(in oklab, var(--accent), transparent 60%)" strokeWidth="1.4" strokeLinejoin="round"/>
            <circle cx="96" cy="58" r="8" fill="color-mix(in oklab, var(--accent), transparent 78%)" stroke="color-mix(in oklab, var(--accent), transparent 45%)" strokeWidth="1.6"/>
            <g stroke="color-mix(in oklab, var(--accent), transparent 55%)" strokeWidth="1.4" strokeLinecap="round">
              <line x1="96" y1="46" x2="96" y2="43"/>
              <line x1="96" y1="70" x2="96" y2="73"/>
              <line x1="84" y1="58" x2="81" y2="58"/>
              <line x1="108" y1="58" x2="111" y2="58"/>
              <line x1="87.5" y1="49.5" x2="85.4" y2="47.4"/>
              <line x1="104.5" y1="66.5" x2="106.6" y2="68.6"/>
              <line x1="104.5" y1="49.5" x2="106.6" y2="47.4"/>
              <line x1="87.5" y1="66.5" x2="85.4" y2="68.6"/>
            </g>
          </svg>
        </div>
      )}

      {isEmptyNew ? (
        <div
          className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8"
          style={{ animation: "fade-in-up 0.4s ease both" }}
        >
          <div className="w-full max-w-[1148px]">
            <div
              className="mb-3"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginLeft: 16,
                marginRight: 52,
                fontFamily: "var(--font-mono)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1, lineHeight: 1.4 }}>
                <img
                  src={isDark ? "/pi-logo-on-dark.svg" : "/pi-logo-on-light.svg"}
                  alt="Pi Agent Web"
                  style={{ height: 28, width: "auto" }}
                />
                <span style={{ fontSize: 14, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  <Typewriter phrases={TYPEWRITER_PHRASES} />
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  web <span style={{ color: "var(--text)" }}>v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"}</span>
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  pi <span style={{ color: "var(--text)" }}>v{process.env.NEXT_PUBLIC_PI_VERSION ?? "0.0.0"}</span>
                </span>
              </div>
            </div>
            {chatInputElement}
          </div>
        </div>
      ) : (
      <>
      <div className="flex-1 overflow-hidden relative" style={{ paddingRight: MINIMAP_WIDTH, animation: "fade-in-up 0.35s ease both" }}>
        {/* ── Native scroll viewport ── */}
        <div
          ref={scrollContainerRef}
          className="h-full overflow-y-auto [scrollbar-width:none]"
        >
          <div style={{ paddingTop: 16 }}>
            {/* Completed messages (skip toolResult — rendered inline by MessageView) */}
            {messages.map((msg, i) => {
              if (msg.role === "toolResult") return null;
              const entryId = entryIds[i];
              const prevAssistantEntryId =
                msg.role === "user" && i > 0 && messages[i - 1]?.role === "assistant"
                  ? entryIds[i - 1]
                  : undefined;
              let showTimestamp = false;
              if (msg.role === "assistant") {
                showTimestamp = true;
                for (let j = i + 1; j < messages.length; j++) {
                  const r = messages[j]?.role;
                  if (r === "user") break;
                  if (r === "assistant") { showTimestamp = false; break; }
                }
                if (showTimestamp && streamState.isStreaming && i === messages.length - 1) {
                  showTimestamp = false;
                }
              }
              const isLastAssistant = msg.role === "assistant" && i === lastAssistantIdx && !streamState.isStreaming;

              return (
                <div key={i} className="mx-auto max-w-[1148px] px-4">
                  <MessageView
                    message={msg}
                    toolResults={toolResultsMap}
                    modelNames={modelNames}
                    entryId={entryId}
                    onFork={agentRunning || isNew || (i === 0 && msg.role === "user") ? undefined : handleFork}
                    forking={forkingEntryId === entryId}
                    onNavigate={agentRunning ? undefined : handleNavigate}
                    prevAssistantEntryId={agentRunning ? undefined : prevAssistantEntryId}
                    onEditContent={(content) => chatInputRef?.current?.insertIfEmpty(content)}
                    showTimestamp={showTimestamp}
                    prevTimestamp={i > 0 ? (messages[i - 1] as AgentMessage & { timestamp?: number }).timestamp : undefined}
                    onRetry={isLastAssistant && !agentRunning ? handleRetry : undefined}
                    onEditResend={msg.role === "user" && !agentRunning ? handleEditResend : undefined}
                  />
                </div>
              );
            })}

            {/* Streaming content */}
            {streamState.isStreaming && streamState.streamingMessage && (
              <div className="mx-auto max-w-[1148px] px-4">
                <MessageView
                  message={streamState.streamingMessage as AgentMessage}
                  isStreaming
                  modelNames={modelNames}
                />
              </div>
            )}

            {/* Phase indicator (agent running, no message yet) */}
            {agentRunning && !streamState.streamingMessage && (
              <div className="mx-auto max-w-[1148px] px-4 py-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
                <span className="animate-[pulse_1.5s_infinite]">{phaseLabel(agentPhase)}</span>
              </div>
            )}

            {/* Bottom spacer — keeps last message from hugging the edge */}
            <div style={{ height: 24 }} />
          </div>
        </div>

        {/* Scroll-to-bottom button */}
        {!isAtBottom && (
          <div style={{
            position: "absolute",
            bottom: 12,
            left: 0,
            right: MINIMAP_WIDTH,
            display: "flex",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}>
            <button
              onClick={() => scrollToBottom("smooth")}
              title="Scroll to bottom"
              style={{
                pointerEvents: "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                cursor: "pointer",
                color: "var(--text-muted)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.30)",
                transition: "background 0.15s, color 0.15s, transform 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text)";
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-panel)";
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        {chatInputElement}
      </div>

      {/* Minimap — absolutely positioned on right edge, full ChatWindow height */}
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: MINIMAP_WIDTH }}>
        <ChatMinimap
          messages={messages}
          streamingMessage={streamState.streamingMessage}
          scrollContainer={scrollContainerRef}
          virtual
        />
      </div>
      </>
      )}
    </div>
  );
}