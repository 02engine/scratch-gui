import { Agent, ChatMessage, ToolCall, FlattenedAgent } from "./types";

type ProviderMessage = Record<string, unknown>;
type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export interface ChatCompletionRequest {
  agent: FlattenedAgent;
  messages: ProviderMessage[];
  tools?: unknown[];
  toolChoice?: string;
  enableReasoning?: boolean;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolCallsDelta?: (toolCalls: ToolCall[]) => void;
}

export interface ProviderAdapter {
  sendChatCompletion: (request: ChatCompletionRequest) => Promise<any>;
}

const collectReasoningText = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value.map((item) => collectReasoningText(item)).join("");
  }

  if (typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    return [
      candidate.reasoning_content,
      candidate.reasoning,
      candidate.reasoning_text,
      candidate.text,
      candidate.content,
      candidate.output_text,
    ]
      .map((item) => collectReasoningText(item))
      .join("");
  }

  return "";
};

const getOpenAIReasoningDelta = (delta: Record<string, unknown>) =>
  collectReasoningText(
    delta.reasoning_content ||
      delta.reasoning ||
      delta.reasoning_text ||
      delta.reasoning_details ||
      delta.reasoning_delta,
  );

const cloneToolCalls = (toolCalls: ToolCall[]) =>
  toolCalls.map((toolCall) => ({
    ...toolCall,
    function: {
      ...toolCall.function,
    },
  }));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isEmptyRecord = (value: Record<string, unknown>) => Object.keys(value).length === 0;

const parseJsonObject = (value: unknown): Record<string, unknown> | null => {
  if (isRecord(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const stringifyToolArguments = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const getOpenAIToolCallDeltaIndex = (
  toolCallDelta: Record<string, any>,
  toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>,
) => {
  if (typeof toolCallDelta.index === "number") return toolCallDelta.index;

  if (toolCallDelta.id) {
    const existingIndex = toolCalls.findIndex((toolCall) => toolCall.id === toolCallDelta.id);
    if (existingIndex >= 0) return existingIndex;
  }

  if (toolCalls.length === 0 || toolCallDelta.id) return toolCalls.length;
  return toolCalls.length - 1;
};

const getToolCallInputFallback = (
  toolCalls: ToolCall[] | undefined,
  blockId: string | undefined,
  fallbackIndex: number,
) => {
  if (!Array.isArray(toolCalls)) return null;

  const matchingToolCall = blockId ? toolCalls.find((toolCall) => toolCall.id === blockId) : undefined;
  const fallbackToolCall = matchingToolCall || toolCalls[fallbackIndex];
  return parseJsonObject(fallbackToolCall?.function?.arguments);
};

const OPENAI_COMPATIBLE_PROVIDERS = new Set<Agent["provider"]>(["openai", "zhipu", "deepseek", "custom"]);

class OpenAICompatibleAdapter implements ProviderAdapter {
  async sendChatCompletion({
    agent,
    messages,
    tools,
    toolChoice,
    enableReasoning,
    signal,
    onTextDelta,
    onReasoningDelta,
    onToolCallsDelta,
  }: ChatCompletionRequest) {
    const url = agent.baseUrl.endsWith("/chat/completions")
      ? agent.baseUrl
      : `${agent.baseUrl.replace(/\/$/, "")}/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (agent.apiKey) {
      headers["Authorization"] = `Bearer ${agent.apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: agent.modelName,
        messages,
        tools,
        tool_choice: toolChoice,
        stream: true,
        ...(agent.maxTokens ? { max_tokens: agent.maxTokens } : {}),
        ...(enableReasoning
          ? {
              reasoning: { enabled: true },
              include_reasoning: true,
              ...(agent.provider === "deepseek" || agent.baseUrl.includes("deepseek")
                ? { thinking: { type: "enabled" } }
                : {}),
            }
          : agent.provider === "deepseek" || agent.baseUrl.includes("deepseek")
            ? { thinking: { type: "disabled" } }
            : {}),
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`API Error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`);
    }

    if (!response.body) {
      throw new Error("Empty response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let reasoning = "";
    const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];

    let reading = true;
    let finished = false;
    while (reading) {
      const { done, value } = await reader.read();
      if (done) {
        reading = false;
        continue;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          finished = true;
          continue;
        }

        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        if (parsed.error) {
          throw new Error(parsed.error.message || JSON.stringify(parsed.error));
        }

        const choice = parsed.choices?.[0];
        if (!choice) continue;

        if (choice.finish_reason) {
          finished = true;
        }

        const delta = choice.delta;
        if (!delta) continue;

        const reasoningDelta = getOpenAIReasoningDelta(delta as Record<string, unknown>);
        if (reasoningDelta) {
          reasoning += reasoningDelta;
          onReasoningDelta?.(reasoningDelta);
        }

        if (typeof delta.content === "string" && delta.content) {
          content += delta.content;
          onTextDelta?.(delta.content);
        }

        if (Array.isArray(delta.tool_calls)) {
          let toolCallsChanged = false;
          for (const toolCallDelta of delta.tool_calls) {
            const index = getOpenAIToolCallDeltaIndex(toolCallDelta, toolCalls);
            const argumentDelta = stringifyToolArguments(toolCallDelta.function?.arguments);
            if (!toolCalls[index]) {
              toolCalls[index] = {
                id: toolCallDelta.id || "",
                type: "function",
                function: {
                  name: toolCallDelta.function?.name || "",
                  arguments: argumentDelta,
                },
              };
              toolCallsChanged = true;
              continue;
            }

            if (toolCallDelta.id) {
              toolCalls[index].id = toolCallDelta.id;
              toolCallsChanged = true;
            }
            if (toolCallDelta.function?.name) {
              toolCalls[index].function.name += toolCallDelta.function.name;
              toolCallsChanged = true;
            }
            if (argumentDelta) {
              toolCalls[index].function.arguments += argumentDelta;
              toolCallsChanged = true;
            }
          }

          if (toolCallsChanged) {
            onToolCallsDelta?.(cloneToolCalls(toolCalls.filter((toolCall) => toolCall.id || toolCall.function.name)));
          }
        }
      }
    }

    if (!finished && !signal?.aborted) {
      throw new Error("Stream ended unexpectedly. The API provider might be overloaded or the connection was dropped.");
    }

    const validToolCalls = toolCalls.filter((toolCall) => toolCall.id || toolCall.function.name);
    return {
      choices: [
        {
          message: {
            role: "assistant",
            content,
            reasoning,
            ...(validToolCalls.length ? { tool_calls: validToolCalls } : {}),
          },
        },
      ],
    };
  }
}

class AnthropicAdapter implements ProviderAdapter {
  async sendChatCompletion({
    agent,
    messages,
    tools,
    enableReasoning,
    signal,
    onTextDelta,
    onReasoningDelta,
    onToolCallsDelta,
  }: ChatCompletionRequest) {
    const systemMessages = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content);
    const conversationMessages = messages.filter((message) => message.role !== "system");
    const anthropicMessages: Array<{ role: "user" | "assistant"; content: any[] }> = [];

    const pushAnthropicMessage = (role: "user" | "assistant", block: any) => {
      const last = anthropicMessages[anthropicMessages.length - 1];
      if (last && last.role === role) {
        last.content.push(block);
        return;
      }
      anthropicMessages.push({ role, content: [block] });
    };

    for (const message of conversationMessages as Array<Record<string, any>>) {
      if (message.role === "assistant") {
        if (Array.isArray(message.anthropic_content_blocks) && message.anthropic_content_blocks.length > 0) {
          let toolUseIndex = 0;
          for (const block of message.anthropic_content_blocks as AnthropicContentBlock[]) {
            if (block?.type === "thinking" && block.thinking) {
              pushAnthropicMessage("assistant", {
                type: "thinking",
                thinking: block.thinking,
                ...(block.signature ? { signature: block.signature } : {}),
              });
              continue;
            }
            if (block?.type === "text" && block.text) {
              pushAnthropicMessage("assistant", { type: "text", text: block.text });
              continue;
            }
            if (block?.type === "tool_use") {
              const blockInput = isRecord(block.input) ? block.input : {};
              const fallbackInput = getToolCallInputFallback(message.tool_calls, block.id, toolUseIndex);
              toolUseIndex += 1;

              pushAnthropicMessage("assistant", {
                type: "tool_use",
                id: block.id || "",
                name: block.name || "",
                input: isEmptyRecord(blockInput) && fallbackInput ? fallbackInput : blockInput,
              });
            }
          }
          continue;
        }

        if (typeof (message.reasoning || message.reasoning_content) === "string" && (message.reasoning || message.reasoning_content)) {
          pushAnthropicMessage("assistant", {
            type: "thinking",
            thinking: message.reasoning || message.reasoning_content,
          });
        }

        if (typeof message.content === "string" && message.content) {
          pushAnthropicMessage("assistant", { type: "text", text: message.content });
        }
        if (Array.isArray(message.tool_calls)) {
          for (const toolCall of message.tool_calls) {
            let parsedInput: Record<string, unknown> = {};
            try {
              parsedInput = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
            } catch {
              parsedInput = {};
            }
            pushAnthropicMessage("assistant", {
              type: "tool_use",
              id: toolCall.id || "",
              name: toolCall?.function?.name || "",
              input: parsedInput,
            });
          }
        }
        continue;
      }

      if (message.role === "tool") {
        pushAnthropicMessage("user", {
          type: "tool_result",
          tool_use_id: message.tool_call_id || "",
          content: String(message.content || ""),
        });
        continue;
      }

      if (typeof message.content === "string" && message.content) {
        pushAnthropicMessage("user", { type: "text", text: message.content });
      }
    }

    const url = agent.baseUrl.endsWith("/messages") ? agent.baseUrl : `${agent.baseUrl.replace(/\/$/, "")}/messages`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (agent.provider === "anthropic") {
      headers["x-api-key"] = agent.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      headers["anthropic-dangerous-direct-browser-access"] = "true";
    } else {
      headers["Authorization"] = `Bearer ${agent.apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: agent.modelName,
        system: systemMessages.join("\n\n"),
        max_tokens: agent.maxTokens || 4096,
        stream: true,
        messages: anthropicMessages,
        ...(enableReasoning
          ? {
              thinking: {
                type: "enabled",
                budget_tokens: 2048,
              },
            }
          : agent.provider === "custom_anthropic" || agent.baseUrl.includes("deepseek")
            ? {
                thinking: {
                  type: "disabled",
                },
              }
            : {}),
        tools: Array.isArray(tools)
          ? tools.map((tool: any) => ({
              name: tool.function.name,
              description: tool.function.description,
              input_schema: tool.function.parameters,
            }))
          : undefined,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`API Error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`);
    }

    if (!response.body) {
      throw new Error("Empty response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let reasoning = "";
    const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
    const anthropicContentBlocks: AnthropicContentBlock[] = [];
    const toolCallIndexByContentIndex = new Map<number, number>();
    const toolInputJsonByContentIndex = new Map<number, string>();
    let reading = true;
    let finished = false;

    while (reading) {
      const { done, value } = await reader.read();
      if (done) {
        reading = false;
        continue;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (!payload) continue;

        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        if (parsed.type === "error") {
          throw new Error(parsed.error?.message || JSON.stringify(parsed.error));
        }

        if (parsed.type === "message_stop") {
          finished = true;
          continue;
        }

        if (parsed.type === "content_block_start" && parsed.content_block?.type === "text") {
          const text = parsed.content_block.text || "";
          const blockIndex =
            typeof parsed.index === "number" ? parsed.index : anthropicContentBlocks.length;
          anthropicContentBlocks[blockIndex] = {
            type: "text",
            text,
          };
          if (text) {
            content += text;
            onTextDelta?.(text);
          }
        }

        if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
          const deltaText = parsed.delta.text || "";
          const blockIndex = typeof parsed.index === "number" ? parsed.index : -1;
          if (blockIndex >= 0) {
            const currentBlock = anthropicContentBlocks[blockIndex];
            if (currentBlock?.type === "text") {
              currentBlock.text += deltaText;
            } else {
              anthropicContentBlocks[blockIndex] = {
                type: "text",
                text: deltaText,
              };
            }
          }
          content += deltaText;
          onTextDelta?.(deltaText);
        }

        if (parsed.type === "content_block_start" && parsed.content_block?.type === "thinking") {
          const thinkingText = parsed.content_block.thinking || parsed.content_block.text || "";
          const blockIndex =
            typeof parsed.index === "number" ? parsed.index : anthropicContentBlocks.length;
          anthropicContentBlocks[blockIndex] = {
            type: "thinking",
            thinking: thinkingText,
            ...(parsed.content_block.signature ? { signature: parsed.content_block.signature } : {}),
          };
          if (thinkingText) {
            reasoning += thinkingText;
            onReasoningDelta?.(thinkingText);
          }
        }

        if (parsed.type === "content_block_delta" && parsed.delta?.type === "thinking_delta") {
          const thinkingText = parsed.delta.thinking || parsed.delta.text || "";
          const blockIndex = typeof parsed.index === "number" ? parsed.index : -1;
          if (blockIndex >= 0) {
            const currentBlock = anthropicContentBlocks[blockIndex];
            if (currentBlock?.type === "thinking") {
              currentBlock.thinking += thinkingText;
            } else {
              anthropicContentBlocks[blockIndex] = {
                type: "thinking",
                thinking: thinkingText,
              };
            }
          }
          if (thinkingText) {
            reasoning += thinkingText;
            onReasoningDelta?.(thinkingText);
          }
        }

        if (parsed.type === "content_block_delta" && parsed.delta?.type === "signature_delta") {
          const signature = parsed.delta.signature || "";
          const blockIndex = typeof parsed.index === "number" ? parsed.index : -1;
          if (signature && blockIndex >= 0) {
            const currentBlock = anthropicContentBlocks[blockIndex];
            if (currentBlock?.type === "thinking") {
              currentBlock.signature = signature;
            } else {
              anthropicContentBlocks[blockIndex] = {
                type: "thinking",
                thinking: "",
                signature,
              };
            }
          }
        }

        if (parsed.type === "content_block_start" && parsed.content_block?.type === "tool_use") {
          const blockIndex =
            typeof parsed.index === "number" ? parsed.index : anthropicContentBlocks.length;
          const initialInput = parseJsonObject(parsed.content_block.input) || {};
          const toolCall: { id: string; type: "function"; function: { name: string; arguments: string } } = {
            id: parsed.content_block.id || "",
            type: "function",
            function: {
              name: parsed.content_block.name || "",
              arguments: isEmptyRecord(initialInput) ? "" : JSON.stringify(initialInput),
            },
          };
          toolCalls.push(toolCall);
          const toolCallIndex = toolCalls.length - 1;
          toolCallIndexByContentIndex.set(blockIndex, toolCallIndex);
          anthropicContentBlocks[blockIndex] = {
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.function.name,
            input: initialInput,
          };
          onToolCallsDelta?.(cloneToolCalls(toolCalls.filter((toolCall) => toolCall.id || toolCall.function.name)));
        }

        if (
          parsed.type === "content_block_delta" &&
          (parsed.delta?.type === "input_json_delta" || typeof parsed.delta?.partial_json === "string")
        ) {
          const blockIndex = typeof parsed.index === "number" ? parsed.index : -1;
          const toolCallIndex =
            (blockIndex >= 0 ? toolCallIndexByContentIndex.get(blockIndex) : undefined) ?? toolCalls.length - 1;
          const currentToolCall = toolCalls[toolCallIndex];
          if (currentToolCall) {
            const partialJson = parsed.delta.partial_json || "";
            if (blockIndex >= 0) {
              const nextInputJson = `${toolInputJsonByContentIndex.get(blockIndex) || ""}${partialJson}`;
              toolInputJsonByContentIndex.set(blockIndex, nextInputJson);
              currentToolCall.function.arguments = nextInputJson;

              const parsedInput = parseJsonObject(nextInputJson);
              const currentBlock = anthropicContentBlocks[blockIndex];
              if (parsedInput && currentBlock?.type === "tool_use") {
                currentBlock.input = parsedInput;
              }
            } else {
              currentToolCall.function.arguments += partialJson;
            }
            onToolCallsDelta?.(cloneToolCalls(toolCalls.filter((toolCall) => toolCall.id || toolCall.function.name)));
          }
        }
      }
    }

    if (!finished && !signal?.aborted) {
      throw new Error("Stream ended unexpectedly. The API provider might be overloaded or the connection was dropped.");
    }

    for (const [blockIndex, toolCallIndex] of toolCallIndexByContentIndex) {
      const currentBlock = anthropicContentBlocks[blockIndex];
      const currentToolCall = toolCalls[toolCallIndex];
      if (currentBlock?.type !== "tool_use" || !currentToolCall) continue;

      const parsedInput = parseJsonObject(currentToolCall.function.arguments);
      if (parsedInput) {
        currentBlock.input = parsedInput;
      }
    }

    const validToolCalls = toolCalls.filter((toolCall) => toolCall.id || toolCall.function.name);
    return {
      choices: [
        {
          message: {
            role: "assistant",
            content,
            reasoning,
            ...(validToolCalls.length ? { tool_calls: validToolCalls } : {}),
            anthropic_content_blocks: anthropicContentBlocks.filter(Boolean),
          },
        },
      ],
    };
  }
}

export const isProviderImplemented = (provider: Agent["provider"]) =>
  OPENAI_COMPATIBLE_PROVIDERS.has(provider) || provider === "anthropic" || provider === "custom_anthropic";

export const getProviderAdapter = (provider: Agent["provider"]): ProviderAdapter => {
  if (OPENAI_COMPATIBLE_PROVIDERS.has(provider)) {
    return new OpenAICompatibleAdapter();
  }

  if (provider === "anthropic" || provider === "custom_anthropic") {
    return new AnthropicAdapter();
  }

  throw new Error(
    `Provider '${provider}' is not implemented yet. Please use OpenAI、智谱、DeepSeek、Custom(OpenAI-compatible) or Anthropic.`,
  );
};
