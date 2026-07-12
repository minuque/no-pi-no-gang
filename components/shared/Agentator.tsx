"use client";

import { Agentation } from "agentation";

export default function Agentator() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Agentation />;
}
