import { Attachment, ChatMessage, ChatSession, ToolCall } from "./types";

const MAX_MESSAGE_CHARS = 6000;
const MAX_ATTACHMENT_CHARS = 1200;
const MAX_TOOL_FIELD_CHARS = 3200;
const MAX_STRING_VALUE_CHARS = 1200;
const MAX_ARRAY_ITEMS = 16;
const MAX_OBJECT_KEYS = 40;

const compactText = (value: string, maxChars: number) => {
  const text = value || "";
  if (text.length <= maxChars) return text;

  const headLength = Math.max(1, Math.floor(maxChars * 0.62));
  const tailLength = Math.max(1, maxChars - headLength);
  const omitted = text.length - headLength - tailLength;
  return `${text.slice(0, headLength)}\n... <omitted ${omitted} chars> ...\n${text.slice(-tailLength)}`;
};

const parseJson = (value: string) => {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const compactValue = (value: unknown, depth = 0): unknown => {
  if (typeof value === "string") {
    return compactText(value, MAX_STRING_VALUE_CHARS);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => compactValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`... <omitted ${value.length - MAX_ARRAY_ITEMS} items> ...`);
    }
    return items;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, unknown> = {};
  entries.slice(0, MAX_OBJECT_KEYS).forEach(([key, item]) => {
    result[key] = depth > 6 ? "... <max depth> ..." : compactValue(item, depth + 1);
  });

  if (entries.length > MAX_OBJECT_KEYS) {
    result["..."] = `<omitted ${entries.length - MAX_OBJECT_KEYS} keys>`;
  }

  return result;
};

const formatPayload = (raw: string, maxChars = MAX_TOOL_FIELD_CHARS) => {
  const parsed = parseJson(raw);
  const formatted =
    parsed === undefined ? compactText(raw || "", maxChars) : JSON.stringify(compactValue(parsed), null, 2);
  return compactText(formatted, maxChars);
};

const getToolStatus = (result?: ChatMessage) => {
  if (!result) return "running";
  if (result.content.startsWith("Error:")) return "error";

  const parsed = parseJson(result.content);
  if (parsed && typeof parsed === "object" && "success" in parsed) {
    return (parsed as { success?: unknown }).success ? "success" : "error";
  }

  return "success";
};

const formatAttachment = (attachment: Attachment, index: number) => {
  const meta = attachment.meta ? ` meta=${JSON.stringify(compactValue(attachment.meta))}` : "";
  const preview = attachment.preview || attachment.content || "";
  const contentLine = preview ? `\n  content: ${compactText(preview, MAX_ATTACHMENT_CHARS).replace(/\n/g, "\n  ")}` : "";
  return `- attachment ${index + 1}: ${attachment.name} (${attachment.kind}, ${attachment.mimeType})${meta}${contentLine}`;
};

const findToolResult = (messages: ChatMessage[], toolCall: ToolCall, startIndex: number) =>
  messages
    .slice(startIndex + 1)
    .find((message) => message.role === "tool" && message.tool_call_id === toolCall.id);

const formatToolCall = (toolCall: ToolCall, result?: ChatMessage, index = 0) => {
  const lines = [
    `  - tool ${index + 1}: ${toolCall.function.name} [${getToolStatus(result)}]`,
    `    args: ${formatPayload(toolCall.function.arguments || "{}").replace(/\n/g, "\n    ")}`,
  ];

  if (result) {
    lines.push(`    result: ${formatPayload(result.content || "").replace(/\n/g, "\n    ")}`);
  } else {
    lines.push("    result: <running/no result>");
  }

  return lines.join("\n");
};

const formatMessage = (message: ChatMessage, ordinal: number, messages: ChatMessage[], messageIndex: number) => {
  const lines = [`[${ordinal}] ${message.role}${message.name ? ` (${message.name})` : ""}`];
  const content = compactText((message.content || "").trim(), MAX_MESSAGE_CHARS);

  if (content) {
    lines.push(content);
  }

  if (message.reasoning?.trim()) {
    lines.push(`reasoning: <${message.reasoning.trim().length} chars omitted>`);
  }

  if (message.attachments?.length) {
    lines.push("attachments:");
    message.attachments.forEach((attachment, attachmentIndex) => {
      lines.push(formatAttachment(attachment, attachmentIndex));
    });
  }

  if (message.tool_calls?.length) {
    lines.push("tool_calls:");
    message.tool_calls.forEach((toolCall, toolIndex) => {
      lines.push(formatToolCall(toolCall, findToolResult(messages, toolCall, messageIndex), toolIndex));
    });
  }

  if (message.role === "tool" && !message.tool_call_id) {
    lines.push(`tool_result: ${formatPayload(message.content || "").replace(/\n/g, "\n")}`);
  }

  return lines.join("\n");
};

export const exportConversationText = (session: ChatSession | undefined, messages: ChatMessage[]) => {
  const consumedToolResultIds = new Set<string>();
  messages.forEach((message, index) => {
    message.tool_calls?.forEach((toolCall) => {
      const result = findToolResult(messages, toolCall, index);
      if (result?.id) consumedToolResultIds.add(result.id);
    });
  });

  const visibleMessages = messages.filter(
    (message) => message.role !== "tool" || !message.id || !consumedToolResultIds.has(message.id),
  );

  const header = [
    "# 02Agent Conversation Export",
    `title: ${session?.title || "未命名会话"}`,
    `sessionId: ${session?.id || "unsaved"}`,
    `exportedAt: ${new Date().toLocaleString()}`,
    `messages: ${messages.length}`,
    "note: tool args/results are compacted; long fields keep head/tail with omitted length.",
  ];

  const body = visibleMessages.map((message, index) => {
    const originalIndex = messages.indexOf(message);
    return formatMessage(message, index + 1, messages, originalIndex);
  });

  return `${header.join("\n")}\n\n${body.join("\n\n---\n\n")}`.trim();
};
