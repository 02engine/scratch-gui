import { useCallback, useEffect, useRef, useState } from "react";
import { AITools } from "../tools";
import { callAITool } from "../toolRuntime";
import { createBridgeManifest } from "../bridgeManifest";
import { BridgeConfig, BridgeStatus } from "../types";

type BridgeMessage = {
  id?: string;
  type?: string;
  method?: string;
  params?: Record<string, any>;
  result?: unknown;
  error?: { message: string; code?: string };
};

const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  enabled: false,
  port: 40202,
  token: "",
};
const MAX_BRIDGE_MESSAGE_CHARS = 2 * 1024 * 1024;

const safeStringifyBridgeMessage = (message: BridgeMessage) => {
  try {
    const text = JSON.stringify(message);
    if (text.length > MAX_BRIDGE_MESSAGE_CHARS) {
      return JSON.stringify({
        id: message.id,
        error: {
          message: `02Agent bridge response exceeded ${MAX_BRIDGE_MESSAGE_CHARS} characters; retry with a narrower tool call.`,
        },
      });
    }
    return text;
  } catch (error) {
    return JSON.stringify({
      id: message.id,
      error: { message: error instanceof Error ? error.message : String(error) },
    });
  }
};

const makeToken = () => {
  const randomValues = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(randomValues);
    return Array.from(randomValues, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const loadBridgeConfig = (): BridgeConfig => {
  try {
    const raw = window.localStorage.getItem("02AGENT_BRIDGE_CONFIG");
    if (!raw) return { ...DEFAULT_BRIDGE_CONFIG, token: makeToken() };
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      port: Number(parsed.port) || DEFAULT_BRIDGE_CONFIG.port,
      token: typeof parsed.token === "string" && parsed.token ? parsed.token : makeToken(),
    };
  } catch {
    return { ...DEFAULT_BRIDGE_CONFIG, token: makeToken() };
  }
};

const saveBridgeConfig = (config: BridgeConfig) => {
  window.localStorage.setItem("02AGENT_BRIDGE_CONFIG", JSON.stringify(config));
};

export const useBridgeClient = (vm: any) => {
  const [config, setConfig] = useState<BridgeConfig>(() => loadBridgeConfig());
  const [status, setStatus] = useState<BridgeStatus>(config.enabled ? "connecting" : "disabled");
  const [lastError, setLastError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(false);
  const aiToolsRef = useRef<AITools | null>(null);
  const requestQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    aiToolsRef.current?.dispose?.();
    aiToolsRef.current = vm ? new AITools(vm) : null;
    return () => {
      aiToolsRef.current?.dispose?.();
      aiToolsRef.current = null;
    };
  }, [vm]);

  const buildManifest = useCallback(() => {
    let projectOverview: unknown = null;
    try {
      projectOverview = aiToolsRef.current?.getProjectOverview?.() || null;
    } catch {
      projectOverview = null;
    }
    return createBridgeManifest({ projectOverview, sync: aiToolsRef.current?.getSyncStatus?.() || null });
  }, []);

  const send = useCallback((message: BridgeMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(safeStringifyBridgeMessage(message));
    return true;
  }, []);

  const handleRequest = useCallback(
    async (message: BridgeMessage, sourceSocket: WebSocket) => {
      if (!message.id) return;

      const sendResponse = (response: BridgeMessage) => {
        if (socketRef.current !== sourceSocket || sourceSocket.readyState !== WebSocket.OPEN) return false;
        sourceSocket.send(safeStringifyBridgeMessage(response));
        return true;
      };

      try {
        if (message.method === "getManifest") {
          const result = await requestQueueRef.current.catch(() => undefined).then(() => buildManifest());
          sendResponse({ id: message.id, result });
          return;
        }

        if (message.method === "callTool") {
          const toolName = String(message.params?.name || "");
          const args = (message.params?.arguments && typeof message.params.arguments === "object"
            ? message.params.arguments
            : {}) as Record<string, any>;
          const requestTools = aiToolsRef.current;
          const requestGeneration = requestTools?.getSyncStatus?.().syncGeneration;
          const operation = requestQueueRef.current
            .catch(() => undefined)
            .then(() => {
              if (socketRef.current !== sourceSocket || sourceSocket.readyState !== WebSocket.OPEN) {
                const error: any = new Error("CLIENT_DISCONNECTED: bridge connection changed before the request could run.");
                error.code = "CLIENT_DISCONNECTED";
                throw error;
              }
              if (requestTools !== aiToolsRef.current || requestGeneration !== requestTools?.getSyncStatus?.().syncGeneration) {
                const error: any = new Error("PROJECT_SWITCHING: queued request belongs to an older project generation.");
                error.code = "PROJECT_SWITCHING";
                throw error;
              }
              return callAITool(requestTools as Record<string, any> | null, toolName, args);
            });
          requestQueueRef.current = operation.catch(() => undefined);
          const result = await operation;
          sendResponse({ id: message.id, result });
          return;
        }

        sendResponse({ id: message.id, error: { message: `Unsupported bridge method: ${message.method || "unknown"}` } });
      } catch (error) {
        sendResponse({ id: message.id, error: { message: error instanceof Error ? error.message : String(error), code: (error as any)?.code } });
      }
    },
    [buildManifest],
  );

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    const previousSocket = socketRef.current;
    if (previousSocket && (previousSocket.readyState === WebSocket.OPEN || previousSocket.readyState === WebSocket.CONNECTING)) previousSocket.close(1000, "Bridge disabled");
    socketRef.current = null;
    setStatus("disabled");
  }, []);

  const connect = useCallback(() => {
    if (!config.enabled) {
      setStatus("disabled");
      return;
    }
    if (!vm) {
      setLastError("Scratch VM is not ready");
      setStatus("error");
      return;
    }

    shouldReconnectRef.current = true;
    setStatus("connecting");
    setLastError("");
    const previousSocket = socketRef.current;
    if (previousSocket && (previousSocket.readyState === WebSocket.OPEN || previousSocket.readyState === WebSocket.CONNECTING)) previousSocket.close(1000, "Reconnecting");

    const socket = new WebSocket(`ws://127.0.0.1:${config.port}/agent?token=${encodeURIComponent(config.token)}`);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      if (socketRef.current !== socket) {
        socket.close(1000, "Superseded connection");
        return;
      }
      setStatus("connected");
      setLastError("");
      send({ type: "register", result: buildManifest() });
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as BridgeMessage;
        void handleRequest(message, socket);
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error));
      }
    });

    socket.addEventListener("close", () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      if (!shouldReconnectRef.current) return;
      setStatus("connecting");
      reconnectTimerRef.current = window.setTimeout(connect, 1500);
    });

    socket.addEventListener("error", () => {
      setLastError(`等待 AI/Skill 启动 127.0.0.1:${config.port} 桥接服务。启动后会自动连接。`);
      setStatus("error");
    });
  }, [buildManifest, config.enabled, config.port, config.token, handleRequest, send, vm]);

  useEffect(() => {
    saveBridgeConfig(config);
    if (config.enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      const socket = socketRef.current;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) socket.close(1000, "Component unmounted");
    };
  }, [config, connect, disconnect]);

  const toggleBridge = useCallback(() => {
    setConfig((previous) => ({
      ...previous,
      enabled: !previous.enabled,
      token: previous.token || makeToken(),
    }));
  }, []);

  const resetToken = useCallback(() => {
    setConfig((previous) => ({ ...previous, token: makeToken() }));
  }, []);

  return {
    bridgeConfig: config,
    bridgeStatus: status,
    bridgeLastError: lastError,
    toggleBridge,
    resetToken,
  };
};
