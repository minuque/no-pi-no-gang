"use client";

import { useCallback, useRef, useState } from "react";

import { shortenWorkspacePath } from "@/lib/file-paths";

export function useCwdPickerState({
  homeDir,
  onCwdSelect,
}: {
  homeDir: string;
  onCwdSelect?: (cwd: string) => void;
}) {
  const [cwdDropdownOpen, setCwdDropdownOpen] = useState(false);
  const [cwdCustomOpen, setCwdCustomOpen] = useState(false);
  const [cwdCustomValue, setCwdCustomValue] = useState("");
  const [cwdCustomError, setCwdCustomError] = useState<string | null>(null);
  const [cwdCustomValidating, setCwdCustomValidating] = useState(false);
  const cwdInputRef = useRef<HTMLInputElement>(null);
  const cwdDropdownRef = useRef<HTMLDivElement>(null);

  const shortenCwd = useCallback((cwd: string) => shortenWorkspacePath(cwd, homeDir), [homeDir]);

  const chooseValidatedPath = useCallback(
    async (path: string, showInvalidPath: boolean) => {
      setCwdCustomValidating(true);
      setCwdCustomError(null);
      try {
        const response = await fetch("/api/cwd/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd: path }),
        });
        const data = (await response.json().catch(() => ({}))) as { cwd?: string; error?: string };
        if (!response.ok || data.error) {
          if (showInvalidPath) {
            setCwdCustomOpen(true);
            setCwdCustomValue(path);
          }
          setCwdCustomError(data.error ?? `HTTP ${response.status}`);
          return;
        }
        onCwdSelect?.(data.cwd ?? path);
        setCwdDropdownOpen(false);
        setCwdCustomOpen(false);
        setCwdCustomValue("");
      } catch (error) {
        if (showInvalidPath) {
          setCwdCustomOpen(true);
          setCwdCustomValue(path);
        }
        setCwdCustomError(error instanceof Error ? error.message : String(error));
      } finally {
        setCwdCustomValidating(false);
      }
    },
    [onCwdSelect],
  );

  const commitCwdPath = useCallback(async () => {
    const path = cwdCustomValue.trim();
    if (!path || cwdCustomValidating) return;
    await chooseValidatedPath(path, false);
  }, [chooseValidatedPath, cwdCustomValidating, cwdCustomValue]);

  const selectRecentCwd = useCallback(
    async (cwd: string) => chooseValidatedPath(cwd, true),
    [chooseValidatedPath],
  );

  const handleCwdDefault = useCallback(async () => {
    try {
      const response = await fetch("/api/default-cwd", { method: "POST" });
      const data = (await response.json()) as { cwd?: string };
      if (!data.cwd) return;
      onCwdSelect?.(data.cwd);
      setCwdDropdownOpen(false);
      setCwdCustomOpen(false);
      setCwdCustomValue("");
      setCwdCustomError(null);
    } catch {}
  }, [onCwdSelect]);

  return {
    commitCwdPath,
    cwdCustomError,
    cwdCustomOpen,
    cwdCustomValidating,
    cwdCustomValue,
    cwdDropdownOpen,
    cwdDropdownRef,
    cwdInputRef,
    handleCwdDefault,
    selectRecentCwd,
    setCwdCustomError,
    setCwdCustomOpen,
    setCwdCustomValue,
    setCwdDropdownOpen,
    shortenCwd,
  };
}
