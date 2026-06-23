"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type AgentPhase, useAgentSession } from "@/hooks/useAgentSession";
import { useChatScroll } from "@/hooks/useChatScroll";
import { useDragDrop } from "@/hooks/useDragDrop";
import { useTheme } from "@/hooks/useTheme";
import type { AgentMessage, EntryTreeNode, SessionInfo, ToolResultMessage } from "@/lib/types";

import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { MessageView } from "./MessageView";
import { SessionLoading } from "./SessionLoading";
import { UserMessageNav } from "./UserMessageNav";

interface Props {
  session: SessionInfo | null;
  newSessionCwd: string | null;
  onAgentEnd?: () => void;
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionForked?: (newSessionId: string) => void;
  modelsRefreshKey?: number;
  chatInputRef?: React.RefObject<ChatInputHandle | null>;
  onBranchDataChange?: (
    tree: EntryTreeNode[],
    activeLeafId: string | null,
    onLeafChange: (leafId: string | null) => void,
  ) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  onSessionStatsChange?: (
    stats: {
      tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
      cost?: number;
    } | null,
  ) => void;
  onContextUsageChange?: (
    usage: { percent: number | null; contextWindow: number; tokens: number | null } | null,
  ) => void;
  onLoadingChange?: (loading: boolean) => void;
  onSseStatusChange?: (
    status: { label: string; tone: "muted" | "success" | "warn" | "danger" } | null,
  ) => void;
  recentCwds?: string[];
  homeDir?: string;
  onCwdSelect?: (cwd: string) => void;
  onCwdDefault?: () => void;
}

function phaseLabel(phase: AgentPhase): string {
  if (phase?.kind === "running_skill") {
    return `Running skill: ${phase.skill}...`;
  }
  if (phase?.kind === "running_command") {
    return `Running command: ${phase.command}...`;
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

function buildActivePathIds(
  tree: EntryTreeNode[] | undefined,
  targetId: string | null,
): Set<string> {
  if (!tree || !targetId) return new Set();
  function find(nodes: EntryTreeNode[], path: string[]): string[] | null {
    for (const node of nodes) {
      const next = [...path, node.entry.id];
      if (node.entry.id === targetId) return next;
      const found = find(node.children, next);
      if (found) return found;
    }
    return null;
  }
  return new Set(find(tree, []) ?? []);
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

const USER_ANCHOR_MAX_VISIBLE = 9;
const USER_ANCHOR_ROW_HEIGHT = 28;
const USER_ANCHOR_PANEL_PADDING_Y = 14;

function getMessageText(message: AgentMessage): string {
  const content = message.content;
  if (typeof content === "string") return content;
  return content
    .map((block) => (block.type === "text" && "text" in block ? block.text : ""))
    .filter(Boolean)
    .join("\n");
}

function summarizeUserMessage(message: AgentMessage, fallback: string): string {
  const text = getMessageText(message).replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > 28 ? `${text.slice(0, 28)}...` : text;
}

function getUserMessageTitle(message: AgentMessage): string | undefined {
  return getMessageText(message).replace(/\s+/g, " ").trim() || undefined;
}

function formatTurnElapsed(seconds: number): string {
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

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

export function ChatWindow({
  session,
  newSessionCwd,
  onAgentEnd,
  onSessionCreated,
  onSessionForked,
  modelsRefreshKey,
  chatInputRef,
  onBranchDataChange,
  onStreamingChange,
  onSystemPromptChange,
  onSessionStatsChange,
  onContextUsageChange,
  onLoadingChange,
  onSseStatusChange,
  recentCwds,
  homeDir = "",
  onCwdSelect,
  onCwdDefault,
}: Props) {
  const {
    data,
    loading,
    branchLoading,
    error,
    messages,
    entryIds,
    streamState,
    commands,
    agentRunning,
    modelNames,
    modelList,
    modelThinkingLevels,
    modelThinkingLevelMaps,
    toolPreset,
    thinkingLevel,
    retryInfo,
    contextUsage,
    forkingEntryId,
    displayModel: displayModelValue,
    sessionStats,
    agentPhase,
    eventStatus,
    sessionStatus,
    activeLeafId,
    isNew,
    handleSend,
    handleAbort,
    handleFork,
    handleNavigate,
    handleModelChange,
    handleThinkingLevelChange,
    handleAgentEventRef,
  } = useAgentSession({
    session,
    newSessionCwd,
    onAgentEnd,
    onSessionCreated,
    onSessionForked,
    modelsRefreshKey,
    onBranchDataChange,
    onSystemPromptChange,
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
  useEffect(
    () => () => {
      onSessionStatsChange?.(null);
    },
    [onSessionStatsChange],
  );

  // Push context usage up to AppShell as well.
  const ctxKey = contextUsage
    ? `${contextUsage.percent ?? "null"}|${contextUsage.contextWindow}|${contextUsage.tokens ?? "null"}`
    : null;
  const contextUsageRef = useRef(contextUsage);
  contextUsageRef.current = contextUsage;
  useEffect(() => {
    onContextUsageChange?.(contextUsageRef.current);
  }, [ctxKey, onContextUsageChange]);
  useEffect(
    () => () => {
      onContextUsageChange?.(null);
    },
    [onContextUsageChange],
  );

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);
  useEffect(
    () => () => {
      onLoadingChange?.(false);
    },
    [onLoadingChange],
  );

  useEffect(() => {
    onStreamingChange?.(agentRunning);
  }, [agentRunning, onStreamingChange]);
  useEffect(
    () => () => {
      onStreamingChange?.(false);
    },
    [onStreamingChange],
  );

  const onDrop = useCallback(
    (files: File[]) => {
      chatInputRef?.current?.addImages(files);
    },
    [chatInputRef],
  );

  const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
    useDragDrop(onDrop);

  // Retry: re-send last user message
  const handleRetry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    let content = "";
    if (typeof lastUser.content === "string") {
      content = lastUser.content;
    } else {
      content = (lastUser.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n");
    }
    if (content) handleSend(content);
  }, [messages, handleSend]);

  // Edit and resend: send edited content as a new message
  const handleEditResend = useCallback(
    (content: string) => {
      handleSend(content);
    },
    [handleSend],
  );

  const showWelcome =
    !session && messages.length === 0 && !streamState.isStreaming && !agentRunning;

  const availableThinkingLevels = displayModelValue
    ? (modelThinkingLevels[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;

  const currentThinkingLevelMap = displayModelValue
    ? (modelThinkingLevelMaps[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;

  const cwd = session?.cwd ?? newSessionCwd;
  const projectName = cwd ? cwd.split(/[/\\]/).pop() : undefined;

  const activeBranch = useMemo(() => {
    const tree = data?.tree;
    if (!tree || !activeLeafId) return undefined;
    function find(nodes: EntryTreeNode[]): string | undefined {
      for (const node of nodes) {
        if (node.entry.id === activeLeafId) return node.label;
        const found = find(node.children);
        if (found) return found;
      }
      return undefined;
    }
    return find(tree);
  }, [data?.tree, activeLeafId]);
  const activePathIds = useMemo(
    () => buildActivePathIds(data?.tree, activeLeafId),
    [data?.tree, activeLeafId],
  );

  const sseStatus = useMemo(() => {
    if (sessionStatus.destroyed) return { label: "会话已销毁", tone: "danger" as const };
    if (eventStatus === "reconnecting") return { label: "reconnecting", tone: "warn" as const };
    if (sessionStatus.readonly || eventStatus === "readonly") {
      return { label: "readonly", tone: "muted" as const };
    }
    if (eventStatus === "connecting") return { label: "connecting", tone: "muted" as const };
    if (eventStatus === "connected") return { label: "connected", tone: "success" as const };
    if (sessionStatus.exists) return { label: "idle", tone: "muted" as const };
    return null;
  }, [eventStatus, sessionStatus]);

  // Push SSE status upward to AppShell top bar
  useEffect(() => {
    onSseStatusChange?.(sseStatus);
  }, [sseStatus, onSseStatusChange]);
  useEffect(
    () => () => {
      onSseStatusChange?.(null);
    },
    [onSseStatusChange],
  );

  // ── Native scroll controller (replaces Virtuoso) ──
  const {
    containerRef: scrollContainerRef,
    setContainerRef: setScrollContainerRef,
    contentRef: scrollContentRef,
    scrollToBottom,
    isAtBottom,
  } = useChatScroll({ follow: agentRunning });

  // Pre-compute tool result lookup (needed by all message renders)
  const toolResultsMap = useMemo(() => {
    const map = new Map<string, ToolResultMessage>();
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "toolResult") {
        const entryId = entryIds[i];
        const isCurrentPath = entryId
          ? activePathIds.size === 0 || activePathIds.has(entryId)
          : false;
        map.set((msg as ToolResultMessage).toolCallId, {
          ...(msg as ToolResultMessage),
          _entryId: entryId,
          _isCurrentPath: isCurrentPath,
        });
      }
    }
    return map;
  }, [messages, entryIds, activePathIds, activeLeafId, activeBranch]);

  const renderedMessages = useMemo(() => {
    const items: Array<{
      msg: AgentMessage;
      entryId: string;
      originalIndex: number;
    }> = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "toolResult") continue;
      items.push({ msg, entryId: entryIds[i], originalIndex: i });
    }

    let lastAssistantIdx = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].msg.role === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }

    return { items, lastAssistantIdx };
  }, [messages, entryIds]);

  // Pre-compute turn dividers: elapsed time before each user message (except first)
  const turnDividers = useMemo(() => {
    const dividers = new Map<number, string>(); // itemIndex → elapsed string
    let prevTs: number | undefined;
    for (let i = 0; i < renderedMessages.items.length; i++) {
      const { msg } = renderedMessages.items[i];
      if (msg.role === "user" && msg.timestamp) {
        if (prevTs !== undefined) {
          const elapsed = (msg.timestamp - prevTs) / 1000;
          dividers.set(i, formatTurnElapsed(elapsed));
        }
        prevTs = msg.timestamp;
      }
    }
    return dividers;
  }, [renderedMessages]);

  const userMessageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeUserAnchorId, setActiveUserAnchorId] = useState<string | null>(null);
  const [showUserAnchorPanel, setShowUserAnchorPanel] = useState(false);

  const userAnchors = useMemo(() => {
    return renderedMessages.items
      .filter(({ msg }) => msg.role === "user")
      .map(({ msg, entryId, originalIndex }, index) => {
        const id = entryId ?? `message-${originalIndex}`;
        return {
          id,
          index: index + 1,
          label: summarizeUserMessage(msg, `User message ${index + 1}`),
          title: getUserMessageTitle(msg),
        };
      });
  }, [renderedMessages.items]);

  const activeUserAnchorIndex = Math.max(
    0,
    userAnchors.findIndex((anchor) => anchor.id === activeUserAnchorId),
  );
  const firstVisibleAnchorIndex = Math.max(
    0,
    Math.min(activeUserAnchorIndex - 4, Math.max(0, userAnchors.length - USER_ANCHOR_MAX_VISIBLE)),
  );
  const visibleUserAnchors = userAnchors.slice(
    firstVisibleAnchorIndex,
    firstVisibleAnchorIndex + USER_ANCHOR_MAX_VISIBLE,
  );
  const userAnchorPanelHeight =
    visibleUserAnchors.length * USER_ANCHOR_ROW_HEIGHT + USER_ANCHOR_PANEL_PADDING_Y * 2;

  const scrollToUserAnchor = useCallback((id: string) => {
    const node = userMessageRefs.current.get(id);
    if (!node) return;
    setActiveUserAnchorId(id);
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || userAnchors.length === 0) return;

    const updateActiveAnchor = () => {
      const containerTop = container.getBoundingClientRect().top;
      const targetY = containerTop + Math.min(container.clientHeight * 0.32, 220);
      let activeId = userAnchors[0].id;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const anchor of userAnchors) {
        const node = userMessageRefs.current.get(anchor.id);
        if (!node) continue;
        const distance = Math.abs(node.getBoundingClientRect().top - targetY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          activeId = anchor.id;
        }
      }

      setActiveUserAnchorId((current) => (current === activeId ? current : activeId));
    };

    updateActiveAnchor();
    container.addEventListener("scroll", updateActiveAnchor, { passive: true });
    window.addEventListener("resize", updateActiveAnchor);
    return () => {
      container.removeEventListener("scroll", updateActiveAnchor);
      window.removeEventListener("resize", updateActiveAnchor);
    };
  }, [scrollContainerRef, userAnchors]);

  // Last assistant index (for Retry button)
  // Initial scroll to bottom when session loads with existing messages.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    didInitialScroll.current = false;
  }, [session?.id]);
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
      recentCwds={recentCwds}
      homeDir={homeDir}
      onCwdSelect={onCwdSelect}
      onCwdDefault={onCwdDefault}
      toolPreset={toolPreset}
      agentStatus={
        sessionStatus.destroyed
          ? "会话已销毁"
          : sessionStatus.isCompacting
            ? "Compacting..."
            : agentRunning
              ? phaseLabel(agentPhase)
              : undefined
      }
    />
  );

  if (loading) {
    return <SessionLoading />;
  }

  if (error) {
    return <div className="flex h-full items-center justify-center text-red-400">{error}</div>;
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
        <div
          className="pointer-events-none absolute inset-0 z-50 flex animate-[drop-zone-in_0.15s_ease_both] items-center justify-center backdrop-blur-[1px]"
          style={{ background: "var(--accent-subtle)" }}
        >
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
            width="280"
            height="280"
            viewBox="0 0 140 140"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              filter: "drop-shadow(0 6px 18px color-mix(in oklab, var(--accent), transparent 82%))",
            }}
          >
            <rect
              x="28"
              y="44"
              width="84"
              height="60"
              rx="8"
              fill="var(--accent-soft)"
              stroke="var(--accent-ring)"
              strokeWidth="1.8"
            />
            <path
              d="M36 100 L54 72 L68 88 L80 74 L104 100Z"
              fill="color-mix(in oklab, var(--accent), transparent 84%)"
              stroke="color-mix(in oklab, var(--accent), transparent 60%)"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <circle
              cx="96"
              cy="58"
              r="8"
              fill="color-mix(in oklab, var(--accent), transparent 78%)"
              stroke="color-mix(in oklab, var(--accent), transparent 45%)"
              strokeWidth="1.6"
            />
            <g
              stroke="color-mix(in oklab, var(--accent), transparent 55%)"
              strokeWidth="1.4"
              strokeLinecap="round"
            >
              <line x1="96" y1="46" x2="96" y2="43" />
              <line x1="96" y1="70" x2="96" y2="73" />
              <line x1="84" y1="58" x2="81" y2="58" />
              <line x1="108" y1="58" x2="111" y2="58" />
              <line x1="87.5" y1="49.5" x2="85.4" y2="47.4" />
              <line x1="104.5" y1="66.5" x2="106.6" y2="68.6" />
              <line x1="104.5" y1="49.5" x2="106.6" y2="47.4" />
              <line x1="87.5" y1="66.5" x2="85.4" y2="68.6" />
            </g>
          </svg>
        </div>
      )}

      {showWelcome ? (
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
                marginRight: 24,
                fontFamily: "var(--font-mono)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 0,
                  flex: 1,
                  lineHeight: 1.4,
                }}
              >
                <img
                  src={isDark ? "/pi-logo-on-dark.svg" : "/pi-logo-on-light.svg"}
                  alt="No Pi No Gang"
                  width={28}
                  height={28}
                />
                <span
                  style={{
                    fontSize: 14,
                    minWidth: 0,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  <Typewriter phrases={TYPEWRITER_PHRASES} />
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 2,
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  web{" "}
                  <span style={{ color: "var(--text)" }}>
                    v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"}
                  </span>
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  pi{" "}
                  <span style={{ color: "var(--text)" }}>
                    v{process.env.NEXT_PUBLIC_PI_VERSION ?? "0.0.0"}
                  </span>
                </span>
              </div>
            </div>
            {chatInputElement}
          </div>
        </div>
      ) : (
        <>
          <div
            className="flex-1 overflow-hidden relative"
            style={{ animation: "fade-in-up 0.35s ease both" }}
          >
            {/* ── Native scroll viewport ── */}
            <div
              ref={setScrollContainerRef}
              className="h-full overflow-y-auto [scrollbar-width:none]"
            >
              <div ref={scrollContentRef} style={{ paddingTop: 16 }}>
                {/* Completed messages */}
                {renderedMessages.items.map(({ msg, entryId, originalIndex }, idx) => {
                  const prevItem = idx > 0 ? renderedMessages.items[idx - 1] : undefined;
                  const nextItem =
                    idx < renderedMessages.items.length - 1
                      ? renderedMessages.items[idx + 1]
                      : undefined;

                  const prevAssistantEntryId =
                    msg.role === "user" && prevItem?.msg.role === "assistant"
                      ? prevItem.entryId
                      : undefined;

                  let showTimestamp = false;
                  if (msg.role === "assistant") {
                    showTimestamp = true;
                    // Suppress if the next rendered message before a user is also an assistant
                    if (nextItem?.msg.role === "assistant") showTimestamp = false;
                    if (
                      showTimestamp &&
                      streamState.isStreaming &&
                      idx === renderedMessages.items.length - 1
                    ) {
                      showTimestamp = false;
                    }
                  }
                  const isLastAssistant =
                    msg.role === "assistant" &&
                    idx === renderedMessages.lastAssistantIdx &&
                    !streamState.isStreaming;
                  const isCurrentPath = entryId
                    ? activePathIds.size === 0 || activePathIds.has(entryId)
                    : false;

                  const messageAnchorId = entryId ?? `message-${originalIndex}`;
                  const isUserMessage = msg.role === "user";
                  const turnElapsed = turnDividers.get(idx);

                  return (
                    <div
                      key={entryId ?? originalIndex}
                      ref={
                        isUserMessage
                          ? (node) => {
                              if (node) userMessageRefs.current.set(messageAnchorId, node);
                              else userMessageRefs.current.delete(messageAnchorId);
                            }
                          : undefined
                      }
                      className="relative mx-auto max-w-[1148px] px-4"
                    >
                      {/* Turn divider — before user messages (except first) */}
                      {isUserMessage && turnElapsed && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            marginBottom: 10,
                            paddingTop: 4,
                          }}
                        >
                          <div
                            style={{
                              flex: 1,
                              height: 1,
                              background: "var(--border)",
                            }}
                          />
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 11,
                              color: "var(--text-dim)",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {turnElapsed}
                          </span>
                          <div
                            style={{
                              flex: 1,
                              height: 1,
                              background: "var(--border)",
                            }}
                          />
                        </div>
                      )}
                      <MessageView
                        message={msg}
                        toolResults={toolResultsMap}
                        modelNames={modelNames}
                        entryId={entryId}
                        onFork={
                          agentRunning || isNew || (idx === 0 && msg.role === "user")
                            ? undefined
                            : handleFork
                        }
                        forking={forkingEntryId === entryId}
                        onNavigate={agentRunning ? undefined : handleNavigate}
                        prevAssistantEntryId={agentRunning ? undefined : prevAssistantEntryId}
                        onEditContent={(content) => chatInputRef?.current?.insertIfEmpty(content)}
                        showTimestamp={showTimestamp}
                        prevTimestamp={prevItem?.msg.timestamp as number | undefined}
                        onRetry={isLastAssistant && !agentRunning ? handleRetry : undefined}
                        onEditResend={
                          msg.role === "user" && !agentRunning ? handleEditResend : undefined
                        }
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

                {/* Bottom spacer — keeps last message from hugging the edge */}
                <div style={{ height: 24 }} />
              </div>
            </div>

            {userAnchors.length > 1 && (
              <UserMessageNav
                visibleAnchors={visibleUserAnchors}
                activeAnchorId={activeUserAnchorId}
                panelHeight={userAnchorPanelHeight}
                panelOpen={showUserAnchorPanel}
                onPanelOpenChange={setShowUserAnchorPanel}
                onScrollTo={scrollToUserAnchor}
              />
            )}

            {/* Scroll-to-bottom button */}
            {!isAtBottom && (
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: 0,
                  right: 0,
                  display: "flex",
                  justifyContent: "center",
                  zIndex: 10,
                  pointerEvents: "none",
                }}
              >
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
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {chatInputElement}

          {/* Branch-switch loading overlay */}
          {branchLoading && !loading && !showWelcome && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "color-mix(in oklab, var(--bg), transparent 15%)",
                backdropFilter: "blur(1px)",
                animation: "fade-in 0.15s ease both",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: "2.5px solid var(--border)",
                    borderTopColor: "var(--accent)",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading branch…</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
