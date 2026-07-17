"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatInput } from "@/components/chat/input";
import { useAgentSession } from "@/components/session/hooks/useAgentSession";
import { useChatScroll } from "@/hooks/useChatScroll";
import { useDragDrop } from "@/hooks/useDragDrop";
import { useTheme } from "@/hooks/useTheme";
import type { AgentMessage, AssistantMessage, EntryTreeNode, ToolResultMessage } from "@/lib/types";

import {
  buildActivePathIds,
  getUserMessageTitle,
  summarizeUserMessage,
  USER_ANCHOR_MAX_VISIBLE,
  USER_ANCHOR_PANEL_PADDING_Y,
  USER_ANCHOR_ROW_HEIGHT,
} from "./ChatWindowSupport";
import type { ChatWindowProps } from "./chat-window-types";

export function useChatWindowState({
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
  recentCwds,
  homeDir = "",
  onCwdSelect,
  onToolPresetChange,
}: ChatWindowProps) {
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 保留供阶段状态界面使用
    agentPhase,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 保留供会话状态界面使用
    sessionStatus,
    activeLeafId,
    isNew,
    handleSend,
    handleAbort,
    handleFork,
    handleNavigate,
    handleModelChange,
    handleThinkingLevelChange,
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
  const toolPresetRef = useRef(toolPreset);
  toolPresetRef.current = toolPreset;
  useEffect(() => {
    onToolPresetChange?.(toolPresetRef.current);
  }, [toolPreset, onToolPresetChange]);
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
  const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(onDrop);
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
  const handleEditResend = useCallback(
    (content: string) => {
      handleSend(content);
    },
    [handleSend],
  );
  const showWelcome = !session && messages.length === 0 && !streamState.isStreaming && !agentRunning;
  const availableThinkingLevels = displayModelValue
    ? (modelThinkingLevels[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;
  const currentThinkingLevelMap = displayModelValue
    ? (modelThinkingLevelMaps[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;
  const cwd = session?.cwd ?? newSessionCwd;
  const [selectionToolbar, setSelectionToolbar] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);
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
  const {
    containerRef: scrollContainerRef,
    setContainerRef: setScrollContainerRef,
    contentRef: scrollContentRef,
    scrollToBottom,
    isAtBottom,
  } = useChatScroll({ follow: agentRunning });
  const captureChatSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    const scrollNode = scrollContainerRef.current;
    if (!selection || !text || !scrollNode || selection.rangeCount === 0) {
      setSelectionToolbar(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const anchorNode =
      container.nodeType === Node.ELEMENT_NODE ? container : (container.parentNode as Node | null);
    if (!anchorNode || !scrollNode.contains(anchorNode)) {
      setSelectionToolbar(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setSelectionToolbar(null);
      return;
    }
    const selectionRects = Array.from(range.getClientRects()).filter((r) => r.width || r.height);
    const targetRect = selectionRects[selectionRects.length - 1] ?? rect;
    const toolbarTop = Math.max(4, targetRect.bottom);
    const toolbarLeft = Math.min(window.innerWidth - 144, Math.max(4, targetRect.right + 6));
    setSelectionToolbar({
      text,
      top: toolbarTop,
      left: toolbarLeft,
    });
  }, [scrollContainerRef]);
  const addSelectionToChat = useCallback(() => {
    if (!selectionToolbar?.text) return;
    chatInputRef?.current?.insertText(`> ${selectionToolbar.text.replace(/\n+/g, "\n> ")}\n\n`);
    window.getSelection()?.removeAllRanges();
    setSelectionToolbar(null);
  }, [chatInputRef, selectionToolbar]);
  const toolResultsMap = useMemo(() => {
    const map = new Map<string, ToolResultMessage>();
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "toolResult") {
        const entryId = entryIds[i];
        const isCurrentPath = entryId ? activePathIds.size === 0 || activePathIds.has(entryId) : false;
        map.set((msg as ToolResultMessage).toolCallId, {
          ...(msg as ToolResultMessage),
          _entryId: entryId,
          _isCurrentPath: isCurrentPath,
        });
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 保持原有分支失效时机
  }, [messages, entryIds, activePathIds, activeLeafId, activeBranch]);
  const renderedMessages = useMemo(() => {
    const items: Array<{
      msg: AgentMessage;
      entryId: string;
      originalIndex: number;
      isStreaming?: boolean;
      streamBlockStart?: number;
    }> = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "toolResult") continue;
      if (msg.role === "assistant" && items.length > 0) {
        const last = items[items.length - 1];
        if (last.msg.role === "assistant") {
          const lastAssist = last.msg as AssistantMessage;
          const curAssist = msg as AssistantMessage;
          last.msg = {
            ...lastAssist,
            content: [...lastAssist.content, ...curAssist.content],
            stopReason: curAssist.stopReason ?? lastAssist.stopReason,
            timestamp: curAssist.timestamp ?? lastAssist.timestamp,
            usage: curAssist.usage ?? lastAssist.usage,
            model: curAssist.model ?? lastAssist.model,
            provider: curAssist.provider ?? lastAssist.provider,
          } as AssistantMessage;
          continue;
        }
      }
      items.push({ msg, entryId: entryIds[i], originalIndex: i });
    }
    if (streamState.isStreaming && streamState.streamingMessage) {
      const s = streamState.streamingMessage as AgentMessage;
      const last = items[items.length - 1];
      if (s.role === "assistant" && last?.msg.role === "assistant") {
        const lastAssist = last.msg as AssistantMessage;
        const curAssist = s as AssistantMessage;
        const streamBlockStart = lastAssist.content.length;
        last.msg = {
          ...lastAssist,
          content: [...lastAssist.content, ...(curAssist.content ?? [])],
          stopReason: curAssist.stopReason ?? lastAssist.stopReason,
          timestamp: curAssist.timestamp ?? lastAssist.timestamp,
          usage: curAssist.usage ?? lastAssist.usage,
          model: curAssist.model ?? lastAssist.model,
          provider: curAssist.provider ?? lastAssist.provider,
        } as AssistantMessage;
        last.isStreaming = true;
        last.streamBlockStart = streamBlockStart;
      } else if (s.role) {
        items.push({
          msg: s,
          entryId: `streaming-${items.length}`,
          originalIndex: -1,
          isStreaming: true,
        });
      }
    }
    let lastAssistantIdx = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].msg.role === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }
    return { items, lastAssistantIdx };
  }, [messages, entryIds, streamState.isStreaming, streamState.streamingMessage]);
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
      currentCwd={cwd ?? undefined}
      recentCwds={recentCwds}
      homeDir={homeDir}
      onCwdSelect={onCwdSelect}
      toolPreset={toolPreset}
    />
  );
  return {
    error,
    loading,
    branchLoading,
    streamState,
    agentRunning,
    forkingEntryId,
    isNew,
    handleFork,
    handleNavigate,
    isDark,
    onDrop,
    isDragOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleRetry,
    handleEditResend,
    showWelcome,
    selectionToolbar,
    setSelectionToolbar,
    setScrollContainerRef,
    scrollContentRef,
    scrollToBottom,
    isAtBottom,
    captureChatSelection,
    addSelectionToChat,
    toolResultsMap,
    renderedMessages,
    userMessageRefs,
    activeUserAnchorId,
    showUserAnchorPanel,
    setShowUserAnchorPanel,
    userAnchors,
    visibleUserAnchors,
    userAnchorPanelHeight,
    scrollToUserAnchor,
    chatInputElement,
  };
}
