import type { MCPServerConfig, SkillConfig } from "./types";
import type { Dispatch, SetStateAction } from "react";

/**
 * Bridge between the AI built-in tools (AITools) and the live React state for
 * MCP servers and skills. index.tsx calls `bind(...)` on every render (cheap)
 * so the tools always see the current config and writes propagate to the UI +
 * localStorage via the useStoredState setters.
 */
type ServerSetter = Dispatch<SetStateAction<MCPServerConfig[]>>;
type SkillSetter = Dispatch<SetStateAction<SkillConfig[]>>;

let binder:
  | {
      mcpServers: MCPServerConfig[];
      setMCPServers: ServerSetter;
      skills: SkillConfig[];
      setSkills: SkillSetter;
    }
  | null = null;

export const toolConfigStore = {
  /** index.tsx calls this every render to keep the bridge fresh. */
  bind(next: {
    mcpServers: MCPServerConfig[];
    setMCPServers: ServerSetter;
    skills: SkillConfig[];
    setSkills: SkillSetter;
  }): void {
    binder = next;
  },

  getMCPServers(): MCPServerConfig[] {
    return binder?.mcpServers ?? [];
  },
  setMCPServers(updater: (prev: MCPServerConfig[]) => MCPServerConfig[]): void {
    binder?.setMCPServers?.(updater);
  },
  getSkills(): SkillConfig[] {
    return binder?.skills ?? [];
  },
  setSkills(updater: (prev: SkillConfig[]) => SkillConfig[]): void {
    binder?.setSkills?.(updater);
  },
};
