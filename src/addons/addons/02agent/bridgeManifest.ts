import { scratchToolSchemas } from "./toolSchemas";
import { SYSTEM_PROMPT } from "./hooks/useChat";

export const BRIDGE_MANIFEST_VERSION = 2;

export const createBridgeManifest = (options: { projectOverview?: unknown; sync?: unknown } = {}) => ({
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
  connectionState: (options.sync as any)?.projectReady
    ? "project-ready"
    : (options.sync as any)?.vmReady
      ? "vm-ready"
      : "addon-connected",
  vmReady: Boolean(options.sync && (options.sync as any).vmReady),
  projectReady: Boolean(options.sync && (options.sync as any).projectReady),
  syncGeneration: (options.sync as any)?.syncGeneration || 0,
  projectId: (options.sync as any)?.projectId,
  lastSyncError: (options.sync as any)?.lastSyncError,
  projectOverview: options.projectOverview || null,
});
