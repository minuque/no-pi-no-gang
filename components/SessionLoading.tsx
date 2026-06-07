"use client";

import { useEffect, useState, useRef } from "react";

export function SessionLoading() {
  const [visible, setVisible] = useState(false);
  const [dotCount, setDotCount] = useState(0);
  const ringRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setDotCount((c) => (c + 1) % 4), 400);
    return () => clearInterval(t);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const ring = ringRef.current;
    if (ring) {
      ring.style.strokeDashoffset = "0";
    }
  }, [visible]);

  const dots = ".".repeat(dotCount);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 0.45s ease, transform 0.45s ease",
        userSelect: "none",
      }}
    >
      {/* Animated Ring + Pi Symbol */}
      <div style={{ position: "relative", width: 144, height: 144 }}>
        {/* Outer ring (rotates) */}
        <svg
          width="144"
          height="144"
          viewBox="0 0 144 144"
          fill="none"
          style={{
            position: "absolute",
            inset: 0,
            animation: "session-load-spin 3s linear infinite",
          }}
        >
          <circle
            ref={ringRef}
            cx="72"
            cy="72"
            r="64"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="402.1"
            strokeDashoffset="402.1"
            fill="none"
            opacity={0.5}
            style={{
              transition: "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </svg>

        {/* Inner breathing glow */}
        <div
          style={{
            position: "absolute",
            inset: 12,
            borderRadius: "50%",
            background: "radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)",
            animation: "session-load-breathe 2.4s ease-in-out infinite",
          }}
        />

        {/* Logo */}
        <img
          src="/favicon.ico"
          alt="Pi"
          style={{
            position: "absolute",
            inset: 28,
            width: 88,
            height: 88,
            animation: "session-load-breathe 2.4s ease-in-out infinite",
          }}
        />
      </div>

      {/* Text row */}
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--text)",
            letterSpacing: "-0.01em",
          }}
        >
          Loading session{dots}
        </div>
      </div>
    </div>
  );
}
