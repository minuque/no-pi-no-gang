"use client";

import type { ReactNode } from "react";

export interface InputToolbarProps {
  children?: ReactNode;
}

export function InputToolbar({ children }: InputToolbarProps) {
  return <div className="chat-input-toolbar">{children}</div>;
}
