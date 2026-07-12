"use client";

import dynamic from "next/dynamic";

export const ChatWindow = dynamic(() => import("@/features/chat/ChatWindow").then((m) => m.ChatWindow), {
  ssr: false,
});

export const ModelsConfig = dynamic(
  () => import("@/features/settings/ModelsConfig").then((m) => m.ModelsConfig),
  { ssr: false },
);

export const SkillsConfig = dynamic(
  () => import("@/features/settings/SkillsConfig").then((m) => m.SkillsConfig),
  { ssr: false },
);
