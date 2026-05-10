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
  error?: { message: string };
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

  useEffect(() => {
    if (vm && !aiToolsRef.current) {
      aiToolsRef.current = new AITools(vm);
    }
  }, [vm]);

  const buildManifest = useCallback(() => {
    let projectOverview: unknown = null;
    try {
      projectOverview = aiToolsRef.current?.getProjectOverview?.() || null;
    } catch {
      projectOverview = null;
    }
    return createBridgeManifest({ projectOverview });
  }, []);

  const send = useCallback((message: BridgeMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(safeStringifyBridgeMessage(message));
    return true;
  }, []);

  const handleRequest = useCallback(
    async (message: BridgeMessage) => {
      if (!message.id) return;

      try {
        if (message.method === "getManifest") {
          send({ id: message.id, result: buildManifest() });
          return;
        }

        if (message.method === "callTool") {
          const toolName = String(message.params?.name || "");
          const args = (message.params?.arguments && typeof message.params.arguments === "object"
            ? message.params.arguments
            : {}) as Record<string, any>;
          const result = await callAITool(aiToolsRef.current as Record<string, any> | null, toolName, args);
          send({ id: message.id, result });
          return;
        }

        send({ id: message.id, error: { message: `Unsupported bridge method: ${message.method || "unknown"}` } });
      } catch (error) {
        send({ id: message.id, error: { message: error instanceof Error ? error.message : String(error) } });
      }
    },
    [buildManifest, send],
  );

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    socketRef.current?.close();
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
    socketRef.current?.close();

    const socket = new WebSocket(`ws://127.0.0.1:${config.port}/agent?token=${encodeURIComponent(config.token)}`);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setStatus("connected");
      setLastError("");
      send({ type: "register", result: buildManifest() });
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as BridgeMessage;
        void handleRequest(message);
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error));
      }
    });

    socket.addEventListener("close", () => {
      if (socketRef.current === socket) socketRef.current = null;
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
      socketRef.current?.close();
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
