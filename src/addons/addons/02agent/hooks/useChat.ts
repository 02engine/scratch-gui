import { useCallback, useEffect, useRef, useState } from "react";
import { FlattenedAgent, Attachment, ChatMessage, ChatStats, TokenUsage, MCPServerConfig, SkillConfig, PromptConfig } from "../types";
import { AITools, measureAsync, measureSync } from "../tools";
import { scratchToolSchemas } from "../toolSchemas";
import { getProviderAdapter, isProviderImplemented } from "../providerAdapters";
import { callAITool, MUTATING_TOOLS, PLAN_BLOCKED_TOOLS } from "../toolRuntime";
import { AskUserQuestion, bindAskUserHandler, bindImageModelResolver, bindNoticeListener, bindSkillsChangedListener, bindSkillsProvider, bindSubagentResultListener, bindSubagentRunner, getSubagentDefinition, listTodos, setSubagentDefinitions, SkillWriteResult, TodoItem, updateTodos } from "../agentStores";
import { SubagentDef } from "../types";
import { SubagentResultEntry } from "../agentStores";
import { runSubagentLoop } from "./useSubagentLoop";
import { mcpRegistry } from "../mcpClient";

interface UseChatOptions {
    messages: ChatMessage[];
    /** Active conversation id; switching conversations clears pending reflow queues. */
    currentSessionId?: string;
    subagents: SubagentDef[];
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
    planMode: boolean;
    vm: any;
    /** Enabled/disabled state of MCP servers used to extend the tool list. */
    mcpServers: MCPServerConfig[];
    /** Names of built-in tools the user disabled in 设置 → 工具. */
    disabledTools: string[];
    /** Skill instructions injected into the system prompt when enabled. */
    skills: SkillConfig[];
    /** User-editable system prompt override (prepend / append / replace). */
    promptConfig?: PromptConfig;
    /** Current session's compacted-summary state (see ChatSession.compacted). */
    compacted?: { summary: string; upTo: number };
    /** Persist the compacted-summary state for the current session. */
    updateSessionCompacted?: (compacted: { summary: string; upTo: number } | undefined) => void;
}

const createMessageId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const STREAM_UPDATE_INTERVAL_MS = 50;
const MAX_REQUEST_USER_TURNS = 16;
const MAX_REQUEST_CHARS = 120000;
const MAX_TOOL_RESULT_CHARS = 24000;
const MAX_ATTACHMENT_TEXT_CHARS = 48000;
const MAX_TOOL_ROUNDS = 8;
const MAX_PLAN_TOOL_ROUNDS = 12;

/** Compaction keeps the most recent tail verbatim within this character budget. */
const COMPACT_RETAIN_CHARS = 40000;
/** Below this many characters there is nothing worth summarizing. */
const COMPACT_MIN_CHARS = 8000;

const COMPACTED_SUMMARY_TAG = "compacted-summary";

/**
 * The compaction instruction, kept verbatim. Steps 1-4 drive the model's analysis,
 * the output format fixes the <state_snapshot> sections, and the self-check makes it
 * verify its own output before answering.
 */
const COMPACTION_PROMPT = `You are a context compression assistant for a coding agent. Your job is to compress
the conversation history below into a <state_snapshot> that lets the agent resume
work without re-reading the original context.

【Step 1 — 在 <analysis> 中按时间顺序分析，不要跳过】
1. 用户的原始任务是什么？后续有哪些修正或补充约束？
2. 哪些文件被读取、创建或修改？改动的目的是什么？
3. 哪些命令被执行过？哪些成功、哪些失败？失败的具体报错是什么？
4. 做过哪些技术决策？为什么选 A 不选 B？排除了哪些方案？
5. 当前进行到哪一步？下一步计划是什么？
6. 有哪些用户明确提出的约束（技术栈、禁止修改的文件、代码风格、依赖限制）？

【Step 2 — 必须逐字保留（verbatim，不得改写或概括）】
- 文件路径、目录结构、函数名、类名、变量名、API 端点
- 命令原文（含参数、flag、环境变量）
- 报错信息原文（错误类型 + 关键行，不要只写“报错”）
- 版本号、分支名、commit hash、PR/issue 编号、端口号、配置项键名
- 用户提出的硬约束与禁止事项

【Step 3 — 必须保留语义（可以概括，但因果不能丢）】
- 每个技术决策的理由，尤其是“为什么没选另一个方案”
- 失败的尝试及其失败原因（避免后续重复踩坑）
- 已确认的事实（如“该 API 需要 token 才能调用”“此文件是自动生成的，不要手改”）
- 尚未解决的问题，以及已经试过的解法

【Step 4 — 可以丢弃】
- 寒暄、确认性对话、思考过程的重复
- 已被后续决策推翻的中间方案
- 工具输出中与当前目标无关的大段内容（如完整文件内容、成功的构建日志全文）
- 但：工具输出中的**关键返回值、报错、测试失败用例名**必须保留

【输出格式】
先输出 <analysis>，再输出 <state_snapshot>：

<state_snapshot>
  <overall_goal>用户最终要达成什么（一句话）</overall_goal>
  <user_constraints>用户提出的硬性约束、偏好、禁止事项</user_constraints>
  <key_knowledge>已确认的技术事实（API 行为、文件性质、环境限制等）</key_knowledge>
  <file_system_state>
    已修改/创建的文件，每个文件附：路径 + 改动目的 + 当前状态（完成/进行中/待验证）
  </file_system_state>
  <commands_and_results>
    关键命令 + 结果（成功/失败 + 失败时的报错原文）
  </commands_and_results>
  <decisions>技术决策 + 理由 + 被排除的方案及原因</decisions>
  <failed_approaches>失败路径 + 失败原因（防止重复尝试）</failed_approaches>
  <current_state>当前进度、正在做的事、卡在哪里</current_state>
  <next_steps>下一步计划，以及执行它所需的最小上下文</next_steps>
  <open_questions>待确认的问题</open_questions>
</state_snapshot>

【Self-check（输出后执行，不要省略）】
- 用户约束是否全部写入 <user_constraints>？
- 所有文件路径、命令、报错是否逐字保留？
- 失败路径是否都记录了原因？
- 摘要总 token 是否 ≤ 原文的 50%？若超过，压缩 <commands_and_results>
  中的成功输出，保留失败输出。`;

/**
 * Compose the full compaction request. When a summary already exists it is appended
 * as prior state so the model rolls it forward instead of starting over.
 */
const buildCompactionPrompt = (previousSummary: string, transcript: string) => {
    const previous = previousSummary
        ? `\n\n=== 已有的摘要（请在其基础上滚动更新：保留仍为真的事实、丢弃已过时的内容、合并为一份） ===\n${previousSummary}`
        : "";
    return `${COMPACTION_PROMPT}${previous}\n\n=== 需要压缩的对话历史 ===\n${transcript}`;
};

/** Render messages as a compact transcript for the summarizer. */
const renderTranscriptForSummary = (messages: ChatMessage[]) =>
    messages
        .map((message) => {
            const role = message.role;
            const parts: string[] = [];
            if (message.content?.trim()) parts.push(message.content.trim());
            if (message.tool_calls?.length) {
                parts.push(
                    message.tool_calls
                        .map((call) => `[tool_call ${call.function?.name || "?"}] ${call.function?.arguments || ""}`)
                        .join("\n"),
                );
            }
            if (!parts.length) return "";
            const body = parts.join("\n").slice(0, 4000);
            return `--- ${role} ---\n${body}`;
        })
        .filter(Boolean)
        .join("\n\n");

/**
 * Move `cut` forward until it does not split a tool_call from its tool result.
 * A boundary is safe when it sits before a user message, or after the last tool
 * result of a completed call group.
 */
const alignCutToToolPair = (messages: ChatMessage[], cut: number) => {
    let index = Math.max(0, Math.min(cut, messages.length));
    while (index > 0 && index < messages.length) {
        const next = messages[index];
        // Never start the retained tail with an orphan tool result.
        if (next.role !== "tool") break;
        index += 1;
    }
    return index;
};

/**
 * Pick the boundary for compaction: accumulate from the end until the retained tail
 * reaches COMPACT_RETAIN_CHARS, then align it to a tool-pair safe position.
 * Returns 0 when nothing should be compacted.
 */
const computeCompactionCut = (
    messages: ChatMessage[],
    fromIndex: number,
    retainChars: number = COMPACT_RETAIN_CHARS,
    minRegionChars: number = COMPACT_MIN_CHARS,
    force: boolean = false,
) => {
    let total = 0;
    let cut = messages.length;
    for (let index = messages.length - 1; index >= fromIndex; index -= 1) {
        total += estimateMessageChars(messages[index]);
        cut = index;
        if (total >= retainChars) break;
    }

    const usable = () => cut > fromIndex && alignCutToToolPair(messages, cut) > fromIndex;

    // Forced compaction must always make progress. When the whole remaining history fits
    // inside the retain budget there is no natural boundary, so keep only the last couple
    // of messages verbatim and compress everything before them.
    if (!usable() && force) {
        // Always leave at least one message verbatim; never summarize the whole history away.
        cut = Math.min(messages.length - 1, Math.max(fromIndex + 1, messages.length - 2));
    }

    if (cut <= fromIndex) return 0;
    const aligned = alignCutToToolPair(messages, cut);
    if (aligned <= fromIndex) return 0;
    const regionChars = messages
        .slice(fromIndex, aligned)
        .reduce((sum, message) => sum + estimateMessageChars(message), 0);
    if (minRegionChars > 0 && regionChars < minRegionChars) return 0;
    return aligned;
};

const buildSummaryMessage = (summary: string): ChatMessage => ({
    id: createMessageId(),
    role: "user",
    content: `<${COMPACTED_SUMMARY_TAG}>\n${summary.trim()}\n</${COMPACTED_SUMMARY_TAG}>\n\n以上是对更早对话的压缩快照（含 analysis 与 state_snapshot）。请据此继续工作：不要重复已完成或已失败的尝试，按 <next_steps> 推进；需要细节时用工具重新读取对应文件。`,
});

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
const selectMessagesForRequest = (messages: ChatMessage[], compacted?: { summary: string; upTo: number }) => {
    if (messages.length === 0) return messages;

    // Everything before `compacted.upTo` is represented by the rolled-up summary.
    const compactedUpTo = compacted?.summary ? Math.min(compacted.upTo, messages.length) : 0;
    const tail = compactedUpTo > 0 ? messages.slice(compactedUpTo) : messages;
    const prefix = compactedUpTo > 0 ? [buildSummaryMessage(compacted.summary)] : [];

    const userIndexes: number[] = [];
    tail.forEach((message, index) => {
        if (message.role === "user") userIndexes.push(index);
    });

    let startIndex =
        userIndexes.length > MAX_REQUEST_USER_TURNS ? userIndexes[userIndexes.length - MAX_REQUEST_USER_TURNS] : 0;
    let selected = tail.slice(startIndex);
    let totalChars = selected.reduce((sum, message) => sum + estimateMessageChars(message), 0);

    while (totalChars > MAX_REQUEST_CHARS) {
        let nextUserIndex = -1;
        for (let index = startIndex + 1; index < tail.length; index++) {
            if (tail[index].role === "user") {
                nextUserIndex = index;
                break;
            }
        }
        if (nextUserIndex < 0) break;
        startIndex = nextUserIndex;
        selected = tail.slice(startIndex);
        totalChars = selected.reduce((sum, message) => sum + estimateMessageChars(message), 0);
    }

    while (selected.length > 0 && selected[0].role === "tool") {
        selected = selected.slice(1);
    }

    return [...prefix, ...selected];
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
- Prefer normal project tools; use runJavaScript only for computation, data transformation, or multi-step tool glue. Project mutations must still be performed through the validated mutation tools.
- Never claim a change succeeded until the corresponding tool succeeded and required diagnostics passed.
- Do not paste tool-call JSON or applyPatch markup into chat. Summarize what changed and the validation result concisely.
- For a pure question, answer directly without modifying the project.
- If critical information is missing, ask one concise question; otherwise state a reasonable assumption and continue.

Tool map (full parameter schemas are included with this request):
- Overview/index: getProjectOverview, listFiles, searchFiles, readFile.
- Scratch reference: getScratchGuide, searchBlocks, getBlockHelp.
- Extensions: searchExtensions, installExtension.
- Data slices: readVariable, readListSlice, searchList, getDataSummary.
- Compute/glue: runJavaScript (main thread, not sandboxed; has full page access incl. fetch/console/sdk.vm; use await sdk.call(name, args) to compose tools and return a JSON-serializable value).
- Edit/validate: applyPatch, getDiagnostics.
- Targets/costumes: createSpriteWithSvg, updateSpriteProperties, listCostumes, addCostumeWithSvg, batchAddCostumesWithSvg, deleteCostume, batchDeleteCostumes, reorderCostume, setCostumeOrder, deleteSprite.
- Stage observability: observeStage — live positions/speech/broadcast-listener state; call it after stage changes to VERIFY the change took effect instead of assuming.
- Undo: discardDraft — restores a virtual file to its pre-write snapshot (text + blocks). Last resort; prefer an inverse applyPatch to keep history.
- Media generation: generateCostumeFromDescription — needs an image model id in 设置 → 模型（IMAGE_MODEL_NOT_CONFIGURED 时改用 SVG 描述，不要反复重试）.
- Recording: startStageRecording / stopStageRecording — stage WebM; the returned url is page-scoped (lost on refresh), so tell the user to save it via 右键另存为.
- Subagents: runSubAgent starts a background run and returns AT ONCE (never idle-wait); results are injected next turn as <subagent_results> AND are listed by checkSubagentResults. Entries with partial=true are incomplete — say so when you use them.
- Skills/memory: listSkills, readSkill, createSkill + memory tools (see Collaboration tools).

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

export const PLAN_MODE_PROMPT = `Plan mode (read-only) is active:
- Do NOT modify the project. Mutating tools (applyPatch, sprite/costume creation, deletion or reordering tools, installExtension, etc.) are removed from your tool list, and calls made through runJavaScript's sdk.call are rejected as well.
- Research first: getProjectOverview -> listFiles/searchFiles -> readFile/readVariable/readListSlice/searchList -> getScratchGuide/searchBlocks/getBlockHelp/searchExtensions when needed. Use getDiagnostics to understand current errors.
- runJavaScript is available for read-only computation and read-only tool composition only.
- observeStage, readSkill, listSkills, checkSubagentResults, listMemoryBlocks and getMemoryBlock remain available as read-only inputs for planning.
- When you have enough information, reply with a concrete implementation plan instead of making changes. Include: (1) the goal, (2) exact files/targets/scripts to change, (3) ordered steps, (4) risks or open questions, (5) how you will validate (getDiagnostics etc.).
- Never claim that something was changed. The user will approve the plan before execution starts.
- If the user's message is only a question, answer it directly; keep the plan short.`;

/** Tool-usage guidance for the collaboration tools (memory / todos / questions). */
const COLLAB_PROMPT = `

## Collaboration tools

- updateTodoList: for any multi-step task (three steps or more), maintain the visible task list and update statuses as you progress (pending / in_progress / completed / cancelled). Keep ids stable across updates.
- askUser: ask AT MOST once per turn and only when missing information would change the result; prefer reasonable assumptions otherwise. Combine all clarifications into one call.
- Skill sedimentation (createSkill): when the SAME scenario or user preference recurs (2+ times), offer to persist it as a skill instead of a memory. AI-written skills start DISABLED; tell the user to review in Settings > Skills. One-off facts belong to memory tools.
- Memory tools: use setMemoryBlock to persist durable facts worth remembering across sessions (project convention under scope "project", stable user rules/preferences under scope "longTerm"). At the start of a relevant task, use listMemoryBlocks to recall context; correct stale facts with replaceMemoryBlockText instead of rewriting whole blocks; deleteMemoryBlock only when a memory is wrong.`;

const buildSystemPrompt = (planMode: boolean): string =>
    planMode ? `${SYSTEM_PROMPT}\n\n${PLAN_MODE_PROMPT}` : `${SYSTEM_PROMPT}${COLLAB_PROMPT}`;

/** Append enabled skill instructions so the model follows the user's custom guidance. */
const enabledSkills = (skills: SkillConfig[]): SkillConfig[] =>
    skills.filter((skill) => skill.enabled && skill.name?.trim() && skill.content?.trim());

/** Compact index only — full skill text is NO LONGER auto-injected; the model reads it on demand
    via listSkills / readSkill (or when the user picks one with "/" before sending). */
const buildSkillsIndexPrompt = (skills: SkillConfig[]): string => {
    const enabled = enabledSkills(skills);
    if (enabled.length === 0) return "";
    const lines = enabled
        .map((skill) => {
            const description = skill.description?.trim() ? ` — ${skill.description.trim()}` : "";
            return `- ${skill.name?.trim()}${description}（用 readSkill 读取全文）`;
        })
        .join("\n");
    return `\n\n## Skills index (on-demand)\n\nThe following skills are enabled but NOT inlined here. When relevant, call listSkills / readSkill to load the full instructions before acting:\n${lines}\n\nSkills are user-authored standing guidance; follow them by default, but the user's latest explicit request takes precedence over any skill.`;
};

/** Full inline injection, now only used for a user-selected skill ("/skill" flow). */
const buildSkillTextPrompt = (skill: SkillConfig): string =>
    `\n\n## Selected skill: ${skill.name}\n${skill.description ? `${skill.description}\n` : ""}${skill.content}`;

const getToolSchemasForMode = (planMode: boolean) =>
    planMode
        ? scratchToolSchemas.filter(
              (tool) =>
                  !MUTATING_TOOLS.has(tool.function.name) && !PLAN_BLOCKED_TOOLS.has(tool.function.name),
          )
        : scratchToolSchemas;

export function useChat({
    subagents,
    messages,
    currentSessionId,
    currentAgent,
    updateSessionMessages,
    appendSessionSnapshot,
    enableReasoning,
    planMode,
    vm,
    mcpServers,
    disabledTools,
    skills,
    promptConfig,
    compacted,
    updateSessionCompacted,
}: UseChatOptions) {
    const [inputText, setInputText] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [chatStats, setChatStats] = useState<ChatStats | null>(null);
    const [systemPrompt, setSystemPrompt] = useState<string>("");
    const [isPlanReady, setIsPlanReady] = useState(false);
    const aiToolsRef = useRef<AITools | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const disabledToolSetRef = useRef(new Set(disabledTools));
    const compactedRef = useRef(compacted);
    const [isCompacting, setIsCompacting] = useState(false);
    const [todos, setTodos] = useState<TodoItem[]>(() => listTodos());
    // Task list is per-turn/per-conversation: hide it when a new turn starts or a
    // different conversation is opened (cleared by clearTodos below).
    const clearTodos = useCallback(() => {
        updateTodos([]);
        setTodos([]);
    }, []);
    // Poll for tool-driven updates; cheap and avoids threading a store into every tool call.
    const agentRef = useRef(currentAgent);
    const skillsRef = useRef(skills);
    const subagentsRef = useRef(subagents);
    const pendingSubagentReflowRef = useRef<SubagentResultEntry[]>([]);
    const pendingSkillsReflowRef = useRef<SkillWriteResult[]>([]);
    // Streaming refs are mirror values consumed inside async closures. Writing them
    // during render was fragile under concurrent rendering; mirror them via effects.
    useEffect(() => {
        disabledToolSetRef.current = new Set(disabledTools);
    }, [disabledTools]);
    useEffect(() => {
        compactedRef.current = compacted;
    }, [compacted]);
    useEffect(() => {
        agentRef.current = currentAgent;
    }, [currentAgent]);
    useEffect(() => {
        skillsRef.current = skills;
    }, [skills]);
    useEffect(() => {
        subagentsRef.current = subagents;
    }, [subagents]);
    useEffect(() => {
        setSubagentDefinitions(subagentsRef.current);
    }, [subagents]);

    // Reflow entries belong to the conversation they were produced in; switching or
    // opening a conversation drops the queue so old results cannot leak into a new chat.
    useEffect(() => {
        if (!currentSessionId) return;
        pendingSubagentReflowRef.current = [];
        pendingSkillsReflowRef.current = [];
    }, [currentSessionId]);

    // Expose the active model's image config to image-generation tools + generic notices.
    useEffect(() => {
        const unbindImage = bindImageModelResolver(() => {
            const agent = agentRef.current;
            return agent?.imageModel ? { baseUrl: agent.baseUrl, apiKey: agent.apiKey, modelId: agent.imageModel } : null;
        });
        const unbindNotice = bindNoticeListener((text, autoClearMs) => showStatusNotice(text, autoClearMs));
        const unbindSkillsChanged = bindSkillsChangedListener((result) => {
            pendingSkillsReflowRef.current = [...pendingSkillsReflowRef.current, result].slice(-5);
            showStatusNotice(`<技能库更新> ${result.name}（待审查启用）`, 6000);
        });
        return () => {
            unbindImage();
            unbindNotice();
            unbindSkillsChanged();
        };
    }, []);

    // Surface finished background subagent runs as a status notice.
    useEffect(() => {
        const unbind = bindSubagentResultListener((entry) => {
            // Completed summaries are queued and injected into the NEXT request's system
            // prompt (see send path) so the model learns the result without polling.
            if (entry.status === "completed") pendingSubagentReflowRef.current = [...pendingSubagentReflowRef.current, entry].slice(-5);
            const label = entry.status === "completed"
                ? `<子智能体完成> ${entry.profile} 已返回结果（用 checkSubagentResults 查看）`
                : `<子智能体失败> ${entry.profile}：${entry.error || "未知错误"}`;
            showStatusNotice(label, 6000);
        });
        return () => {
            unbind();
        };
    }, []);
    useEffect(() => {
        const unbind = bindSkillsProvider(() => {
            const enabled = skillsRef.current.filter((skill) => skill.enabled && skill.name?.trim() && skill.content?.trim());
            return enabled.map((skill) => ({
                id: skill.id || `skill-${skill.name}`,
                name: skill.name,
                description: skill.description,
                content: skill.content,
            }));
        });
        return () => {
            unbind();
        };
    }, []);
    // Subagent runner: run a one-shot conversation against the current agent without tools.
    useEffect(() => {
        const unbind = bindSubagentRunner(async (profile, task, context) => {
            const agent = agentRef.current;
            if (!agent) throw new Error("子智能体不可用：当前没有可用的模型配置。");
            const def = getSubagentDefinition(profile);
            if (!def) throw new Error(`未知子智能体 profile ${profile}`);
            const systemPrompt = `${def.systemPrompt}\n\nYou may use ONLY the provided read-only tools when they help. Do not modify the project.\n\nOutput contract: your final text is delivered verbatim to the main agent as the run summary, and it cannot see this conversation. Make it self-contained: state the answer/findings directly, key evidence, and remaining uncertainty — no narration of your process or tool calls.`;
            const adapter = getProviderAdapter(agent.provider);
            const toolNames = [
                "readFile", "listFiles", "searchFiles", "getProjectOverview", "readVariable", "readListSlice",
                "searchList", "searchBlocks", "getBlocksHelp", "observeStage", "listMemoryBlocks", "getMemoryBlock",
            ];
            const subagentTools = (getToolSchemasForMode(false) as any[]).filter((tool: any) => toolNames.includes(tool.function?.name));
            return runSubagentLoop(
                {
                    sendMessage: (messages, opts) => adapter.sendChatCompletion({
                        agent,
                        messages,
                        tools: subagentTools,
                        toolChoice: "auto" as any,
                        enableReasoning: false,
                        onTextDelta: opts.onTextDelta,
                    }),
                    executeTool: (name: string, args: any) => callAITool(
                        aiToolsRef.current as Record<string, any> | null,
                        name,
                        args,
                        {allowBuiltinTool: (toolName: string) => toolNames.includes(toolName)},
                    ),
                },
                {profile, task, systemPrompt, context},
            );
        });
        return () => {
            unbind();
        };
    }, []);


    // Preset status-notice state before its handlers below.
    const [statusNotice, setStatusNotice] = useState<string | null>(null);
    // Full compaction summary kept for the "view compressed content" overlay.
    const [compactionPreview, setCompactionPreview] = useState<string | null>(null);
    const statusNoticeTimerRef = useRef<number | null>(null);
    // Bumped by clearStatusNotice so a pending timer callback cannot resurrect a cleared queue.
    const noticeEpochRef = useRef(0);
    type NoticeItem = { text: string; autoClearMs?: number };
    const noticeQueueRef = useRef<NoticeItem[]>([]);
    const noticeActiveRef = useRef(false);

    // No-op updates must not re-render: the 600ms poll produces a fresh array
    // every tick even when the tool-driven todos did not change.
    const todosEqual = (a: TodoItem[] | null, b: TodoItem[] | null) => {
        if (a === b) return true;
        if (!a || !b || a.length !== b.length) return false;
        for (let index = 0; index < a.length; index += 1) {
            if (
                a[index].id !== b[index].id ||
                a[index].status !== b[index].status ||
                a[index].title !== b[index].title
            ) {
                return false;
            }
        }
        return true;
    };
    useEffect(() => {
        const timer = window.setInterval(() => {
            const next = listTodos();
            setTodos((prev) => (todosEqual(prev, next) ? prev : next));
        }, 600);
        return () => window.clearInterval(timer);
    }, []);

    const clearStatusNotice = useCallback(() => {
        noticeEpochRef.current += 1;
        if (statusNoticeTimerRef.current !== null) {
            window.clearTimeout(statusNoticeTimerRef.current);
            statusNoticeTimerRef.current = null;
        }
        setStatusNotice(null);
        noticeQueueRef.current = [];
        noticeActiveRef.current = false;
    }, []);

    /** Show a transient status line in the message rail; queued when one is already showing. */
    const showStatusNotice = useCallback((text: string, autoClearMs?: number) => {
        noticeQueueRef.current = [...noticeQueueRef.current, { text, autoClearMs }].slice(-8);
        if (noticeActiveRef.current) return;
        const displayNext = (epoch: number) => {
            if (epoch !== noticeEpochRef.current) return;
            const item = noticeQueueRef.current.shift();
            if (!item) {
                noticeActiveRef.current = false;
                return;
            }
            noticeActiveRef.current = true;
            setStatusNotice(item.text);
            if (statusNoticeTimerRef.current !== null) window.clearTimeout(statusNoticeTimerRef.current);
            statusNoticeTimerRef.current = window.setTimeout(
                () => {
                    statusNoticeTimerRef.current = null;
                    setStatusNotice(null);
                    displayNext(epoch);
                },
                item.autoClearMs || 3000,
            );
        };
        displayNext(noticeEpochRef.current);
    }, []);

    const callTool = async (functionName: string, args: Record<string, any>, denyMutations = false) =>
        callAITool(aiToolsRef.current as Record<string, any> | null, functionName, args, {
            denyMutations,
            allowMcp: !denyMutations,
            allowBuiltinTool: (name: string) => !(disabledToolSetRef.current.has(name)),
        });

    useEffect(() => {
        aiToolsRef.current?.dispose?.();
        aiToolsRef.current = vm ? new AITools(vm) : null;

        return () => {
            abortControllerRef.current?.abort();
            aiToolsRef.current?.dispose?.();
            aiToolsRef.current = null;
        };
    }, [vm]);

    // Generation continues into async continuations after unmount (abort races):
    // state writes must be suppressed once this component instance is gone.
    const unmountedRef = useRef(false);
    useEffect(() => {
        unmountedRef.current = false;
        return () => {
            unmountedRef.current = true;
        };
    }, []);

    useEffect(() => {
        if (!planMode) setIsPlanReady(false);
    }, [planMode]);

    /**
     * Condense older history into a rolling summary and persist the new boundary.
     * Returns the compacted state so callers can use it immediately.
     * `force` runs even when the budget is not exceeded (the 「压缩上下文」action).
     */
    const runCompaction = async (
        sourceMessages: ChatMessage[],
        agent: FlattenedAgent,
        force: boolean,
        signal?: AbortSignal,
    ): Promise<{ summary: string; upTo: number } | undefined> => {
        const view = compactedRef.current;
        const fromIndex = view?.summary ? Math.min(view.upTo, sourceMessages.length) : 0;
        const remaining = sourceMessages
            .slice(fromIndex)
            .reduce((sum, message) => sum + estimateMessageChars(message), 0);

        if (!force && remaining <= MAX_REQUEST_CHARS) return view;

        // Forced (manual) compaction ignores the length thresholds entirely: the user asked
        // for it, so shrink the retained tail proportionally and always make progress.
        if (!force && remaining < COMPACT_MIN_CHARS) return view;

        const retainChars = force ? Math.max(0, Math.min(COMPACT_RETAIN_CHARS, Math.floor(remaining * 0.4))) : COMPACT_RETAIN_CHARS;
        const cut = computeCompactionCut(sourceMessages, fromIndex, retainChars, force ? 0 : COMPACT_MIN_CHARS, force);
        if (!cut || cut <= fromIndex) {
            if (force) {
                showStatusNotice(
                    sourceMessages.length <= 1
                        ? "<无需压缩> 只有一条消息，没有可压缩的历史"
                        : "<无需压缩> 没有可压缩的较早历史",
                    4000,
                );
            }
            return view;
        }

        const region = sourceMessages.slice(fromIndex, cut);
        const transcript = renderTranscriptForSummary(region);
        if (!transcript.trim()) return view;

        const prompt = buildCompactionPrompt(view?.summary || "", transcript);

        setIsCompacting(true);
        showStatusNotice("<AI正在压缩记忆>");
        try {
            const adapter = getProviderAdapter(agent.provider);
            const data = await adapter.sendChatCompletion({
                agent,
                messages: [{ id: createMessageId(), role: "user", content: prompt }],
                enableReasoning: false,
                ...(signal ? { signal } : {}),
            });
            const summary = String(data?.choices?.[0]?.message?.content || "").trim();
            if (!summary) {
                if (force) showStatusNotice("<压缩记忆失败> 模型没有返回摘要内容", 4000);
                return view;
            }
            // Automatic compaction only keeps a summary that is actually smaller, so it never
            // inflates a short request. A manual (forced) compaction is honored even when the
            // region is tiny — the user explicitly asked for it.
            const regionChars = region.reduce((sum, message) => sum + estimateMessageChars(message), 0);
            if (!force && summary.length >= regionChars) return view;

            const next = { summary, upTo: cut };
            updateSessionCompacted?.(next);
            compactedRef.current = next;
            const summarizedCount = cut - fromIndex;
            setCompactionPreview(summary);
            showStatusNotice(`<已完成压缩记忆> 已将前 ${summarizedCount} 条消息压缩为摘要（${summary.length} 字符），点开可查看`, 5000);
            return next;
        } catch (error: any) {
            // Compaction is best-effort: on failure keep the previous view.
            // An abort is the user pressing stop, not a failure worth reporting.
            if (error?.name !== "AbortError") {
                console.warn("[02Agent] compaction failed", error);
                showStatusNotice(
                    error?.message ? `<压缩记忆失败> ${String(error.message).slice(0, 120)}（已保留原有上下文）` : "<压缩记忆失败> 已保留原有上下文",
                    4000,
                );
            }
            return view;
        } finally {
            setIsCompacting(false);
        }
    };

    /** Explicit user action: compact now regardless of the current budget. */
    const handleCompactNow = async () => {
        if (isGenerating || isCompacting) return;
        if (!currentAgent) return;
        await runCompaction(messages, currentAgent, true);
    };

    /** Explicit user action: forget earlier turns and any rolled-up summary. */
    const handleClearMemory = () => {
        if (isGenerating) return;
        updateSessionCompacted?.(undefined);
        compactedRef.current = undefined;
        showStatusNotice("<已清空记忆> 上下文摘要已删除，AI 将重新读取聊天记录", 4000);
    };


    const handleSend = async (overrides?: { text?: string; attachments?: Attachment[]; planMode?: boolean; selectedSkillId?: string }) => {
        if (isGenerating) return;
        // A new user turn starts a fresh task view: drop the previous turn's checklist.
        clearTodos();
        const effectiveInputText = overrides?.text ?? inputText;
        const effectiveAttachments = overrides?.attachments ?? attachments;
        const activePlanMode = overrides?.planMode ?? planMode;
        if (!effectiveInputText.trim() && effectiveAttachments.length === 0) return;

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
            content: effectiveInputText,
            attachments: effectiveAttachments,
        };
        const cleanedPreviousMessages = sanitizeMessagesForProvider(messages);
        const newMessages = [...cleanedPreviousMessages, newMessage];
        let sessionId = "";

        sessionId = updateSessionMessages(newMessages);
        appendSessionSnapshot(
            {
                messageId: newMessage.id,
                projectJson: typeof vm?.toJSON === "function" ? measureSync("snapshot vm.toJSON", () => vm.toJSON()) : "",
                attachments: effectiveAttachments,
                inputText: effectiveInputText,
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

        // Build the system prompt: base prompt + plan mode + user prompt override + enabled skills.
        const basePrompt = (promptConfig?.includeBase === false) ? "" : buildSystemPrompt(activePlanMode);
        const customText = (promptConfig?.text || "").trim();
        const mergedBase = (() => {
            if (!customText) return basePrompt;
            switch (promptConfig?.mode || "append") {
                case "replace":
                    return customText;
                case "prepend":
                    return `${customText}\n\n${basePrompt}`;
                case "append":
                default:
                    return `${basePrompt}\n\n${customText}`;
            }
        })();
        let activeSystemPrompt = mergedBase + buildSkillsIndexPrompt(skills);
        const selectedSkill = overrides?.selectedSkillId
            ? enabledSkills(skills).find((skill) => skill.id === overrides.selectedSkillId)
            : undefined;
        if (selectedSkill) activeSystemPrompt += buildSkillTextPrompt(selectedSkill);

        // Reflow: completed background subagent runs land in the next system prompt.
        const reflow = pendingSubagentReflowRef.current;
        pendingSubagentReflowRef.current = [];
        if (reflow.length) {
            const body = reflow
                .map(
                    (entry) =>
                        `- run ${entry.id} · ${entry.profile} · 任务: ${entry.task.slice(0, 160)}${entry.partial ? "（部分结果，可能不完整）" : ""}
  结论: ${(entry.summary || "").slice(0, 2000)}`,
                )
                .join("\n");
            activeSystemPrompt += `

<subagent_results>
以下为后台子智能体的已完成结果（仅在需要时使用，不要重复其结论）：
${body}
</subagent_results>`;
        }

        // Reflow: skills written by the AI (awaiting human review) land in the next system prompt.
        const skillsReflow = pendingSkillsReflowRef.current;
        pendingSkillsReflowRef.current = [];
        if (skillsReflow.length) {
            const body = skillsReflow
                .map((entry) => `- ${entry.status}: "${entry.name}"（enabled=${entry.enabled}，待用户在 设置 → 技能 审查后启用）`)
                .join("\n");
            activeSystemPrompt += `

<skills_updated>
以下技能刚由 AI 写入技能库（默认禁用，不会立即生效；请告知用户到 设置 → 技能 审查并启用）：
${body}
</skills_updated>`;
        }
        setSystemPrompt(activeSystemPrompt);

        // Build the tool list: built-in tools minus disabled ones, plus MCP tools from
        // enabled servers (MCP tools are excluded entirely in plan mode).
        const disabledToolSet = new Set(disabledTools || []);
        const activeToolSchemas: any[] = getToolSchemasForMode(activePlanMode).filter(
            (tool) => !disabledToolSet.has(tool.function.name),
        );

        if (!activePlanMode && Array.isArray(mcpServers) && mcpServers.some((server) => server.enabled)) {
            try {
                const { schemas, errors } = await mcpRegistry.getToolSchemas(mcpServers);
                activeToolSchemas.push(...schemas);
                if (errors.length > 0) {
                    activeSystemPrompt += `\n\nMCP servers unavailable this turn (their tools are not in your tool list): ${errors
                        .map((e) => `${e.serverName} (${e.message})`)
                        .join("; ")}`;
                }
            } catch (error) {
                console.warn("[02Agent] MCP tool discovery failed", error);
            }
        }

        const maxToolRounds = activePlanMode ? MAX_PLAN_TOOL_ROUNDS : MAX_TOOL_ROUNDS;
        setIsPlanReady(false);

        let currentMessages = newMessages;
        let assistantMessageIndex = -1;
        let streamUpdateTimer: number | null = null;
        let streamIsDirty = false;
        // Deltas are buffered and appended once per flush instead of rebuilding the whole
        // message array (and re-copying the whole growing string) for every single token.
        let pendingTextDeltas: string[] = [];
        let pendingReasoningDeltas: string[] = [];

        const applyPendingStreamDeltas = () => {
            const hasTextDeltas = pendingTextDeltas.length > 0;
            const hasReasoningDeltas = pendingReasoningDeltas.length > 0;
            if (!hasTextDeltas && !hasReasoningDeltas) return;

            const textChunk = hasTextDeltas ? pendingTextDeltas.join("") : "";
            const reasoningChunk = hasReasoningDeltas ? pendingReasoningDeltas.join("") : "";
            pendingTextDeltas = [];
            pendingReasoningDeltas = [];

            currentMessages = currentMessages.map((message, index) =>
                index === assistantMessageIndex
                    ? {
                        ...message,
                        content: textChunk ? `${message.content}${textChunk}` : message.content,
                        reasoning: reasoningChunk ? `${message.reasoning || ""}${reasoningChunk}` : message.reasoning,
                        reasoningStartedAt: reasoningChunk
                            ? message.reasoningStartedAt || Date.now()
                            : message.reasoningStartedAt,
                    }
                    : message,
            );
        };

        const commitStreamMessages = () => {
            if (!streamIsDirty) return;
            streamIsDirty = false;
            applyPendingStreamDeltas();
            updateSessionMessages(currentMessages, sessionId);
        };

        const flushStreamMessages = () => {
            if (streamUpdateTimer !== null) {
                window.clearTimeout(streamUpdateTimer);
                streamUpdateTimer = null;
            }
            commitStreamMessages();
        };

        const scheduleStreamMessagesUpdate = () => {
            streamIsDirty = true;
            if (streamUpdateTimer !== null) return;
            streamUpdateTimer = window.setTimeout(() => {
                streamUpdateTimer = null;
                commitStreamMessages();
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
            if (active) {
                const now = active.completedAt || Date.now();
                if (!force && now - lastStatsPublishedAt < 120) return;
                if (unmountedRef.current) return;
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
            }
        };

        try {
            const providerAdapter = getProviderAdapter(currentAgent.provider);
            let shouldContinue = true;
            let completedNormally = false;
            let toolRounds = 0;
            while (shouldContinue) {

                // Stop runaway tool loops even if the model keeps requesting more tools.
                if (toolRounds >= maxToolRounds) {
                    currentMessages = [
                        ...currentMessages,
                        {
                            id: createMessageId(),
                            role: "assistant",
                            content: `Error: 工具调用轮次超过上限（${maxToolRounds} 轮），已停止以避免无限循环。请检查任务是否过于复杂，或拆分成多次对话完成。`,
                        },
                    ];
                    updateSessionMessages(currentMessages, sessionId);
                    break;
                }

                // Summarize older history before it is dropped by the budget.
                const compactedView = await runCompaction(
                    currentMessages,
                    currentAgent,
                    false,
                    abortControllerRef.current?.signal,
                );
                const requestMessages = selectMessagesForRequest(currentMessages, compactedView);
                activeRequestStats = {
                    startedAt: Date.now(),
                    firstTokenAt: null,
                    lastTokenAt: null,
                    completedAt: null,
                    estimatedOutputTokens: 0,
                    toolCallTokens: 0,
                    estimatedInputTokens:
                        estimateTokensFromText(activeSystemPrompt) +
                        estimateTokensFromText(JSON.stringify(requestMessages)) +
                        estimateTokensFromText(JSON.stringify(activeToolSchemas)),
                    usage: undefined,
                };
                lastStatsPublishedAt = 0;
                assistantMessageIndex = currentMessages.length;
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
                        { id: createMessageId(), role: "system", content: activeSystemPrompt },
                        ...buildRequestMessages(requestMessages, {
                            includeAssistantMetadata: enableReasoning,
                            provider: currentAgent.provider,
                        }),
                    ],
                    tools: activeToolSchemas,
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
                        pendingReasoningDeltas.push(delta);
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
                        pendingTextDeltas.push(delta);
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
                const choices = (data as { choices?: Array<{ message?: ChatMessage }> } | undefined)?.choices;
                const responseMessage = choices?.[0]?.message;
                if (!responseMessage) {
                    throw new Error(
                        "模型返回了空响应（choices 为空或缺少 message）。请检查所选模型是否兼容工具调用，或在设置中换一个模型重试。",
                    );
                }
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

                            const result = await measureAsync(`tool:${functionName}`, () => callTool(functionName, args, activePlanMode));
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
                    completedNormally = true;
                    shouldContinue = false;
                }
            }
            if (activePlanMode && completedNormally) {
                setIsPlanReady(true);
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
            if (!unmountedRef.current) setIsGenerating(false);
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
        systemPrompt,
        attachments,
        setAttachments,
        handleSend,
        handleStopGenerating,
        isPlanReady,
        isCompacting,
        todos,
        clearTodos,
        compactionPreview,
        setCompactionPreview,
        statusNotice,
        clearStatusNotice,
        handleCompactNow,
        handleClearMemory,
    };
}
