import { useEffect, useState, useMemo } from "react";
import useStorageInfo from "hooks/useStorageInfo";
import { Agent, AgentModel, FlattenedAgent } from "../types";
import { PROVIDER_DEFAULT_URLS } from "../constants";

interface ExportedAgentFile {
  version: 1;
  exportedAt: string;
  agent: Agent;
}

const DEFAULT_AGENTS: Agent[] = [
  {
    id: "default-1",
    name: "OpenAI",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    models: [
      {
        id: "default-1-model-1",
        name: "Default GPT-3.5",
        modelId: "gpt-3.5-turbo",
      }
    ],
  },
];

export function useAgents() {
  const [agents, setAgents] = useStorageInfo<Agent[]>("AI_ASSISTANT_AGENTS", DEFAULT_AGENTS);
  const [currentModelId, setCurrentModelId] = useStorageInfo<string>("AI_ASSISTANT_CURRENT_AGENT_ID", "default-1-model-1");
  const [showSettings, setShowSettings] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const flattenedModels = useMemo<FlattenedAgent[]>(() => {
    return agents.flatMap((agent) => {
      // Handle legacy agents without models array
      const models = agent.models || [
        {
          id: `${agent.id}-model`,
          name: (agent as any).displayName || agent.name || "Default Model",
          modelId: (agent as any).modelName || "gpt-3.5-turbo",
          maxTokens: (agent as any).maxTokens,
        },
      ];

      return models.map((model) => ({
        id: model.id,
        agentId: agent.id,
        provider: agent.provider,
        baseUrl: agent.baseUrl,
        apiKey: agent.apiKey,
        modelName: model.modelId,
        displayName: model.name,
        maxTokens: model.maxTokens,
      }));
    });
  }, [agents]);

  const currentAgent = useMemo(() => {
    return flattenedModels.find((model) => model.id === currentModelId) || flattenedModels[0] || null;
  }, [flattenedModels, currentModelId]);

  useEffect(() => {
    if (!agents.length) {
      setAgents(DEFAULT_AGENTS);
      setCurrentModelId(DEFAULT_AGENTS[0].models[0].id);
      return;
    }

    if (!flattenedModels.some((model) => model.id === currentModelId)) {
      setCurrentModelId(flattenedModels[0]?.id || "");
    }
  }, [agents, currentModelId, setAgents, setCurrentModelId, flattenedModels]);

  const handleSaveAgent = (newAgent: Agent) => {
    const nextAgents = editingAgent
      ? agents.map((agent) => (agent.id === editingAgent.id ? newAgent : agent))
      : [...agents, newAgent];

    setAgents(nextAgents);

    // Select the first model of the new agent if we were not editing or if we are selecting it
    if (!currentModelId || editingAgent?.id === newAgent.id) {
      setCurrentModelId(newAgent.models[0]?.id || "");
    }
    setEditingAgent(null);
  };

  const handleDeleteAgent = (id: string) => {
    if (agents.length <= 1) {
      return;
    }

    const nextAgents = agents.filter((agent) => agent.id !== id);
    setAgents(nextAgents);

    const isCurrentModelDeleted = agents.find(a => a.id === id)?.models.some(m => m.id === currentModelId);

    if (isCurrentModelDeleted) {
      const firstAgent = nextAgents[0];
      setCurrentModelId(firstAgent?.models[0]?.id || "");
    }

    if (editingAgent?.id === id) {
      setEditingAgent(null);
    }
  };

  const handleExportAgent = (agentId: string) => {
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) return;

    // Migrate on export just in case
    const exportAgent = { ...agent };
    if (!exportAgent.models) {
      exportAgent.models = [
        {
          id: `${exportAgent.id}-model`,
          name: (exportAgent as any).displayName || exportAgent.name || "Default Model",
          modelId: (exportAgent as any).modelName || "gpt-3.5-turbo",
          maxTokens: (exportAgent as any).maxTokens,
        },
      ];
    }

    const fileData: ExportedAgentFile = {
      version: 1,
      exportedAt: new Date().toISOString(),
      agent: exportAgent,
    };

    const blob = new Blob([JSON.stringify(fileData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-agent-${(exportAgent.name || "agent").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || exportAgent.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportAgents = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    let importedAgent = (parsed.agent && typeof parsed.agent === "object" ? parsed.agent : parsed) as Record<
      string,
      unknown
    >;

    if (!importedAgent || typeof importedAgent.provider !== "string" || typeof importedAgent.baseUrl !== "string" || typeof importedAgent.apiKey !== "string") {
      throw new Error("导入失败：文件内容不是有效的 Agent 配置");
    }

    // Handle legacy import
    if (!importedAgent.models) {
      importedAgent = {
        ...importedAgent,
        name: importedAgent.displayName || importedAgent.name || "Imported Agent",
        models: [
          {
            id: `${Date.now()}-model`,
            name: importedAgent.displayName || "Imported Model",
            modelId: importedAgent.modelName || "gpt-3.5-turbo",
            maxTokens: importedAgent.maxTokens,
          }
        ]
      };
    }

    const nextAgent: Agent = {
      ...importedAgent,
      id: Date.now().toString(),
    } as Agent;

    // Refresh model ids to avoid conflicts
    nextAgent.models = nextAgent.models.map(m => ({ ...m, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }));

    const nextAgents = [...agents, nextAgent];
    setAgents(nextAgents);
    setCurrentModelId(nextAgent.models[0]?.id || "");
    setEditingAgent(nextAgent);
  };

  return {
    agents,
    flattenedModels,
    currentModelId,
    setCurrentModelId,
    currentAgent,
    showSettings,
    setShowSettings,
    editingAgent,
    setEditingAgent,
    handleSaveAgent,
    handleDeleteAgent,
    handleExportAgent,
    handleImportAgents,
  };
}
