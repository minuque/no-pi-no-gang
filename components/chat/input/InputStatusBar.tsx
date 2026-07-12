"use client";

export interface InputStatusBarProps {
  status?: string;
  contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null } | null;
}

export function InputStatusBar({ status, contextUsage }: InputStatusBarProps) {
  if (!status && !contextUsage) return null;
  return (
    <div className="chat-input-status">
      {status ? <span>{status}</span> : null}
      {contextUsage ? <span>{contextUsage.percent ?? 0}%</span> : null}
    </div>
  );
}
