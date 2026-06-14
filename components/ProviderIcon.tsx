"use client";

import type React from "react";

import AnthropicIcon from "@lobehub/icons/es/Anthropic/components/Mono";
import AwsColorIcon from "@lobehub/icons/es/Aws/components/Color";
import AzureColorIcon from "@lobehub/icons/es/Azure/components/Color";
import CerebrasColorIcon from "@lobehub/icons/es/Cerebras/components/Color";
import CloudflareColorIcon from "@lobehub/icons/es/Cloudflare/components/Color";
import CohereColorIcon from "@lobehub/icons/es/Cohere/components/Color";
import DeepSeekColorIcon from "@lobehub/icons/es/DeepSeek/components/Color";
import FireworksColorIcon from "@lobehub/icons/es/Fireworks/components/Color";
import GithubCopilotIcon from "@lobehub/icons/es/GithubCopilot/components/Mono";
import GoogleColorIcon from "@lobehub/icons/es/Google/components/Color";
import GrokIcon from "@lobehub/icons/es/Grok/components/Mono";
import GroqIcon from "@lobehub/icons/es/Groq/components/Mono";
import HuggingFaceColorIcon from "@lobehub/icons/es/HuggingFace/components/Color";
import KimiColorIcon from "@lobehub/icons/es/Kimi/components/Color";
import MinimaxColorIcon from "@lobehub/icons/es/Minimax/components/Color";
import MistralColorIcon from "@lobehub/icons/es/Mistral/components/Color";
import MoonshotIcon from "@lobehub/icons/es/Moonshot/components/Mono";
import OpenAIIcon from "@lobehub/icons/es/OpenAI/components/Mono";
import OpenRouterIcon from "@lobehub/icons/es/OpenRouter/components/Mono";
import PerplexityColorIcon from "@lobehub/icons/es/Perplexity/components/Color";
import QwenColorIcon from "@lobehub/icons/es/Qwen/components/Color";
import TogetherColorIcon from "@lobehub/icons/es/Together/components/Color";
import VercelIcon from "@lobehub/icons/es/Vercel/components/Mono";
import XAIIcon from "@lobehub/icons/es/XAI/components/Mono";
import ZhipuColorIcon from "@lobehub/icons/es/Zhipu/components/Color";

type IconComponent = React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;

// hasColor=true → Color icon (self-colored SVG, no wrapper)
// hasColor=false → Mono icon (rendered with currentColor, inherits theme text color)
const PROVIDER_ICONS: Record<string, { Icon: IconComponent; hasColor: boolean }> = {
  anthropic: { Icon: AnthropicIcon, hasColor: false },
  openai: { Icon: OpenAIIcon, hasColor: false },
  "openai-codex": { Icon: OpenAIIcon, hasColor: false },
  google: { Icon: GoogleColorIcon, hasColor: true },
  "google-vertex": { Icon: GoogleColorIcon, hasColor: true },
  deepseek: { Icon: DeepSeekColorIcon, hasColor: true },
  groq: { Icon: GroqIcon, hasColor: false },
  mistral: { Icon: MistralColorIcon, hasColor: true },
  moonshotai: { Icon: MoonshotIcon, hasColor: false },
  "moonshotai-cn": { Icon: MoonshotIcon, hasColor: false },
  moonshot: { Icon: MoonshotIcon, hasColor: false },
  minimax: { Icon: MinimaxColorIcon, hasColor: true },
  "minimax-cn": { Icon: MinimaxColorIcon, hasColor: true },
  fireworks: { Icon: FireworksColorIcon, hasColor: true },
  huggingface: { Icon: HuggingFaceColorIcon, hasColor: true },
  cerebras: { Icon: CerebrasColorIcon, hasColor: true },
  openrouter: { Icon: OpenRouterIcon, hasColor: false },
  xai: { Icon: XAIIcon, hasColor: false },
  "cloudflare-ai-gateway": { Icon: CloudflareColorIcon, hasColor: true },
  "cloudflare-workers-ai": { Icon: CloudflareColorIcon, hasColor: true },
  "vercel-ai-gateway": { Icon: VercelIcon, hasColor: false },
  "github-copilot": { Icon: GithubCopilotIcon, hasColor: false },
  "amazon-bedrock": { Icon: AwsColorIcon, hasColor: true },
  "azure-openai-responses": { Icon: AzureColorIcon, hasColor: true },
  "kimi-coding": { Icon: KimiColorIcon, hasColor: true },
  qwen: { Icon: QwenColorIcon, hasColor: true },
  zai: { Icon: ZhipuColorIcon, hasColor: true },
  cohere: { Icon: CohereColorIcon, hasColor: true },
  perplexity: { Icon: PerplexityColorIcon, hasColor: true },
  together: { Icon: TogetherColorIcon, hasColor: true },
  grok: { Icon: GrokIcon, hasColor: false },
};

export function ProviderIcon({ id, size }: { id: string; size: number }) {
  const pi = PROVIDER_ICONS[id];
  if (!pi) return null;
  if (pi.hasColor) return <pi.Icon size={size} />;
  return <pi.Icon size={size} style={{ color: "var(--text-muted)" }} />;
}
