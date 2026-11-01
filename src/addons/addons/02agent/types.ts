export interface AgentModel {
  id: string;
  name: string;
  modelId: string;
  maxTokens?: number;
  contextWindow?: number;
  /** Optional image generation model (OpenAI images API) used by generateCostumeFromDescription. */
  imageModel?: string;
}

export interface Agent {
  id: string;
  provider: "openai" | "zhipu" | "deepseek" | "custom" | "custom_anthropic" | "anthropic" | "google" | "azure";
  baseUrl: string;
  apiKey: string;
  name: string;
  models: AgentModel[];
}

export interface FlattenedAgent {
  id: string;
  agentId: string;
  provider: Agent["provider"];
  baseUrl: string;
  apiKey: string;
  modelName: string;
  displayName: string;
  maxTokens?: number;
  contextWindow?: number;
  imageModel?: string;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

export interface ChatStats extends TokenUsage {
  startedAt: number;
  completedAt?: number;
  firstTokenAt?: number;
  ttftMs?: number;
  decodeMs?: number;
  tokensPerSecond?: number;
  contextWindow?: number;
  contextUsedTokens?: number;
  cacheHitPercent?: number;
  estimated?: boolean;
}

export type AttachmentKind = "workspace-ucf" | "workspace-ucf-range" | "text-file" | "spreadsheet" | "document";

export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  mimeType: string;
  content: string;
  preview?: string;
  meta?: {
    targetId?: string;
    blockId?: string;
    startBlockId?: string;
    endBlockId?: string;
    topBlockId?: string;
    selectedBlockIds?: string[];
    blockCount?: number;
    source?: string;
  };
}

export interface ToolCall {
  id: string;
  type?: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  reasoning?: string;
  anthropic_content_blocks?: Array<
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string; signature?: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  reasoningStartedAt?: number;
  reasoningEndedAt?: number;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  attachments?: Attachment[];
}

export interface SessionSnapshot {
  messageId: string;
  projectJson: string;
  attachments: Attachment[];
  inputText: string;
  createdAt: number;
}

export interface RangeAttachmentMeta {
  targetId: string;
  startBlockId: string;
  endBlockId: string;
  topBlockId?: string;
  selectedBlockIds?: string[];
  blockCount?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  /**
   * Context compaction state. `summary` condenses every message before index `upTo`
   * so long sessions keep their早期结论 instead of silently dropping them.
   */
  compacted?: { summary: string; upTo: number };
}

export type BridgeStatus = "disabled" | "connecting" | "connected" | "error";

export interface BridgeConfig {
  enabled: boolean;
  port: number;
  token: string;
}

export type MCPTransport = "http" | "sse";

export interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  url: string;
  transport: MCPTransport;
  apiKey: string;
  /** JSON text of extra request headers, e.g. {"X-Tenant":"a"} */
  customHeaders: string;
  enabled: boolean;
  /** Original MCP tool names disabled for this server */
  disabledTools: string[];
  /** Last successfully discovered tools (informational cache) */
  cachedTools?: MCPToolInfo[];
  lastConnectedAt?: number;
  lastError?: string;
}

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  /** Markdown instructions injected into the system prompt when enabled */
  content: string;
  enabled: boolean;
}

/** User-editable system prompt override. */
export interface PromptConfig {
  /** Where to merge the custom text relative to the built-in base prompt. */
  mode: "prepend" | "append" | "replace";
  /** Custom system prompt text (used for all modes; `replace` uses it alone). */
  text: string;
  /**
   * Whether to include the built-in default base prompt (SYSTEM_PROMPT + plan-mode
   * prompt). When false, the base is skipped entirely and only `text` (+ skills) is
   * injected. Defaults to true for backwards compatibility.
   */
  includeBase: boolean;
}

export interface SubagentDef {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
}
