import { useEffect, useRef, useState } from "react";
import { FlattenedAgent, Attachment, ChatMessage, ChatStats, TokenUsage } from "../types";
import { AITools } from "../tools";
import { scratchToolSchemas } from "../toolSchemas";
import { getProviderAdapter, isProviderImplemented } from "../providerAdapters";
import { callAITool } from "../toolRuntime";

interface UseChatOptions {
    messages: ChatMessage[];
    currentAgent: FlattenedAgent | null;
    updateSessionMessages: (newMessages: ChatMessage[], targetSessionId?: string) => string;
    appendSessionSnapshot: (
        snapshot: {
            messageId: string;
            projectJson: string;
            attachments: Attachment[];
            inputText: string;
            createdAt: number;
        },
        targetSessionId?: string,
    ) => void;
    enableReasoning: boolean;
    vm: any;
}

const createMessageId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const STREAM_UPDATE_INTERVAL_MS = 50;
const MAX_REQUEST_USER_TURNS = 16;
const MAX_REQUEST_CHARS = 120000;
const MAX_TOOL_RESULT_CHARS = 24000;
const MAX_ATTACHMENT_TEXT_CHARS = 48000;
const MAX_TOOL_ROUNDS = 8;

const estimateTokensFromText = (text: string) => {
    if (!text) return 0;
    const cjkCount = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length || 0;
    const otherCount = Math.max(0, text.length - cjkCount);
    return Math.ceil(cjkCount + otherCount / 4);
};

const getCacheHitPercent = (usage: TokenUsage | undefined) => {
    if (usage?.cacheReadTokens === undefined || !usage.inputTokens || usage.inputTokens <= 0) return undefined;
    return Math.min(100, Math.round((usage.cacheReadTokens / usage.inputTokens) * 1000) / 10);
};

const hasValidToolCallShape = (toolCall: NonNullable<ChatMessage["tool_calls"]>[number]) =>
    Boolean(toolCall?.id && toolCall?.function?.name && typeof toolCall?.function?.arguments === "string");

const stripToolCalls = (message: ChatMessage): ChatMessage => {
    const { tool_calls, anthropic_content_blocks, ...rest } = message;
    const safeAnthropicBlocks = anthropic_content_blocks?.filter((block) => block.type !== "tool_use");
    if (safeAnthropicBlocks?.length) {
        return { ...rest, anthropic_content_blocks: safeAnthropicBlocks };
    }
    return rest;
};

const sanitizeMessagesForProvider = (messages: ChatMessage[]) => {
    const sanitized: ChatMessage[] = [];

    for (let index = 0; index < messages.length; index++) {
        const message = messages[index];

        if (message.role === "tool") {
            continue;
        }

        const hasAnthropicToolUseBlocks = message.anthropic_content_blocks?.some((block) => block.type === "tool_use");

        if (message.role !== "assistant") {
            sanitized.push(message);
            continue;
        }

        if (!message.tool_calls?.length && hasAnthropicToolUseBlocks) {
            const strippedMessage = stripToolCalls(message);
            if (strippedMessage.content || strippedMessage.reasoning || strippedMessage.anthropic_content_blocks?.length) {
                sanitized.push(strippedMessage);
            }
            continue;
        }

        if (!message.tool_calls?.length) {
            sanitized.push(message);
            continue;
        }

        const validToolCalls = message.tool_calls.filter(hasValidToolCallShape);
        const toolResults: ChatMessage[] = [];
        let cursor = index + 1;
        while (cursor < messages.length && messages[cursor].role === "tool") {
            toolResults.push(messages[cursor]);
            cursor++;
        }

        const resultIds = new Set(toolResults.map((toolMessage) => toolMessage.tool_call_id).filter(Boolean));
        const answeredToolCalls = validToolCalls.filter((toolCall) => resultIds.has(toolCall.id));
        const hasCompleteToolExchange = validToolCalls.length > 0 && answeredToolCalls.length === validToolCalls.length;

        if (hasCompleteToolExchange) {
            sanitized.push({
                ...message,
                tool_calls: answeredToolCalls,
            });
            answeredToolCalls.forEach((toolCall) => {
                const toolResult = toolResults.find((item) => item.tool_call_id === toolCall.id);
                if (toolResult) {
                    sanitized.push(toolResult);
                }
            });
            index = cursor - 1;
            continue;
        }

        const strippedMessage = stripToolCalls(message);
        if (strippedMessage.content || strippedMessage.reasoning) {
            sanitized.push(strippedMessage);
        }
        index = cursor - 1;
    }

    return sanitized;
};

const truncateForProvider = (text: string, maxChars: number) => {
    if (!text || text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars; use search/read tools for the exact part you need]`;
};

const estimateMessageChars = (message: ChatMessage) => {
    let total = message.content?.length || 0;
    if (message.reasoning) total += message.reasoning.length;
    if (message.tool_calls?.length) {
        total += message.tool_calls.reduce(
            (sum, toolCall) => sum + (toolCall.function?.name?.length || 0) + (toolCall.function?.arguments?.length || 0),
            0,
        );
    }
    if (message.attachments?.length) {
        total += message.attachments.reduce((sum, attachment) => sum + (attachment.content?.length || 0), 0);
    }
    if (message.anthropic_content_blocks?.length) {
        total += JSON.stringify(message.anthropic_content_blocks).length;
    }
    return total;
};

// Keep only the recent user turns within a character budget so long sessions still fit the provider context.
const selectMessagesForRequest = (messages: ChatMessage[]) => {
    if (messages.length === 0) return messages;

    const userIndexes: number[] = [];
    messages.forEach((message, index) => {
        if (message.role === "user") userIndexes.push(index);
    });

    let startIndex =
        userIndexes.length > MAX_REQUEST_USER_TURNS ? userIndexes[userIndexes.length - MAX_REQUEST_USER_TURNS] : 0;
    let selected = messages.slice(startIndex);
    let totalChars = selected.reduce((sum, message) => sum + estimateMessageChars(message), 0);

    while (totalChars > MAX_REQUEST_CHARS) {
        let nextUserIndex = -1;
        for (let index = startIndex + 1; index < messages.length; index++) {
            if (messages[index].role === "user") {
                nextUserIndex = index;
                break;
            }
        }
        if (nextUserIndex < 0) break;
        startIndex = nextUserIndex;
        selected = messages.slice(startIndex);
        totalChars = selected.reduce((sum, message) => sum + estimateMessageChars(message), 0);
    }

    while (selected.length > 0 && selected[0].role === "tool") {
        selected = selected.slice(1);
    }

    return selected;
};

const ANTHROPIC_PROVIDERS = new Set<FlattenedAgent["provider"]>(["anthropic", "custom_anthropic"]);

const toProviderMessage = (
    message: ChatMessage,
    content: string,
    options: { includeAssistantMetadata?: boolean; provider?: FlattenedAgent["provider"] } = {},
) => {
    const validToolCalls = message.tool_calls?.filter(hasValidToolCallShape) || [];

    const providerContent =
        message.role === "tool" ? truncateForProvider(content, MAX_TOOL_RESULT_CHARS) : content;

    return {
        role: message.role,
        content: providerContent,
        ...(options.includeAssistantMetadata && message.reasoning && ANTHROPIC_PROVIDERS.has(options.provider || "openai")
            ? {
                reasoning: message.reasoning,
            }
            : {}),
        ...(options.includeAssistantMetadata && message.reasoning && !ANTHROPIC_PROVIDERS.has(options.provider || "openai")
            ? {
                reasoning_content: message.reasoning,
            }
            : {}),
        ...(options.includeAssistantMetadata && message.anthropic_content_blocks?.length && ANTHROPIC_PROVIDERS.has(options.provider || "openai")
            ? {
                anthropic_content_blocks: message.anthropic_content_blocks,
            }
            : {}),
        ...(validToolCalls.length
            ? {
                tool_calls: validToolCalls.map((toolCall) => ({
                    id: toolCall.id,
                    type: toolCall.type || "function",
                    function: toolCall.function,
                })),
            }
            : {}),
        ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
        ...(message.name ? { name: message.name } : {}),
    };
};

const buildRequestMessages = (
    messages: ChatMessage[],
    options: { includeAssistantMetadata?: boolean; provider?: FlattenedAgent["provider"] } = {},
) =>
    sanitizeMessagesForProvider(messages).map((message) => {
        if (message.role !== "user" || !message.attachments?.length) {
            return toProviderMessage(message, message.content, options);
        }

        const attachmentText = truncateForProvider(
            message.attachments
                .map(
                    (attachment, index) =>
                        `[Attachment ${index + 1}] ${attachment.name} (${attachment.kind})${attachment.kind === "workspace-ucf-range" && attachment.meta?.startBlockId && attachment.meta?.endBlockId
                            ? ` [editable-range startBlockId=${attachment.meta.startBlockId}, endBlockId=${attachment.meta.endBlockId}]`
                            : ""
                        }:\n${attachment.content}`,
                )
                .join("\n\n"),
            MAX_ATTACHMENT_TEXT_CHARS,
        );

        const content = message.content
            ? `${message.content}\n\n=== Attachments ===\n${attachmentText}`
            : `=== Attachments ===\n${attachmentText}`;

        return toProviderMessage(message, content, options);
    });

export const SYSTEM_PROMPT = `You are 02Agent, a senior Scratch/02engine coding assistant. Operate on the user's real project only through tools; never guess project contents, file paths, target ids, variables, blocks, or costume order.

Language and behavior:
- Reply in the same language as the user's latest message; default to zh-CN.
- Call tools instead of describing what you would do. Inspect before editing, and make the smallest safe change.
- Never claim a change succeeded until the corresponding tool succeeded and required diagnostics passed.
- Do not paste tool-call JSON or applyPatch markup into chat. Summarize what changed and the validation result concisely.
- For a pure question, answer directly without modifying the project.
- If critical information is missing, ask one concise question; otherwise state a reasonable assumption and continue.

Tool map (full parameter schemas are included with this request):
- Overview/index: getProjectOverview, listFiles, searchFiles, readFile.
- Scratch reference: getScratchGuide, searchBlocks, getBlockHelp.
- Extensions: searchExtensions, installExtension.
- Data slices: readVariable, readListSlice, searchList, getDataSummary.
- Edit/validate: applyPatch, getDiagnostics.
- Targets/costumes: createSpriteWithSvg, updateSpriteProperties, listCostumes, addCostumeWithSvg, batchAddCostumesWithSvg, deleteCostume, batchDeleteCostumes, reorderCostume, setCostumeOrder, deleteSprite.

Workflow:
1. Start with getProjectOverview. Use listFiles when the paths are unclear.
2. If getProjectOverview returns mode "indexed", never ask for full list/variable contents. Use readVariable, readListSlice, searchList, or getDataSummary for bounded slices.
3. Read only files you are about to edit. Use getScratchGuide for common DSL patterns, then searchBlocks/getBlockHelp before using unfamiliar opcodes, menus, or inputs.
4. If a required extension block is not loaded, use searchExtensions, then installExtension for the specific built-in or trusted extension. Do not install unrelated extensions or arbitrary URLs unless the user explicitly requested that exact trusted URL.
5. Patch one small script or file at a time. Preserve existing // @script <scriptId> and // blockId markers; new scripts need unique markers like // @script new-score-loop. Ordinary JS comments immediately before a block call become Scratch comments; // @script and // blockId metadata comments do not.
6. Run getDiagnostics after each applyPatch that changes project code. Fix failures before continuing or reporting success.
7. For reusable math, sorting, painting, or repeated logic, use custom blocks instead of copying stacks. Use broadcasts for cross-target orchestration only, not as local function calls when a custom block can pass parameters. For pen rendering, prefer one event/broadcast -> one warp custom block that clears and draws the whole frame; pass highlights, scale, and offsets through $args.
8. When adding, deleting, or reordering costumes/backdrops, inspect order first with getProjectOverview or listCostumes. Prefer batchAddCostumesWithSvg/batchDeleteCostumes for batches; never remove the last costume; never use createSpriteWithSvg for an existing sprite name.
9. When creating a sprite, pass its intended x/y/size/direction/rotationStyle/visible/currentCostumeIndex into createSpriteWithSvg, then immediately call updateSpriteProperties for any value that should differ from the defaults.
10. Keep working until the request is satisfied, then reply with a short summary of changed paths and diagnostics.

Project model:
- Scripts live in /stage.js and /sprites/<name>.js. Costumes/backdrops live in /stage/costumes/*.svg and /sprites/<name>/costumes/*.svg. Use stable paths from listFiles; do not invent paths or target ids.
- A sprite target owns scripts/state and can move, rotate, resize, clone, and change costume. A costume is only a visual asset. The stage owns backdrop assets and cannot move, rotate, resize, or clone.
- Scratch stage coordinates are center-origin: x increases right, y increases up. Default visible bounds are x=-240..240 and y=-180..180. SVG coordinates normally use top-left origin with y downward; do not confuse the two coordinate systems.
- Full-stage backdrop SVG: width="480" height="360" viewBox="0 0 480 360", centered around (240,180). Sprite costume SVG: tightly fit the artwork and keep the visual center at width/2,height/2. Keep complete SVG documents and never wrap SVG or patch content in Markdown fences.

applyPatch format:
- Preferred format:
  *** Begin Patch
  *** Update File: /sprites/Cat.js
  @@
   existing context line
  +new line
  *** End Patch
- For a new file or a complete replacement, the full replacement content may follow *** Update File directly without + prefixes.

Virtual JS DSL essentials:
- Each program section contains expression statements only; each statement is one Scratch block call.
- Block call: namespace.method({ args }) or bare identifier({ args }). Prefer dotted calls.
- Fields and menus use "$field_*" selectors, for example { $field_VARIABLE: "score" }, { $field_LIST: "numbers" }, or { $field_COLOR_PARAM: "brightness" }.
- Read a variable with data.variable({ $field_VARIABLE: "name" }). Never use data.variable inside define(...) to read a custom block parameter.
- Inputs use plain keys: { MESSAGE: "hi", VALUE: 1, CONDITION: ... }.
- Boolean slots must receive Boolean blocks such as operator.equals/operator.gt/operator.lt; do not put a raw variable reporter where a Boolean is required.
- Substacks and callbacks use arrow functions: SUBSTACK: () => { ... }.
- Meta keys: $mutation, $args, $xy. Use $xy on top-level scripts to place a stack.
- Custom blocks: define placeholders such as %n[highlight] and read parameters with argument.reporter_string_number({ $field_VALUE: "highlight" }) or argument.reporter_boolean({ $field_VALUE: "enabled" }). Call them with procedures.call({ $mutation: { proccode: "draw frame %n", warp: "true" }, $args: [...] }).
- Prefer info: ["warp"] for render/math helpers that should complete without screen refresh.
- control.if only has SUBSTACK; use control.if_else when you need SUBSTACK2. Arithmetic operators use NUM1/NUM2; comparison operators use OPERAND1/OPERAND2.

Short examples:
- event.whenflagclicked({ $xy: { x: 80, y: 80 } }, () => { looks.say({ MESSAGE: "hello" }); });
- control.if_else({ CONDITION: sensing.keypressed({ $field_KEY_OPTION: "space" }), SUBSTACK: () => { ... }, SUBSTACK2: () => { ... } });
- data.setvariableto({ $field_VARIABLE: "score", VALUE: 0 }); data.addtolist({ $field_LIST: "numbers", ITEM: operator.random({ FROM: 1, TO: 100 }) });
- define({ proccode: "draw frame %n[left] %n[right]", info: ["warp"], $xy: { x: 80, y: 520 } }, () => { pen.clear(); /* use argument.reporter_string_number for left/right */ });
- pen.setPenColorParamTo({ $field_COLOR_PARAM: "color", VALUE: 50 });`;

export function useChat({
    messages,
    currentAgent,
    updateSessionMessages,
    appendSessionSnapshot,
    enableReasoning,
    vm,
}: UseChatOptions) {
    const [inputText, setInputText] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [chatStats, setChatStats] = useState<ChatStats | null>(null);
    const aiToolsRef = useRef<AITools | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const callTool = async (functionName: string, args: Record<string, any>) =>
        callAITool(aiToolsRef.current as Record<string, any> | null, functionName, args);

    useEffect(() => {
        aiToolsRef.current?.dispose?.();
        aiToolsRef.current = vm ? new AITools(vm) : null;

        return () => {
            abortControllerRef.current?.abort();
            aiToolsRef.current?.dispose?.();
            aiToolsRef.current = null;
        };
    }, [vm]);

    const handleSend = async () => {
        if (isGenerating) return;
        if (!inputText.trim() && attachments.length === 0) return;

        if (!currentAgent) {
            updateSessionMessages([
                ...messages,
                {
                    id: createMessageId(),
                    role: "assistant",
                    content: "Error: 当前没有可用的 AI Agent，请先在设置中添加或恢复一个 Agent。",
                },
            ]);
            return;
        }

        if (!isProviderImplemented(currentAgent.provider)) {
            updateSessionMessages([
                ...messages,
                {
                    id: createMessageId(),
                    role: "assistant",
                    content: `Error: 当前 Provider '${currentAgent.provider}' 暂未接入。请改用 OpenAI、智谱、DeepSeek 或 Custom(OpenAI-compatible)。`,
                },
            ]);
            return;
        }

        const newMessage: ChatMessage = {
            id: createMessageId(),
            role: "user",
            content: inputText,
            attachments,
        };
        const cleanedPreviousMessages = sanitizeMessagesForProvider(messages);
        const newMessages = [...cleanedPreviousMessages, newMessage];
        let sessionId = "";

        sessionId = updateSessionMessages(newMessages);
        appendSessionSnapshot(
            {
                messageId: newMessage.id,
                projectJson: typeof vm?.toJSON === "function" ? vm.toJSON() : "",
                attachments,
                inputText,
                createdAt: Date.now(),
            },
            sessionId,
        );
        setInputText("");
        setAttachments([]);
        setChatStats(null);
        setIsGenerating(true);
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        let currentMessages = newMessages;
        let pendingStreamMessages: ChatMessage[] | null = null;
        let streamUpdateTimer: number | null = null;

        const flushStreamMessages = () => {
            if (streamUpdateTimer !== null) {
                window.clearTimeout(streamUpdateTimer);
                streamUpdateTimer = null;
            }
            if (!pendingStreamMessages) return;
            updateSessionMessages(pendingStreamMessages, sessionId);
            pendingStreamMessages = null;
        };

        const scheduleStreamMessagesUpdate = () => {
            pendingStreamMessages = currentMessages;
            if (streamUpdateTimer !== null) return;
            streamUpdateTimer = window.setTimeout(() => {
                streamUpdateTimer = null;
                if (!pendingStreamMessages) return;
                updateSessionMessages(pendingStreamMessages, sessionId);
                pendingStreamMessages = null;
            }, STREAM_UPDATE_INTERVAL_MS);
        };

        type ActiveRequestStats = {
            startedAt: number;
            firstTokenAt: number | null;
            lastTokenAt: number | null;
            completedAt: number | null;
            estimatedOutputTokens: number;
            toolCallTokens: number;
            estimatedInputTokens: number;
            usage?: TokenUsage;
        };

        let activeRequestStats: ActiveRequestStats | null = null;
        let lastStatsPublishedAt = 0;

        const publishActiveStats = (force = false) => {
            const active = activeRequestStats;
            if (!active) return;

            const now = active.completedAt || Date.now();
            if (!force && now - lastStatsPublishedAt < 120) return;
            lastStatsPublishedAt = now;

            const estimatedOutputTokens = active.estimatedOutputTokens + active.toolCallTokens;
            const outputTokens =
                active.usage?.outputTokens ?? (estimatedOutputTokens > 0 ? estimatedOutputTokens : undefined);
            const decodeEnd = active.lastTokenAt ?? now;
            const decodeMs = active.firstTokenAt === null ? undefined : Math.max(1, decodeEnd - active.firstTokenAt);
            const tokensPerSecond = outputTokens && decodeMs ? outputTokens / (decodeMs / 1000) : undefined;

            setChatStats({
                startedAt: active.startedAt,
                completedAt: active.completedAt || undefined,
                firstTokenAt: active.firstTokenAt || undefined,
                ttftMs: active.firstTokenAt === null ? undefined : active.firstTokenAt - active.startedAt,
                decodeMs,
                outputTokens,
                inputTokens: active.usage?.inputTokens,
                totalTokens: active.usage?.totalTokens,
                cacheReadTokens: active.usage?.cacheReadTokens,
                cacheWriteTokens: active.usage?.cacheWriteTokens,
                reasoningTokens: active.usage?.reasoningTokens,
                tokensPerSecond,
                contextWindow: currentAgent.contextWindow,
                contextUsedTokens: active.usage?.inputTokens ?? active.estimatedInputTokens,
                cacheHitPercent: getCacheHitPercent(active.usage),
                estimated: !active.usage,
            });
        };

        try {
            const providerAdapter = getProviderAdapter(currentAgent.provider);
            let shouldContinue = true;
            let toolRounds = 0;
            while (shouldContinue) {

                // Stop runaway tool loops even if the model keeps requesting more tools.
                if (toolRounds >= MAX_TOOL_ROUNDS) {
                    currentMessages = [
                        ...currentMessages,
                        {
                            id: createMessageId(),
                            role: "assistant",
                            content: `Error: 工具调用轮次超过上限（${MAX_TOOL_ROUNDS} 轮），已停止以避免无限循环。`,
                        },
                    ];
                    updateSessionMessages(currentMessages, sessionId);
                    break;
                }

                const requestMessages = selectMessagesForRequest(currentMessages);
                activeRequestStats = {
                    startedAt: Date.now(),
                    firstTokenAt: null,
                    lastTokenAt: null,
                    completedAt: null,
                    estimatedOutputTokens: 0,
                    toolCallTokens: 0,
                    estimatedInputTokens:
                        estimateTokensFromText(SYSTEM_PROMPT) +
                        estimateTokensFromText(JSON.stringify(requestMessages)) +
                        estimateTokensFromText(JSON.stringify(scratchToolSchemas)),
                    usage: undefined,
                };
                lastStatsPublishedAt = 0;
                const assistantMessageIndex = currentMessages.length;
                currentMessages = [
                    ...currentMessages,
                    {
                        id: createMessageId(),
                        role: "assistant",
                        content: "",
                        reasoning: "",
                        reasoningStartedAt: enableReasoning ? Date.now() : undefined,
                    },
                ];
                updateSessionMessages(currentMessages, sessionId);

                const data = await providerAdapter.sendChatCompletion({
                    agent: currentAgent,
                    messages: [
                        { id: createMessageId(), role: "system", content: SYSTEM_PROMPT },
                        ...buildRequestMessages(requestMessages, {
                            includeAssistantMetadata: enableReasoning,
                            provider: currentAgent.provider,
                        }),
                    ],
                    tools: scratchToolSchemas,
                    toolChoice: "auto",
                    enableReasoning,
                    signal: abortControllerRef.current.signal,
                    onReasoningDelta: (delta) => {
                        if (activeRequestStats) {
                            const now = Date.now();
                            activeRequestStats.estimatedOutputTokens += estimateTokensFromText(delta);
                            if (activeRequestStats.firstTokenAt === null) {
                                activeRequestStats.firstTokenAt = now;
                            }
                            activeRequestStats.lastTokenAt = now;
                        }
                        currentMessages = currentMessages.map((message, index) =>
                            index === assistantMessageIndex
                                ? {
                                    ...message,
                                    reasoning: `${message.reasoning || ""}${delta}`,
                                    reasoningStartedAt: message.reasoningStartedAt || Date.now(),
                                }
                                : message,
                        );
                        scheduleStreamMessagesUpdate();
                        publishActiveStats();
                    },
                    onTextDelta: (delta) => {
                        if (activeRequestStats) {
                            const now = Date.now();
                            activeRequestStats.estimatedOutputTokens += estimateTokensFromText(delta);
                            if (activeRequestStats.firstTokenAt === null) {
                                activeRequestStats.firstTokenAt = now;
                            }
                            activeRequestStats.lastTokenAt = now;
                        }
                        currentMessages = currentMessages.map((message, index) =>
                            index === assistantMessageIndex
                                ? {
                                    ...message,
                                    content: `${message.content}${delta}`,
                                }
                                : message,
                        );
                        scheduleStreamMessagesUpdate();
                        publishActiveStats();
                    },
                    onToolCallsDelta: (toolCalls) => {
                        if (activeRequestStats) {
                            const now = Date.now();
                            if (activeRequestStats.firstTokenAt === null) {
                                activeRequestStats.firstTokenAt = now;
                            }
                            activeRequestStats.lastTokenAt = now;
                            activeRequestStats.toolCallTokens = estimateTokensFromText(JSON.stringify(toolCalls));
                        }
                        currentMessages = currentMessages.map((message, index) =>
                            index === assistantMessageIndex
                                ? {
                                    ...message,
                                    tool_calls: toolCalls,
                                }
                                : message,
                        );
                        scheduleStreamMessagesUpdate();
                        publishActiveStats();
                    },
                });
                flushStreamMessages();
                if (activeRequestStats) {
                    activeRequestStats.usage = (data as { usage?: TokenUsage } | undefined)?.usage;
                    activeRequestStats.completedAt = Date.now();
                    publishActiveStats(true);
                }
                const responseMessage = data.choices[0].message as ChatMessage;
                const responseToolCalls = responseMessage.tool_calls?.filter(
                    (toolCall) => toolCall?.id || toolCall?.function?.name,
                );

                currentMessages = currentMessages.map((message, index) =>
                    index === assistantMessageIndex
                        ? {
                            ...message,
                            ...responseMessage,
                            content: responseMessage.content || message.content,
                            reasoning: responseMessage.reasoning || message.reasoning,
                            ...(responseToolCalls?.length ? { tool_calls: responseToolCalls } : { tool_calls: undefined }),
                            reasoningStartedAt: message.reasoningStartedAt,
                            reasoningEndedAt:
                                message.reasoningStartedAt && (responseMessage.reasoning || message.reasoning)
                                    ? Date.now()
                                    : message.reasoningEndedAt,
                        }
                        : message,
                );
                updateSessionMessages(currentMessages, sessionId);

                if (responseToolCalls && responseToolCalls.length > 0) {
                    toolRounds += 1;
                    for (const toolCall of responseToolCalls) {
                        const functionName = toolCall.function.name;
                        let toolResult = "";

                        currentMessages = [
                            ...currentMessages,
                            {
                                id: createMessageId(),
                                role: "tool",
                                tool_call_id: toolCall.id,
                                name: functionName,
                                content: "",
                            },
                        ];
                        updateSessionMessages(currentMessages, sessionId);

                        try {
                            let args: Record<string, any> = {};
                            try {
                                const parsedArgs = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
                                if (!parsedArgs || typeof parsedArgs !== "object" || Array.isArray(parsedArgs)) {
                                    throw new Error("Tool arguments must be a JSON object");
                                }
                                args = parsedArgs;
                            } catch (parseError: any) {
                                throw new Error(`Invalid tool arguments: ${parseError.message}`);
                            }

                            const result = await callTool(functionName, args);
                            try {
                                toolResult = typeof result === "object" ? JSON.stringify(result) : String(result);
                            } catch (stringifyError: any) {
                                toolResult = `Error: Tool result could not be serialized: ${stringifyError.message}`;
                            }
                        } catch (err: any) {
                            toolResult = `Error: ${err.message}`;
                        }

                        currentMessages = [
                            ...currentMessages.slice(0, -1),
                            {
                                id: createMessageId(),
                                role: "tool",
                                tool_call_id: toolCall.id,
                                name: functionName,
                                content: toolResult,
                            },
                        ];
                        updateSessionMessages(currentMessages, sessionId);
                    }
                } else {
                    shouldContinue = false;
                }
            }
        } catch (err: any) {
            flushStreamMessages();
            if (err?.name === "AbortError") {
                const trimmedMessages = currentMessages.filter(
                    (message, index) =>
                        !(
                            index === currentMessages.length - 1 &&
                            message.role === "assistant" &&
                            !message.content &&
                            !message.reasoning &&
                            !message.tool_calls?.length
                        ),
                );
                updateSessionMessages(sanitizeMessagesForProvider(trimmedMessages), sessionId);
                return;
            }
            updateSessionMessages(
                [...sanitizeMessagesForProvider(currentMessages), { id: createMessageId(), role: "assistant", content: `Error: ${err.message}` }],
                sessionId,
            );
        } finally {
            flushStreamMessages();
            if (activeRequestStats && activeRequestStats.completedAt === null) {
                activeRequestStats.completedAt = Date.now();
                publishActiveStats(true);
            }
            abortControllerRef.current = null;
            setIsGenerating(false);
        }
    };

    const handleStopGenerating = () => {
        abortControllerRef.current?.abort();
    };

    return {
        inputText,
        setInputText,
        isGenerating,
        chatStats,
        attachments,
        setAttachments,
        handleSend,
        handleStopGenerating,
    };
}
