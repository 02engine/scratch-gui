import { MCP_TOOL_PREFIX } from "./mcpClient";
import { getJsPermissionMode, requestJsApproval } from "./jsPermission";

export const REQUIRED_TOOL_ARGUMENTS: Record<string, string[]> = {
  readFile: ["path"],
  readVariable: [],
  readListSlice: [],
  searchList: ["query"],
  searchFiles: ["query"],
  searchBlocks: ["query"],
  getBlockHelp: ["opcode"],
  applyPatch: ["patch"],
  createSpriteWithSvg: ["svg"],
  addCostumeWithSvg: ["svg"],
  batchAddCostumesWithSvg: ["costumes"],
  reorderCostume: ["newIndex"],
  runJavaScript: ["code"],
  askUser: [],
  updateTodoList: ["todos"],
  listMemoryBlocks: [],
  getMemoryBlock: ["id"],
  setMemoryBlock: ["text"],
  replaceMemoryBlockText: ["id", "find"],
  deleteMemoryBlock: ["id"],
  runSubAgent: ["task"],
  readSkill: ["name"],
  checkSubagentResults: [],
  createSkill: ["name", "content"],
  generateCostumeFromDescription: ["name", "description"],
  startStageRecording: [],
  stopStageRecording: [],
};

export interface CallAIToolOptions {
  // Plan mode: reject every tool that can mutate the project, including nested
  // sdk.call(...) invocations made from inside runJavaScript.
  denyMutations?: boolean;
  // Allow dispatching namespaced mcp__* tools to their MCP servers.
  allowMcp?: boolean;
  // Runtime gate for built-in tools: when provided (and NOT MCP tools, which return
  // earlier), a call is rejected unless this returns true for the tool name. Used to
  // enforce "disabled built-in tools" at invocation time — even stray model calls or
  // nested sdk.call(...) from runJavaScript are blocked. Propagates through options.
  allowBuiltinTool?: (name: string) => boolean;
}

export const MUTATING_TOOLS = new Set([
  "applyPatch",
  "createSpriteWithSvg",
  "updateSpriteProperties",
  "addCostumeWithSvg",
  "batchAddCostumesWithSvg",
  "deleteCostume",
  "batchDeleteCostumes",
  "reorderCostume",
  "setCostumeOrder",
  "deleteSprite",
  "installExtension",
  "replaceBlocksRangeByUCF",
  "replaceScriptByUCF",
  "generateCodeFromUCF",
]);

/**
 * Tools that have external/config side effects but do NOT modify the Scratch project itself.
 * They are blocked in plan mode (read-only investigation) and excluded from its tool list,
 * but they are not routed through the project mutation queue.
 */
export const PLAN_BLOCKED_TOOLS = new Set([
  "httpRequest",
  "manageMCPServers",
  "manageSkills",
  "setMemoryBlock",
  "replaceMemoryBlockText",
  "createSkill",
  "deleteMemoryBlock",
  "discardDraft",
  "generateCostumeFromDescription",
]);

let mutationQueue = Promise.resolve();

const isMissingToolArgument = (value: unknown) =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

const hasAnyToolArgument = (args: Record<string, unknown>, names: string[]) =>
  names.some((name) => !isMissingToolArgument(args[name]));

export const validateToolArguments = (functionName: string, args: Record<string, unknown>) => {
  const requiredArguments = REQUIRED_TOOL_ARGUMENTS[functionName] || [];
  const missingArguments = requiredArguments.filter((argumentName) => isMissingToolArgument(args[argumentName]));

  if (missingArguments.length > 0) {
    throw new Error(
      `Tool ${functionName} requires argument(s): ${missingArguments.join(", ")}. Received: ${JSON.stringify(args)}`,
    );
  }

  if (functionName === "askUser" && !hasAnyToolArgument(args, ["question", "questions"])) {
    throw new Error(`Tool askUser requires either question or questions. Received: ${JSON.stringify(args)}`);
  }

  if ((functionName === "readVariable" || functionName === "readListSlice") && !hasAnyToolArgument(args, ["name", "variableId"])) {
    throw new Error(`Tool ${functionName} requires either name or variableId. Received: ${JSON.stringify(args)}`);
  }

  if (functionName === "searchList" && !hasAnyToolArgument(args, ["name", "variableId"])) {
    throw new Error(`Tool ${functionName} requires either name or variableId. Received: ${JSON.stringify(args)}`);
  }
};

const dispatchAITool = async (aiTools: Record<string, any>, functionName: string, args: Record<string, any>) => {
  switch (functionName) {
    case "readFile":
      return aiTools[functionName](args.path, args.startLine, args.endLine);
    case "readVariable":
      return aiTools[functionName](args);
    case "readListSlice":
      return aiTools[functionName](args);
    case "searchList":
      return aiTools[functionName](args);
    case "getDataSummary":
      return aiTools[functionName](args);
    case "searchFiles":
      return aiTools[functionName](args);
    case "searchBlocks":
      return aiTools[functionName](args);
    case "searchExtensions":
      return aiTools[functionName](args);
    case "installExtension":
      return aiTools[functionName](args);
    case "getBlockHelp":
      return aiTools[functionName](args.opcode);
    case "getScratchGuide":
      return aiTools[functionName](args.topic);
    case "getProjectOverview":
      return aiTools[functionName]();
    case "applyPatch":
      return aiTools[functionName](args.patch);
    case "getDiagnostics":
      return aiTools[functionName](args.path);
    case "listFiles":
      return aiTools[functionName]();
    case "createSpriteWithSvg":
      return aiTools[functionName](args);
    case "updateSpriteProperties":
      return aiTools[functionName](args);
    case "listCostumes":
      return aiTools[functionName](args);
    case "addCostumeWithSvg":
      return aiTools[functionName](args);
    case "batchAddCostumesWithSvg":
      return aiTools[functionName](args);
    case "deleteCostume":
      return aiTools[functionName](args);
    case "batchDeleteCostumes":
      return aiTools[functionName](args);
    case "reorderCostume":
      return aiTools[functionName](args);
    case "setCostumeOrder":
      return aiTools[functionName](args);
    case "deleteSprite":
      return aiTools[functionName](args);
    case "sleep":
      return aiTools[functionName](args);
    case "httpRequest":
      return aiTools[functionName](args);
    case "manageMCPServers":
      return aiTools[functionName](args);
    case "manageSkills":
      return aiTools[functionName](args);
    default:
      // Always forward args: dropping them makes any tool whose signature takes an
      // options object see an empty payload (seen with the memory/todo/askUser tools).
      return aiTools[functionName](args);
  }
};

const JAVASCRIPT_WORKER_SOURCE = `
var nextToolCallId = 1;
var pendingToolCalls = new Map();
var post = function (message) { self.postMessage(message); };
var formatLogValue = function (value) {
  try {
    if (typeof value === "string") return value;
    var text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch (error) {
    return String(value);
  }
};
self.onmessage = async function (event) {
  var message = event.data || {};
  if (message.type === "tool-result") {
    var pending = pendingToolCalls.get(message.id);
    if (!pending) return;
    pendingToolCalls.delete(message.id);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
    return;
  }
  if (message.type !== "run") return;

  var logs = [];
  var sandboxConsole = {};
  ["log", "info", "warn", "error"].forEach(function (level) {
    sandboxConsole[level] = function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) parts.push(formatLogValue(arguments[i]));
      var line = level + ": " + parts.join(" ");
      if (logs.length < 200) logs.push(line);
      post({ type: "log", text: line });
    };
  });

  var callTool = function (name, args) {
    if (name === "runJavaScript") {
      return Promise.reject(new Error("runJavaScript cannot call itself"));
    }
    return new Promise(function (resolve, reject) {
      var id = nextToolCallId++;
      pendingToolCalls.set(id, { resolve: resolve, reject: reject });
      post({ type: "tool-call", id: id, name: name, args: args || {} });
    });
  };

  var sdk = {
    call: callTool,
    sleep: function (ms) {
      var duration = Math.max(0, Math.min(Number(ms) || 0, 5000));
      return new Promise(function (resolve) { setTimeout(resolve, duration); });
    }
  };

  var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  try {
    var body = '"use strict";' + String.fromCharCode(10) + String(message.code || "");
    var fn = new AsyncFunction(
      "sdk",
      "console",
      "fetch",
      "XMLHttpRequest",
      "WebSocket",
      "EventSource",
      "importScripts",
      "postMessage",
      "self",
      "globalThis",
      "Function",
      body
    );
    var result = await fn(
      sdk,
      sandboxConsole,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );
    var text;
    try {
      text = JSON.stringify(result);
      if (text === undefined) text = String(result);
    } catch (serializeError) {
      throw new Error("Result is not JSON-serializable: " + serializeError.message);
    }
    if (typeof text !== "string") text = String(text);
    var truncated = false;
    if (text.length > 60000) {
      text = text.slice(0, 60000) + "...[truncated]";
      truncated = true;
    }
    post({ type: "finished", resultText: text, truncated: truncated });
  } catch (error) {
    post({
      type: "error",
      error: error && (error.stack || error.message) ? String(error.stack || error.message) : String(error)
    });
  }
};
`;

let cachedJavaScriptWorkerUrl: string | null = null;

const getJavaScriptWorkerUrl = () => {
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("runJavaScript is not supported in this environment (Worker/Blob URL unavailable).");
  }
  if (!cachedJavaScriptWorkerUrl) {
    cachedJavaScriptWorkerUrl = URL.createObjectURL(new Blob([JAVASCRIPT_WORKER_SOURCE], { type: "text/javascript" }));
  }
  return cachedJavaScriptWorkerUrl;
};

const MAX_JAVASCRIPT_TIMEOUT_MS = 60000;
const DEFAULT_JAVASCRIPT_TIMEOUT_MS = 15000;

const parseWorkerResultText = (text: unknown) => {
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// ---------- main-thread runner (un-sandboxed) ----------
// Runs the AI-generated JS on the MAIN thread instead of inside a Web Worker. This
// gives the code direct access to the page globals: fetch, console, timers, the
// `sdk` bridge, and `sdk.vm` (the live Scratch VM). NOTE: this is arbitrary code
// execution with full page privileges — the user explicitly asked to move it out of
// the sandbox. Usage is the caller's responsibility.

const AsyncFunctionCtor = Object.getPrototypeOf(async function () {}).constructor;

const formatThreadLogValue = (value: unknown): string => {
  try {
    if (typeof value === "string") return value;
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch {
    return String(value);
  }
};

const runJavaScriptInThread = async (
  aiTools: Record<string, any>,
  code: string,
  requestedTimeoutMs?: unknown,
  options: CallAIToolOptions = {},
) => {
  const timeoutMs = Math.max(
    1000,
    Math.min(MAX_JAVASCRIPT_TIMEOUT_MS, Number(requestedTimeoutMs) || DEFAULT_JAVASCRIPT_TIMEOUT_MS),
  );
  const startedAt = Date.now();
  const mode = getJsPermissionMode();
  const source = String(code || "");

  // `review`: show the code and require explicit approval. Fails closed when no
  // approval UI is bound, so a missing dialog can never silently execute code.
  if (mode === "review") {
    const approved = await requestJsApproval(source);
    if (!approved) {
      return {
        success: false,
        error: "用户未允许执行这段 JavaScript（审核模式）。请调整方案或询问用户希望在代码中做什么。",
        logs: [],
        durationMs: Date.now() - startedAt,
        timeoutMs,
        permission: mode,
      };
    }
  }

  // `readonly`: silence every mutation path — nested tool calls run under
  // denyMutations and the live VM is not exposed.
  const readOnly = mode === "readonly";
  const nestedOptions: CallAIToolOptions = readOnly ? { ...options, denyMutations: true, allowMcp: false } : options;

  return new Promise<any>((resolve) => {
    let settled = false;
    const finish = (result: any) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const logs: string[] = [];
    const sandboxConsole: Record<string, (...args: any[]) => void> = {};
    ["log", "info", "warn", "error"].forEach((level) => {
      sandboxConsole[level] = (...args: any[]) => {
        const line = `${level}: ${args.map((a: any) => formatThreadLogValue(a)).join(" ")}`;
        if (logs.length < 200) logs.push(line);
      };
    });

    const callTool = (name: string, args: any) => {
      if (name === "runJavaScript") {
        return Promise.reject(new Error("runJavaScript cannot call itself"));
      }
      if (readOnly && MUTATING_TOOLS.has(String(name || ""))) {
        return Promise.reject(
          new Error(
            `Tool ${name} is blocked: runJavaScript runs in 仅查看 (read-only) mode. Switch 设置 → 工具 → JavaScript 执行权限 to 审核 or 开放 to allow changes.`,
          ),
        );
      }
      // Return directly; nested sdk.call works same-thread (options propagate, incl. the
      // disabled-tool runtime gate via options.allowBuiltinTool).
      return callAITool(aiTools, String(name || ""), args || {}, nestedOptions);
    };

    const exposedVm = readOnly ? undefined : aiTools?.vm;

    const sdk = {
      call: callTool,
      sleep: (ms: number) =>
        new Promise<void>((r) => setTimeout(r, Math.max(0, Math.min(Number(ms) || 0, 5000)))),
      vm: exposedVm,
    };

    try {
      const body = '"use strict";\n' + source;
      const fn = AsyncFunctionCtor("sdk", "console", "fetch", "vm", body);
      const resultPromise = fn(sdk, sandboxConsole, (url: string, init?: any) => window.fetch(url, init), exposedVm);
      const timeout = new Promise<never>((_resolve, reject) =>
        window.setTimeout(() => reject(new Error(`runJavaScript timed out after ${timeoutMs}ms.`)), timeoutMs),
      );
      Promise.race([resultPromise, timeout])
        .then((result: any) => {
          let text: string;
          try {
            text = JSON.stringify(result);
            if (text === undefined) text = String(result);
          } catch (serializeError) {
            throw new Error(`Result is not JSON-serializable: ${(serializeError as Error).message}`);
          }
          if (typeof text !== "string") text = String(text);
          let truncated = false;
          if (text.length > 60000) {
            text = text.slice(0, 60000) + "...[truncated]";
            truncated = true;
          }
          finish({
            success: true,
            result: parseWorkerResultText(text),
            truncated,
            logs,
            durationMs: Date.now() - startedAt,
            timeoutMs,
            permission: mode,
          });
        })
        .catch((error: any) => {
          finish({
            success: false,
            error: String((error && (error.stack || error.message)) || error),
            logs,
            durationMs: Date.now() - startedAt,
            timeoutMs,
            permission: mode,
          });
        });
    } catch (error: any) {
      finish({
        success: false,
        error: String((error && (error.stack || error.message)) || error),
        logs,
        durationMs: Date.now() - startedAt,
        timeoutMs,
        permission: mode,
      });
    }
  });
};

const runJavaScriptInWorker = (
  aiTools: Record<string, any>,
  code: string,
  requestedTimeoutMs?: unknown,
  options: CallAIToolOptions = {},
) => {
  const timeoutMs = Math.max(
    1000,
    Math.min(MAX_JAVASCRIPT_TIMEOUT_MS, Number(requestedTimeoutMs) || DEFAULT_JAVASCRIPT_TIMEOUT_MS),
  );
  const startedAt = Date.now();

  return new Promise<any>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(getJavaScriptWorkerUrl());
    } catch (error: any) {
      resolve({
        success: false,
        error: `Failed to start JavaScript worker: ${error?.message || String(error)}`,
        logs: [],
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    let settled = false;
    let timer: number | null = null;
    const logs: string[] = [];
    const finish = (result: any) => {
      if (settled) return;
      settled = true;
      if (timer !== null) window.clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    timer = window.setTimeout(() => {
      finish({
        success: false,
        error: `runJavaScript timed out after ${timeoutMs}ms.`,
        logs,
        durationMs: Date.now() - startedAt,
      });
    }, timeoutMs);

    const sendToWorker = (message: any) => {
      try {
        worker.postMessage(message);
      } catch (error: any) {
        finish({
          success: false,
          error: `Failed to serialize a nested tool result: ${error?.message || String(error)}`,
          logs,
          durationMs: Date.now() - startedAt,
        });
      }
    };

    worker.onmessage = (event: MessageEvent) => {
      const message = event.data || {};
      if (message.type === "log") {
        if (logs.length < 200) logs.push(String(message.text || ""));
        return;
      }

      if (message.type === "tool-call") {
        if (message.name === "runJavaScript") {
          sendToWorker({ type: "tool-result", id: message.id, error: "runJavaScript cannot call itself" });
          return;
        }
        Promise.resolve(callAITool(aiTools, String(message.name || ""), message.args || {}, options))
          .then(
            (toolResult) => {
              sendToWorker({ type: "tool-result", id: message.id, result: toolResult });
            },
            (error: any) => {
              sendToWorker({ type: "tool-result", id: message.id, error: error?.message || String(error) });
            },
          )
          .catch((error: any) => {
            sendToWorker({ type: "tool-result", id: message.id, error: error?.message || String(error) });
          });
        return;
      }

      if (message.type === "finished") {
        finish({
          success: true,
          result: parseWorkerResultText(message.resultText),
          truncated: Boolean(message.truncated),
          logs,
          durationMs: Date.now() - startedAt,
          timeoutMs,
        });
        return;
      }

      if (message.type === "error") {
        finish({
          success: false,
          error: String(message.error || "JavaScript execution failed"),
          logs,
          durationMs: Date.now() - startedAt,
          timeoutMs,
        });
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      finish({
        success: false,
        error: event.message || "JavaScript worker error",
        logs,
        durationMs: Date.now() - startedAt,
        timeoutMs,
      });
    };

    worker.postMessage({ type: "run", code: String(code || "") });
  });
};

const enqueueMutation = async <T>(operation: () => Promise<T>) => {
  const previous = mutationQueue;
  let release: () => void = () => {};
  mutationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
};

export const callAITool = async (
  aiTools: Record<string, any> | null,
  functionName: string,
  args: Record<string, any>,
  options: CallAIToolOptions = {},
) => {
  if (functionName.startsWith(MCP_TOOL_PREFIX)) {
    if (options.denyMutations) {
      throw new Error(
        `Tool ${functionName} is disabled in plan mode because MCP tools may modify external state. Finish the read-only investigation, present the plan, and wait for user approval before making changes.`,
      );
    }
    if (!options.allowMcp) {
      throw new Error(`Tool ${functionName} not found (MCP integration is disabled for this request)`);
    }
    const { mcpRegistry } = await import("./mcpClient");
    return await mcpRegistry.callTool(functionName, args);
  }

  if (options.denyMutations && MUTATING_TOOLS.has(functionName)) {
    throw new Error(
      `Tool ${functionName} is disabled in plan mode because it modifies the project. Finish the read-only investigation, present the plan, and wait for user approval before making changes.`,
    );
  }

  // Side-effecting external/config tools are also blocked in plan mode (not project mutation,
  // but they can touch remote systems or user settings and are excluded from the plan tool list).
  if (options.denyMutations && PLAN_BLOCKED_TOOLS.has(functionName)) {
    throw new Error(
      `Tool ${functionName} is disabled in plan mode because it has external side effects. Finish the read-only investigation, present the plan, and wait for user approval before making changes.`,
    );
  }

  // Enforce disabled built-in tools at invocation time (not just at advertisement).
  // MCP tools already returned above; this gate also covers nested sdk.call(...) calls.
  if (typeof options.allowBuiltinTool === "function" && !options.allowBuiltinTool(functionName)) {
    throw new Error(
      `Tool ${functionName} is disabled in 设置 → 工具 and was blocked. Enable it in settings (or re-enable the built-in tools) before using it.`,
    );
  }

  validateToolArguments(functionName, args);

  if (functionName === "runJavaScript") {
    if (!aiTools) throw new Error("Tool runJavaScript not found");
    // Moved out of the Web Worker sandbox: run on the main thread so the generated JS has
    // direct access to page globals (fetch, console, timers) and sdk.vm.
    return runJavaScriptInThread(aiTools, String(args.code || ""), args.timeoutMs, options);
  }

  if (!aiTools || typeof aiTools[functionName] !== "function") {
    throw new Error(`Tool ${functionName} not found`);
  }

  if (MUTATING_TOOLS.has(functionName)) {
    return enqueueMutation(() => {
      aiTools.assertCanMutate?.();
      return dispatchAITool(aiTools, functionName, args);
    });
  }

  return dispatchAITool(aiTools, functionName, args);
};
