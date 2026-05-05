import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import chat from "../ui/Chat.module.less";
import { Attachment, ChatMessage, ToolCall } from "../types";
import { ToolCallViewer } from "./ToolCallViewer";
import { MessageAttachments } from "./MessageAttachments";
import ChevronRightIcon from "assets/icon-chevron-right.svg";
import CopyIcon from "assets/icon-copy.svg";
import UndoIcon from "assets/icon-undo.svg";

interface ChatAreaProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  vm: PluginContext["vm"];
  onOpenWorkspaceAttachment: (attachment: Attachment) => void;
  onRestoreToUserMessage: (messageId: string, message: ChatMessage) => void;
  hasSnapshot: (messageId: string) => boolean;
}

type AssistantSegment =
  | { type: "text"; id: string; content: string }
  | {
      type: "reasoning";
      id: string;
      content: string;
      isComplete: boolean;
      startedAt?: number;
      endedAt?: number;
    }
  | { type: "tools"; id: string; toolCalls: ToolCall[]; toolResults: ChatMessage[] };

interface AssistantBubble {
  sourceMessage: ChatMessage;
  segments: AssistantSegment[];
}

interface ReasoningPanelState {
  collapsed: boolean;
  hasAutoCollapsed: boolean;
}

interface ChangeSummaryFile {
  path: string;
  added: number;
  deleted: number;
  operations: number;
}

interface ChangeSummary {
  files: ChangeSummaryFile[];
  added: number;
  deleted: number;
  operations: number;
}

const CODE_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "of",
  "return",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "yield",
]);

const CODE_TOKEN_PATTERN =
  /(\/\/.*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[A-Za-z_$][\w$]*(?=\s*\()|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b|[{}[\]().,;:+\-*/%=<>!&|?]+)/g;

const getCodeTokenClass = (token: string) => {
  if (/^\/\//.test(token) || /^\/\*/.test(token)) return chat.syntaxComment;
  if (/^["'`]/.test(token)) return chat.syntaxString;
  if (/^\d/.test(token)) return chat.syntaxNumber;
  if (CODE_KEYWORDS.has(token)) return chat.syntaxKeyword;
  if (/^[A-Za-z_$][\w$]*$/.test(token) && !CODE_KEYWORDS.has(token)) return chat.syntaxIdentifier;
  return chat.syntaxPunctuation;
};

const renderHighlightedCode = (code: string) => {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  code.replace(CODE_TOKEN_PATTERN, (token, _match, offset) => {
    if (offset > cursor) {
      nodes.push(code.slice(cursor, offset));
    }

    nodes.push(
      <span key={`${offset}-${token}`} className={getCodeTokenClass(token)}>
        {token}
      </span>,
    );
    cursor = offset + token.length;
    return token;
  });

  if (cursor < code.length) {
    nodes.push(code.slice(cursor));
  }

  return nodes;
};

const MarkdownCode = ({ inline, className, children, ...props }: any) => {
  const rawCode = String(children ?? "");
  const code = rawCode.replace(/\n$/, "");
  const language = /language-([\w-]+)/.exec(className || "")?.[1];
  const isInline = inline ?? (!className && !rawCode.includes("\n"));

  if (isInline) {
    return (
      <code className={chat.markdownInlineCode} {...props}>
        {children}
      </code>
    );
  }

  return (
    <code className={chat.markdownCode} data-language={language || undefined} {...props}>
      {renderHighlightedCode(code)}
    </code>
  );
};

const markdownComponents = {
  code: MarkdownCode,
};

const STICKY_BOTTOM_DISTANCE = 48;

const ReasoningChevron = ({ expanded }: { expanded: boolean }) => (
  <span
    style={{
      display: "inline-flex",
      transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
      transition: "transform 0.2s ease",
    }}
  >
    <img src={ChevronRightIcon} aria-hidden="true" alt="" />
  </span>
);

const formatReasoningDuration = (startedAt?: number, endedAt?: number) => {
  if (!startedAt || !endedAt || endedAt < startedAt) {
    return "已思考";
  }

  return `已思考 ${((endedAt - startedAt) / 1000).toFixed(2)}s`;
};

const collectAssistantBubbles = (messages: ChatMessage[], isGenerating: boolean) => {
  const items: Array<ChatMessage | AssistantBubble> = [];

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role === "system" || message.role === "tool") {
      continue;
    }

    if (message.role === "assistant") {
      const segments: AssistantSegment[] = [];
      let cursor = index;

      while (cursor < messages.length && messages[cursor].role !== "user") {
        const currentMessage = messages[cursor];

        if (currentMessage.role === "assistant") {
          const normalizedReasoning = currentMessage.reasoning?.trim() || "";
          const normalizedContent = currentMessage.content?.trim() || "";
          const hasReasoningContent = Boolean(normalizedReasoning);
          const hasTextContent = Boolean(normalizedContent);

          if (hasReasoningContent) {
            segments.push({
              type: "reasoning",
              id: `reasoning-${cursor}`,
              content: normalizedReasoning,
              isComplete: Boolean(normalizedContent || currentMessage.tool_calls?.length),
              startedAt: currentMessage.reasoningStartedAt,
              endedAt: currentMessage.reasoningEndedAt,
            });
          }

          if (
            !hasReasoningContent &&
            !hasTextContent &&
            !currentMessage.tool_calls?.length &&
            isGenerating &&
            cursor === messages.length - 1
          ) {
            segments.push({
              type: "reasoning",
              id: `reasoning-${cursor}`,
              content: "",
              isComplete: false,
              startedAt: currentMessage.reasoningStartedAt,
              endedAt: currentMessage.reasoningEndedAt,
            });
          }

          if (hasTextContent) {
            segments.push({
              type: "text",
              id: `text-${cursor}`,
              content: normalizedContent,
            });
          }

          if (currentMessage.tool_calls?.length) {
            const toolResults: ChatMessage[] = [];
            let resultCursor = cursor + 1;
            while (resultCursor < messages.length && messages[resultCursor].role === "tool") {
              toolResults.push(messages[resultCursor]);
              resultCursor++;
            }

            const previousSegment = segments[segments.length - 1];
            if (previousSegment?.type === "tools" && !hasTextContent) {
              previousSegment.toolCalls.push(...currentMessage.tool_calls);
              previousSegment.toolResults.push(...toolResults);
            } else {
              segments.push({
                type: "tools",
                id: `tools-${cursor}`,
                toolCalls: [...currentMessage.tool_calls],
                toolResults,
              });
            }
            cursor = resultCursor - 1;
          }
        }

        cursor++;
      }

      items.push({ sourceMessage: message, segments });
      index = cursor - 1;
      continue;
    }

    items.push(message);
  }

  return items;
};

const safeParseJson = (value: string) => {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const parsePatchStats = (patch: string) => {
  const files: Array<{ path: string; added: number; deleted: number }> = [];
  let current: { path: string; added: number; deleted: number } | null = null;

  String(patch || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((line) => {
      if (line.startsWith("*** Update File:")) {
        current = {
          path: line.slice("*** Update File:".length).trim(),
          added: 0,
          deleted: 0,
        };
        files.push(current);
        return;
      }

      if (!current || line === "*** Begin Patch" || line === "*** End Patch" || line.startsWith("@@")) {
        return;
      }

      if (line.startsWith("+")) {
        current.added += 1;
        return;
      }

      if (line.startsWith("-")) {
        current.deleted += 1;
        return;
      }

      if (!line.startsWith(" ")) {
        current.added += 1;
      }
    });

  return files.filter((file) => file.path);
};

const collectLatestChangeSummary = (messages: ChatMessage[], isGenerating: boolean): ChangeSummary | null => {
  if (isGenerating) return null;

  const lastUserIndex = Math.max(
    0,
    messages.reduce((lastIndex, message, index) => (message.role === "user" ? index : lastIndex), -1),
  );
  const latestTurnMessages = messages.slice(lastUserIndex);
  const toolResults = latestTurnMessages.filter((message) => message.role === "tool");
  const byPath = new Map<string, ChangeSummaryFile>();

  latestTurnMessages.forEach((message) => {
    if (message.role !== "assistant" || !message.tool_calls?.length) {
      return;
    }

    message.tool_calls.forEach((toolCall) => {
      if (toolCall.function.name !== "applyPatch") {
        return;
      }

      const resultMessage = toolResults.find((result) => result.tool_call_id === toolCall.id);
      const result = safeParseJson(resultMessage?.content || "") as any;
      if (!result || result.success === false) {
        return;
      }

      const args = safeParseJson(toolCall.function.arguments) as any;
      parsePatchStats(args?.patch || "").forEach((file) => {
        const existing = byPath.get(file.path) || { path: file.path, added: 0, deleted: 0, operations: 0 };
        existing.added += file.added;
        existing.deleted += file.deleted;
        byPath.set(file.path, existing);
      });

      (Array.isArray(result?.changedFiles) ? result.changedFiles : []).forEach((path: string) => {
        if (!path) return;
        byPath.set(path, byPath.get(path) || { path, added: 0, deleted: 0, operations: 0 });
      });

      (Array.isArray(result?.syncResults) ? result.syncResults : []).forEach((syncResult: any) => {
        const path = syncResult?.path;
        if (!path) return;
        const existing = byPath.get(path) || { path, added: 0, deleted: 0, operations: 0 };
        existing.operations += Number(syncResult?.operationCount || 0);
        byPath.set(path, existing);
      });
    });
  });

  const files = [...byPath.values()];
  if (!files.length) {
    return null;
  }

  return {
    files,
    added: files.reduce((sum, file) => sum + file.added, 0),
    deleted: files.reduce((sum, file) => sum + file.deleted, 0),
    operations: files.reduce((sum, file) => sum + file.operations, 0),
  };
};

const summarizeAssistantMessageForCopy = (item: AssistantBubble) =>
  item.segments
    .map((segment) => {
      if (segment.type === "text") {
        return segment.content;
      }

      if (segment.type === "tools") {
        return `${segment.toolCalls.length}次工具调用`;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n");

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isGenerating,
  vm,
  onOpenWorkspaceAttachment,
  onRestoreToUserMessage,
  hasSnapshot,
}) => {
  const displayItems = React.useMemo(() => collectAssistantBubbles(messages, isGenerating), [messages, isGenerating]);
  const latestChangeSummary = React.useMemo(
    () => collectLatestChangeSummary(messages, isGenerating),
    [messages, isGenerating],
  );
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const stickyRef = React.useRef(true);
  const userDetachedRef = React.useRef(false);
  const scrollFrameRef = React.useRef<number | null>(null);
  const [isStickyToBottom, setIsStickyToBottom] = React.useState(true);
  const [reasoningPanels, setReasoningPanels] = React.useState<Record<string, ReasoningPanelState>>({});

  const setStickyState = React.useCallback((nextSticky: boolean) => {
    stickyRef.current = nextSticky;
    setIsStickyToBottom(nextSticky);
  }, []);

  const cancelScheduledScroll = React.useCallback(() => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }, []);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = scrollRef.current;
    if (!element) return;
    const targetTop = Math.max(0, element.scrollHeight - element.clientHeight);
    userDetachedRef.current = false;
    setStickyState(true);

    if (behavior === "smooth") {
      element.scrollTo({ top: targetTop, behavior });
      return;
    }

    element.scrollTop = targetTop;
  }, [setStickyState]);

  const detachFromAutoScroll = React.useCallback(() => {
    cancelScheduledScroll();
    userDetachedRef.current = true;
    setStickyState(false);
  }, [cancelScheduledScroll, setStickyState]);

  const handleScroll = React.useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (userDetachedRef.current) {
      const isBackAtBottom = distanceToBottom <= 4;
      if (isBackAtBottom) {
        userDetachedRef.current = false;
      }
      setStickyState(isBackAtBottom);
      return;
    }

    setStickyState(distanceToBottom <= STICKY_BOTTOM_DISTANCE);
  }, [setStickyState]);

  const handleWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (event.deltaY < -1) {
        detachFromAutoScroll();
      }
    },
    [detachFromAutoScroll],
  );

  const scheduleFollowBottom = React.useCallback((behavior: ScrollBehavior = "auto") => {
    if (!stickyRef.current) return;

    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      scrollToBottom("auto");
      if (behavior === "smooth") {
        window.requestAnimationFrame(() => scrollToBottom("smooth"));
      }
    });
  }, [scrollToBottom]);

  React.useLayoutEffect(() => {
    if (stickyRef.current) {
      scheduleFollowBottom("auto");
    }
  }, [displayItems, isGenerating, scheduleFollowBottom]);

  React.useEffect(() => {
    const scrollElement = scrollRef.current;
    const railElement = railRef.current;
    if (!scrollElement || !railElement || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => {
      if (stickyRef.current) {
        scheduleFollowBottom("auto");
      }
    });

    observer.observe(railElement);
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [isGenerating, scheduleFollowBottom]);

  React.useEffect(
    () => () => cancelScheduledScroll(),
    [cancelScheduledScroll],
  );

  React.useEffect(() => {
    setReasoningPanels((previous) => {
      const next = { ...previous };
      let changed = false;

      displayItems.forEach((item) => {
        if ("role" in item) {
          return;
        }

        item.segments.forEach((segment) => {
          if (segment.type !== "reasoning") {
            return;
          }

          if (!(segment.id in next)) {
            next[segment.id] = {
              collapsed: segment.isComplete,
              hasAutoCollapsed: segment.isComplete,
            };
            changed = true;
            return;
          }

          if (segment.isComplete && !next[segment.id].hasAutoCollapsed) {
            next[segment.id] = {
              collapsed: true,
              hasAutoCollapsed: true,
            };
            changed = true;
          }
        });
      });

      return changed ? next : previous;
    });
  }, [displayItems]);

  const toggleReasoning = React.useCallback((id: string) => {
    setReasoningPanels((previous) => ({
      ...previous,
      [id]: {
        collapsed: !previous[id]?.collapsed,
        hasAutoCollapsed: previous[id]?.hasAutoCollapsed ?? false,
      },
    }));
  }, []);

  const handleCopy = React.useCallback(async (text: string) => {
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
  }, []);

  return (
    <div className={chat.chatArea} ref={scrollRef} onScroll={handleScroll} onWheel={handleWheel}>
      <div className={chat.conversationRail} ref={railRef}>
        {displayItems.length === 0 ? (
          <div className={chat.emptyState}>
            <span className={chat.emptyStateBadge}>02Agent</span>
            <h4 className={chat.emptyStateTitle}>把问题、需求或代码片段直接发进来</h4>
            <p className={chat.emptyStateText}>
              可以让它解释积木逻辑、整理上下文、分析附件，或者直接帮助你修改当前工作区内容。
            </p>
          </div>
        ) : (
          displayItems.map((item, index) => {
            const isLatestLiveItem = isGenerating && index === displayItems.length - 1;
            if ("role" in item) {
              return (
                <div key={item.id || index} className={`${chat.messageRow} ${chat.userMessage}`}>
                  <div className={`${chat.messageActionRail} ${chat.messageActionRailHorizontal}`}>
                    <button
                      type="button"
                      className={chat.messageActionButton}
                      title="复制消息"
                      aria-label="复制消息"
                      onClick={() => void handleCopy(item.content)}
                    >
                      <img src={CopyIcon} aria-hidden="true" alt="" />
                    </button>
                    {hasSnapshot(item.id) ? (
                      <button
                        type="button"
                        className={chat.messageActionButton}
                        title="撤回到这里"
                        aria-label="撤回到这里"
                        onClick={() => onRestoreToUserMessage(item.id, item)}
                      >
                        <img src={UndoIcon} aria-hidden="true" alt="" />
                      </button>
                    ) : null}
                  </div>
                  <div className={chat.messageTurnBody}>
                    <div className={`${chat.messageBubble} ${chat.messageBubbleUser}`}>
                      <pre className={chat.messageText}>{item.content}</pre>
                      {item.attachments?.length ? (
                        <MessageAttachments
                          attachments={item.attachments}
                          onOpenAttachment={onOpenWorkspaceAttachment}
                          vm={vm}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            }

            const latestStreamingTextSegmentId = isLatestLiveItem
              ? [...item.segments].reverse().find((segment) => segment.type === "text")?.id
              : undefined;

            return (
              <div
                key={item.sourceMessage.id || index}
                className={`${chat.messageRow} ${chat.assistantMessage} ${isLatestLiveItem ? chat.messageRowLive : ""}`}
              >
                <div className={chat.messageTurnBody}>
                  <div className={`${chat.messageBubble} ${chat.messageBubbleAssistant}`}>
                    <div className={chat.assistantSegments}>
                      {item.segments.map((segment) =>
                        segment.type === "text" ? (
                          <div
                            key={segment.id}
                            className={`${chat.messageMarkdown} ${
                              segment.id === latestStreamingTextSegmentId ? chat.messageMarkdownStreaming : ""
                            }`}
                          >
                            {segment.id === latestStreamingTextSegmentId ? (
                              <pre className={chat.messageText}>{segment.content}</pre>
                            ) : (
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {segment.content}
                              </ReactMarkdown>
                            )}
                          </div>
                        ) : segment.type === "reasoning" ? (
                          <div
                            key={segment.id}
                            className={`${chat.reasoningInline} ${
                              !segment.isComplete && isLatestLiveItem ? chat.reasoningInlineActive : ""
                            }`}
                          >
                            <button
                              type="button"
                              className={chat.reasoningInlineButton}
                              onClick={() => toggleReasoning(segment.id)}
                            >
                              <span className={chat.reasoningInlineLabel}>
                                {segment.isComplete
                                  ? formatReasoningDuration(segment.startedAt, segment.endedAt)
                                  : "思考中..."}
                              </span>
                              <span className={chat.reasoningInlineArrow}>
                                <ReasoningChevron expanded={!reasoningPanels[segment.id]?.collapsed} />
                              </span>
                            </button>
                            {!reasoningPanels[segment.id]?.collapsed ? (
                              <div className={chat.reasoningInlineBody}>
                                <pre className={chat.reasoningText}>{segment.content || "模型正在整理思路..."}</pre>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <ToolCallViewer
                            key={segment.id}
                            toolCalls={segment.toolCalls}
                            toolResults={segment.toolResults}
                            isGenerating={isGenerating}
                          />
                        ),
                      )}
                    </div>
                  </div>
                </div>
                <div className={chat.messageActionRail}>
                  <button
                    type="button"
                    className={chat.messageActionButton}
                    title="复制消息"
                    aria-label="复制消息"
                    onClick={() => void handleCopy(summarizeAssistantMessageForCopy(item))}
                  >
                    <img src={CopyIcon} aria-hidden="true" alt="" />
                  </button>
                </div>
              </div>
            );
          })
        )}
        {latestChangeSummary ? (
          <div className={chat.finalChangeSummary}>
            <div className={chat.finalChangeSummaryHeader}>
              <strong>{latestChangeSummary.files.length} 个文件已更改</strong>
              <span>
                <b className={chat.diffAdded}>+{latestChangeSummary.added}</b>{" "}
                <b className={chat.diffDeleted}>-{latestChangeSummary.deleted}</b>
              </span>
            </div>
            <div className={chat.finalChangeFileList}>
              {latestChangeSummary.files.map((file) => (
                <div key={file.path} className={chat.finalChangeFileItem}>
                  <span>{file.path}</span>
                  <span>
                    <b className={chat.diffAdded}>+{file.added}</b>{" "}
                    <b className={chat.diffDeleted}>-{file.deleted}</b>
                    {file.operations ? <em>{file.operations} 个脚本操作</em> : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} className={chat.bottomAnchor} aria-hidden="true" />
      </div>
      {!isStickyToBottom ? (
        <button className={chat.scrollToBottomButton} onClick={() => scrollToBottom()} title="回到底部">
          ↓
        </button>
      ) : null}
    </div>
  );
};
