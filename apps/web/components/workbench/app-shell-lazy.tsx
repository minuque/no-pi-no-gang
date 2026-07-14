"use client";

import dynamic from "next/dynamic";

export const ChatWindow = dynamic(() => import("@/components/chat/ChatWindow").then((m) => m.ChatWindow), {
  ssr: false,
});

export const ModelsConfig = dynamic(
  () => import("@/components/settings/ModelsConfig").then((m) => m.ModelsConfig),
  { ssr: false },
);

export const SkillsConfig = dynamic(
  () => import("@/components/settings/SkillsConfig").then((m) => m.SkillsConfig),
  { ssr: false },
);
