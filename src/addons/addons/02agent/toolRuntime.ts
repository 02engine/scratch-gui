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
};

const MUTATING_TOOLS = new Set([
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
    default:
      return aiTools[functionName]();
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

const runJavaScriptInWorker = (
  aiTools: Record<string, any>,
  code: string,
  requestedTimeoutMs?: unknown,
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
        Promise.resolve(callAITool(aiTools, String(message.name || ""), message.args || {}))
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

export const callAITool = async (aiTools: Record<string, any> | null, functionName: string, args: Record<string, any>) => {
  validateToolArguments(functionName, args);

  if (functionName === "runJavaScript") {
    if (!aiTools) throw new Error("Tool runJavaScript not found");
    return runJavaScriptInWorker(aiTools, String(args.code || ""), args.timeoutMs);
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
