import { scratchToolSchemas } from "./toolSchemas";
import { SYSTEM_PROMPT } from "./hooks/useChat";

export const BRIDGE_MANIFEST_VERSION = 1;

export const createBridgeManifest = (options: { projectOverview?: unknown } = {}) => ({
  protocol: "02agent-bridge",
  manifestVersion: BRIDGE_MANIFEST_VERSION,
  agent: {
    id: "02agent",
    name: "02Agent",
    version: "0.1.0",
    runtime: "scratch-gui-addon",
  },
  capabilities: {
    dynamicTools: true,
    toolCalling: true,
    prompts: true,
    projectContext: true,
  },
  security: {
    transport: "ws://127.0.0.1",
    requiresToken: true,
    apiKeysExposed: false,
    dangerousOperationsMayMutateProject: true,
  },
  prompts: {
    system: SYSTEM_PROMPT,
    publicGuidance:
      "Use the exposed 02Agent tools to inspect and edit the currently open Scratch project in 02engine. Start with getProjectOverview. Never assume API keys or model settings are available through the bridge.",
  },
  tools: scratchToolSchemas,
  projectOverview: options.projectOverview || null,
});
