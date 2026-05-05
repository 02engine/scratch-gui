export interface AgentModel {
  id: string;
  name: string;
  modelId: string;
  maxTokens?: number;
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
}
