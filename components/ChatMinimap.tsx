"use client";

import { useEffect, useRef, useState, useCallback, useMemo, RefObject } from "react";
import type { AgentMessage, AssistantMessage, TextContent } from "@/lib/types";

interface Props {
  messages: AgentMessage[];
  streamingMessage: Partial<AgentMessage> | null;
  scrollContainer: RefObject<HTMLDivElement | null>;
  messageRefs?: RefObject<(HTMLDivElement | null)[]>;
  /** Virtual-scroll mode: estimate dot positions instead of reading DOM refs.
   *  Used when react-virtuoso is active (DOM nodes are recycled). */
  virtual?: boolean;
}

export const MINIMAP_WIDTH = 36;

function getMessagePreview(msg: AgentMessage | Partial<AgentMessage>): string {
  if (msg.role === "user") {
    const content = msg.content;
    if (typeof content === "string") return content.slice(0, 200);
    if (Array.isArray(content)) {
      return (content as { type: string; text?: string }[])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text!)
        .join("\n")
        .slice(0, 200);
    }
    return "";
  }
  if (msg.role === "assistant") {
    const blocks = (msg as Partial<AssistantMessage>).content ?? [];
    const text = blocks
      .filter((b): b is TextContent => b.type === "text")
      .map((b) => b.text)
      .join(" ");
    if (text) return text.slice(0, 200);
    const toolNames = blocks
      .filter((b) => b.type === "toolCall")
      .map((b) => (b as { type: string; toolName: string }).toolName);
    if (toolNames.length) return toolNames.join(", ");
    return "";
  }
  return "";
}

function getNodeColor(msg: AgentMessage | Partial<AgentMessage>): { bg: string; border: string } {
  if (msg.role === "user") {
    return { bg: "color-mix(in oklab, var(--accent), transparent 35%)", border: "color-mix(in oklab, var(--accent), transparent 30%)" };
  }
  return { bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.5)" };
}

function hasTextContent(msg: AgentMessage | Partial<AgentMessage>): boolean {
  if (msg.role === "user") return true;
  if (msg.role === "assistant") {
    const blocks = (msg as Partial<AssistantMessage>).content ?? [];
    return blocks.some((b) => b.type === "text");
  }
  return false;
}

interface NodeInfo {
  topRatio: number;   // 0–1 within total scroll height
  heightRatio: number;
  msg: AgentMessage | Partial<AgentMessage>;
  index: number;
}

export function ChatMinimap({ messages, streamingMessage, scrollContainer, messageRefs, virtual }: Props) {
  const [scrollRatio, setScrollRatio] = useState(0);
  const [viewportRatio, setViewportRatio] = useState(1);
  const [visible, setVisible] = useState(false);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [minimapHovered, setMinimapHovered] = useState(false);
  const [mouseYRatio, setMouseYRatio] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const allMessages = useMemo(
    () => (streamingMessage ? [...messages, streamingMessage] : messages) as (AgentMessage | Partial<AgentMessage>)[],
    [messages, streamingMessage]
  );
  const allMessagesRef = useRef(allMessages);
  allMessagesRef.current = allMessages;

  // Count of visible (user + assistant) messages for virtual mode
  const visibleMsgCount = useMemo(() => {
    return allMessages.filter((m) => m.role === "user" || m.role === "assistant").length;
  }, [allMessages]);

  const prevStateRef = useRef<{ visible: boolean; scrollRatio: number; viewportRatio: number; nodesLen: number }>({ visible: false, scrollRatio: 0, viewportRatio: 1, nodesLen: 0 });
  const updatePositionsRef = useRef<() => void>(null!);
  updatePositionsRef.current = () => {
    const scrollEl = scrollContainer.current;
    if (!scrollEl) return;

    const totalH = scrollEl.scrollHeight;
    const clientH = scrollEl.clientHeight;
    const scrollable = totalH - clientH;

    const newVisible = scrollable > 20;
    if (newVisible !== prevStateRef.current.visible) {
      prevStateRef.current.visible = newVisible;
      setVisible(newVisible);
    }
    if (scrollable <= 0) {
      setScrollRatio(0);
      setViewportRatio(1);
    } else {
      setScrollRatio(scrollEl.scrollTop / scrollable);
      setViewportRatio(clientH / totalH);
    }

    if (virtual) {
      // Virtual mode: evenly distribute dots based on visible message count.
      // Industry pattern — ChatGPT / Claude minimap uses estimated positions
      // since off-screen messages have no DOM nodes.
      const count = visibleMsgCount;
      if (count === 0) { setNodes([]); prevStateRef.current.nodesLen = 0; return; }
      const newNodes: NodeInfo[] = [];
      let dotIdx = 0;
      const allMsgs = allMessagesRef.current;
      for (let i = 0; i < allMsgs.length; i++) {
        const msg = allMsgs[i];
        if (msg.role !== "user" && msg.role !== "assistant") continue;
        if (!hasTextContent(msg)) continue;
        newNodes.push({
          topRatio: dotIdx / count,
          heightRatio: 1 / count,
          msg,
          index: dotIdx,
        });
        dotIdx++;
      }
      if (newNodes.length !== prevStateRef.current.nodesLen) {
        prevStateRef.current.nodesLen = newNodes.length;
        setNodes(newNodes);
      }
      return;
    }

    // DOM-ref mode: build node positions from real DOM refs
    if (!messageRefs) return;
    const refs = messageRefs.current;
    const newNodes: NodeInfo[] = [];
    let refIndex = 0;

    const allMsgs = allMessagesRef.current;
    for (let i = 0; i < allMsgs.length; i++) {
      const msg = allMsgs[i];
      if (msg.role !== "user" && msg.role !== "assistant") continue;

      const el = refs?.[refIndex];
      refIndex++;

      if (!hasTextContent(msg)) continue;

      if (el && totalH > 0) {
        const elRect = el.getBoundingClientRect();
        const containerRect = scrollEl.getBoundingClientRect();
        const top = elRect.top - containerRect.top + scrollEl.scrollTop;
        const h = elRect.height;
        newNodes.push({
          topRatio: top / totalH,
          heightRatio: h / totalH,
          msg,
          index: newNodes.length,
        });
      }
    }
    if (newNodes.length !== prevStateRef.current.nodesLen) {
      prevStateRef.current.nodesLen = newNodes.length;
      setNodes(newNodes);
    }
  };

  const updatePositions = useCallback(() => updatePositionsRef.current(), []);

  useEffect(() => {
    const el = scrollContainer.current;
    if (!el) return;
    el.addEventListener("scroll", updatePositions, { passive: true });
    const ro = new ResizeObserver(updatePositions);
    ro.observe(el);
    // Also observe the scroll content for height changes
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    updatePositions();
    return () => {
      el.removeEventListener("scroll", updatePositions);
      ro.disconnect();
    };
  }, [scrollContainer, updatePositions]);

  // Re-measure when message count changes (new messages arrive)
  useEffect(() => {
    const t = setTimeout(updatePositions, 50);
    return () => clearTimeout(t);
  }, [messages.length, updatePositions]);

  const scrollToMinimapRatio = useCallback((viewportTopRatio: number) => {
    const el = scrollContainer.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    if (scrollable <= 0) return;
    const clamped = Math.max(0, Math.min(1 - viewportRatio, viewportTopRatio));
    // One-time scrollTop write is safe with Virtuoso — it handles external
    // scroll changes via its scroll event listener (same as user scroll wheel).
    // Only continuous 60fps writes (RAF loop) cause conflicts.
    el.scrollTop = (clamped / (1 - viewportRatio)) * scrollable;
  }, [scrollContainer, viewportRatio]);

  // Refs to avoid stale closure in drag handler's window event listeners
  const viewportRatioRef = useRef(viewportRatio);
  viewportRatioRef.current = viewportRatio;
  const scrollToFnRef = useRef(scrollToMinimapRatio);
  scrollToFnRef.current = scrollToMinimapRatio;

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!visible) return;

    draggingRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = (e.clientY - rect.top) / rect.height;
    const vp = viewportRatioRef.current;
    const grabOffset = clickRatio - scrollRatio * (1 - vp);
    const insideBox = grabOffset >= 0 && grabOffset <= vp;
    const offset = insideBox ? grabOffset : vp / 2;

    scrollToFnRef.current(clickRatio - offset);

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const r = (ev.clientY - rect.top) / rect.height;
      scrollToFnRef.current(r - offset);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [visible, scrollRatio]);



  const TOOLTIP_HEIGHT = 56;
  const minimapHeightPx = containerRef.current?.clientHeight ?? 600;

  if (!visible) return null;

  const viewportBoxTop = scrollRatio * (1 - viewportRatio) * 100;
  const viewportBoxHeight = viewportRatio * 100;

  // Find the node closest to the current mouse position
  const nearestIndex = mouseYRatio !== null && nodes.length > 0
    ? nodes.reduce((best, node) => {
        return Math.abs(node.topRatio - mouseYRatio) < Math.abs(nodes[best].topRatio - mouseYRatio) ? node.index : best;
      }, 0)
    : null;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setMinimapHovered(true)}
      onMouseLeave={() => { setMinimapHovered(false); setMouseYRatio(null); }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMouseYRatio((e.clientY - rect.top) / rect.height);
      }}
      style={{
        position: "relative",
        width: MINIMAP_WIDTH,
        flexShrink: 0,
        height: "100%",
        cursor: "default",
        userSelect: "none",
        borderLeft: "1px solid var(--border)",
        background: "var(--bg-panel)",
        overflow: "visible",
      }}
    >
      {/* Viewport indicator */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${viewportBoxTop}%`,
          height: `${viewportBoxHeight}%`,
          background: "rgba(100,100,100,0.1)",
          borderTop: "1px solid rgba(100,100,100,0.2)",
          borderBottom: "1px solid rgba(100,100,100,0.2)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Message nodes */}
      {nodes.map((node) => {
        const color = getNodeColor(node.msg);
        const isNearest = minimapHovered && nearestIndex === node.index;
        const isUser = node.msg.role === "user";
        const dotTop = node.topRatio * 100;

        return (
          <div
            key={node.index}

            style={{
              position: "absolute",
              top: `${dotTop}%`,
              transform: "translateY(-50%)",
              left: 0,
              right: 0,
              height: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 2,
            }}
          >
            {/* Dot */}
            <div
              style={{
                width: isUser ? 8 : 6,
                height: isUser ? 8 : 6,
                borderRadius: isUser ? 1 : "50%",
                background: color.bg,
                border: isUser ? "none" : `1.5px solid ${color.border}`,
                flexShrink: 0,
                transition: "transform 0.1s",
                transform: isNearest ? "scale(1.6)" : "scale(1)",
              }}
            />


          </div>
        );
      })}

      {/* Center line */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 1,
          background: "var(--border)",
          transform: "translateX(-50%)",
          zIndex: 0,
        }}
      />

      {/* Tooltip: nearest node only */}
      {minimapHovered && nearestIndex !== null && (() => {
        const node = nodes[nearestIndex];
        const preview = getMessagePreview(node.msg);
        const color = getNodeColor(node.msg);
        if (!preview) return null;
        const top = Math.max(0, Math.min(minimapHeightPx - TOOLTIP_HEIGHT, Math.round(node.topRatio * minimapHeightPx - TOOLTIP_HEIGHT / 2)));
        return (
          <div
            style={{
              position: "absolute",
              top,
              right: "100%",
              marginRight: 6,
              background: "var(--bg)",
              borderTop: `1px solid ${color.border}`,
              borderRight: `1px solid ${color.border}`,
              borderBottom: `1px solid ${color.border}`,
              borderLeft: `2px solid ${color.border}`,
              borderRadius: 4,
              padding: "4px 8px",
              width: 200,
              zIndex: 100,
              pointerEvents: "none",
              transition: "top 0.1s",
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: "var(--text)",
                lineHeight: 1.5,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
              }}
            >
              {preview}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Hook to create a stable array of refs for messages
export function useMessageRefs(count: number): RefObject<(HTMLDivElement | null)[]> {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  refs.current = Array(count).fill(null).map((_, i) => refs.current[i] ?? null);
  return refs;
}
