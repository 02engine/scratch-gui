import * as React from "react";
import settings from "../ui/Settings.module.less";
import { Agent, AgentModel } from "../types";
import { PROVIDER_DEFAULT_URLS } from "../constants";

type SettingsSection = "agents" | "appearance" | "about";
type ThemeMode = "dark" | "light";

interface SettingsModalProps {
  agents: Agent[];
  editingAgent: Agent | null;
  onSaveAgent: (agent: Agent) => void;
  onDeleteAgent: (id: string) => void;
  onExportAgent: (id: string) => void;
  onImportAgent: (file: File) => Promise<void>;
  onEditAgent: (agent: Agent | null) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (theme: ThemeMode) => void;
  onClose: () => void;
  isCompact?: boolean;
}

const PROVIDER_LABELS: Record<Agent["provider"], string> = {
  openai: "OpenAI",
  zhipu: "智谱清言",
  deepseek: "DeepSeek",
  anthropic: "Anthropic",
  google: "Google",
  azure: "Azure",
  custom: "自定义 OpenAI",
  custom_anthropic: "自定义 Anthropic",
};

const createDefaultModel = (): AgentModel => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: "My GPT-4o",
  modelId: "gpt-4o",
});

const getDefaultModelForProvider = (provider: Agent["provider"]) => {
  if (provider === "zhipu") return { name: "GLM-4", modelId: "glm-4" };
  if (provider === "deepseek") return { name: "DeepSeek Chat", modelId: "deepseek-chat" };
  if (provider === "anthropic" || provider === "custom_anthropic") {
    return { name: "Claude 3.5 Sonnet", modelId: "claude-3-5-sonnet-latest" };
  }
  return { name: "GPT-4o", modelId: "gpt-4o" };
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  agents,
  editingAgent,
  onSaveAgent,
  onDeleteAgent,
  onExportAgent,
  onImportAgent,
  onEditAgent,
  themeMode,
  onThemeModeChange,
  onClose,
  isCompact,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [activeSection, setActiveSection] = React.useState<SettingsSection>("agents");
  const [formData, setFormData] = React.useState<Partial<Agent>>({ provider: "openai" });
  const [models, setModels] = React.useState<AgentModel[]>([createDefaultModel()]);

  React.useEffect(() => {
    if (editingAgent) {
      setActiveSection("agents");
      setFormData({
        provider: editingAgent.provider,
        name: editingAgent.name || (editingAgent as any).displayName || "",
        baseUrl: editingAgent.baseUrl,
        apiKey: editingAgent.apiKey,
      });
      setModels(
        editingAgent.models || [
          {
            id: `${editingAgent.id}-model`,
            name: (editingAgent as any).displayName || "Default Model",
            modelId: (editingAgent as any).modelName || "gpt-3.5-turbo",
            maxTokens: (editingAgent as any).maxTokens,
          },
        ],
      );
      return;
    }

    setFormData({ provider: "openai", baseUrl: PROVIDER_DEFAULT_URLS.openai });
    setModels([createDefaultModel()]);
  }, [editingAgent]);

  const handleProviderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = event.target.value as Agent["provider"];
    const defaults = getDefaultModelForProvider(provider);
    const baseUrl = PROVIDER_DEFAULT_URLS[provider] || "";
    setFormData((previous) => ({ ...previous, provider, baseUrl }));

    if (models.length === 1) {
      setModels([{ ...models[0], ...defaults }]);
    }
  };

  const updateModel = (id: string, field: keyof AgentModel, value: string | number | undefined) => {
    setModels((previous) => previous.map((model) => (model.id === id ? { ...model, [field]: value } : model)));
  };

  const removeModel = (id: string) => {
    setModels((previous) => previous.filter((model) => model.id !== id));
  };

  const addModel = () => {
    setModels((previous) => [...previous, createDefaultModel()]);
  };

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const provider = formData.provider || "openai";
    const validModels = models.filter((model) => model.name.trim() && model.modelId.trim());

    if (validModels.length === 0) {
      window.alert("请至少添加一个有效模型");
      return;
    }

    onSaveAgent({
      id: editingAgent?.id || `${Date.now()}`,
      provider,
      baseUrl: formData.baseUrl?.trim() || PROVIDER_DEFAULT_URLS[provider] || "",
      apiKey: formData.apiKey || "",
      name: formData.name?.trim() || PROVIDER_LABELS[provider] || "Custom Agent",
      models: validModels,
    });
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await onImportAgent(file);
      setActiveSection("agents");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "导入失败");
    } finally {
      event.target.value = "";
    }
  };

  const sectionTitle = activeSection === "agents" ? "模型与 Agent" : activeSection === "appearance" ? "外观" : "关于";
  const sectionDescription =
    activeSection === "agents"
      ? "管理供应商、API Key、Base URL 和可选模型。"
      : activeSection === "appearance"
        ? "切换插件界面的主题外观。"
        : "查看当前 UI 架构和维护说明。";

  return (
    <div className={settings.overlay} onClick={onClose}>
      <div
        className={`${settings.modal} ${isCompact ? settings.modalCompact : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <aside className={settings.settingsNav}>
          <div className={settings.settingsTitle}>
            <h3>设置</h3>
            <p>02Agent 配置中心</p>
          </div>
          <nav className={settings.navList} aria-label="设置分类">
            {[
              ["agents", "模型", "◈"],
              ["appearance", "外观", "◐"],
              ["about", "关于", "i"],
            ].map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                className={`${settings.navItem} ${activeSection === id ? settings.navItemActive : ""}`}
                onClick={() => setActiveSection(id as SettingsSection)}
              >
                <span className={settings.navIcon}>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className={settings.navFooter}>
            <button type="button" className={settings.button} onClick={() => fileInputRef.current?.click()}>
              导入 Agent
            </button>
            <button type="button" className={settings.ghostButton} onClick={onClose}>
              关闭
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className={settings.fileInput}
            onChange={(event) => void handleImport(event)}
          />
        </aside>

        <main className={settings.settingsMain}>
          <header className={settings.settingsHeader}>
            <div>
              <h4>{sectionTitle}</h4>
              <p>{sectionDescription}</p>
            </div>
          </header>

          <div className={settings.settingsContent}>
            {activeSection === "agents" ? (
              <div className={settings.sectionStack}>
                <section className={settings.card}>
                  <div className={settings.cardHeader}>
                    <div>
                      <h5>{editingAgent ? "编辑 Agent" : "添加 Agent"}</h5>
                      <p>一个 Agent 可以包含多个模型，顶部模型选择栏会展开显示这些模型。</p>
                    </div>
                  </div>
                  <form className={settings.cardBody} onSubmit={handleSave}>
                    <div className={settings.formGrid}>
                      <label className={settings.field}>
                        <span className={settings.label}>名称</span>
                        <input
                          className={settings.input}
                          value={formData.name || ""}
                          onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                          placeholder="例如：我的 OpenAI"
                          required
                        />
                      </label>
                      <label className={settings.field}>
                        <span className={settings.label}>供应商</span>
                        <select
                          className={settings.select}
                          value={formData.provider || "openai"}
                          onChange={handleProviderChange}
                        >
                          <option value="openai">OpenAI</option>
                          <option value="zhipu">智谱清言</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="deepseek">DeepSeek</option>
                          <option value="custom">自定义 OpenAI 兼容接口</option>
                          <option value="custom_anthropic">自定义 Anthropic 兼容接口</option>
                        </select>
                      </label>
                      <label className={`${settings.field} ${settings.fieldFull}`}>
                        <span className={settings.label}>Base URL</span>
                        <input
                          className={settings.input}
                          value={formData.baseUrl || ""}
                          onChange={(event) => setFormData({ ...formData, baseUrl: event.target.value })}
                          placeholder="留空使用供应商默认地址"
                        />
                      </label>
                      <label className={`${settings.field} ${settings.fieldFull}`}>
                        <span className={settings.label}>API Key</span>
                        <input
                          className={settings.input}
                          type="password"
                          value={formData.apiKey || ""}
                          onChange={(event) => setFormData({ ...formData, apiKey: event.target.value })}
                          placeholder="sk-..."
                        />
                      </label>
                    </div>

                    <div className={settings.cardHeader}>
                      <div>
                        <h5>模型列表</h5>
                        <p>显示名称用于界面展示，模型 ID 会直接传给对应供应商。</p>
                      </div>
                      <button type="button" className={settings.button} onClick={addModel}>
                        添加模型
                      </button>
                    </div>
                    <div className={settings.modelsTable}>
                      {models.map((model) => (
                        <div key={model.id} className={settings.modelRow}>
                          <input
                            className={settings.input}
                            value={model.name}
                            onChange={(event) => updateModel(model.id, "name", event.target.value)}
                            placeholder="显示名称"
                            required
                          />
                          <input
                            className={settings.input}
                            value={model.modelId}
                            onChange={(event) => updateModel(model.id, "modelId", event.target.value)}
                            placeholder="模型 ID"
                            required
                          />
                          <input
                            className={settings.input}
                            type="number"
                            min={2048}
                            max={1000000}
                            value={model.maxTokens || ""}
                            onChange={(event) =>
                              updateModel(
                                model.id,
                                "maxTokens",
                                event.target.value ? Number(event.target.value) : undefined,
                              )
                            }
                            placeholder="Max Tokens"
                          />
                          <button
                            type="button"
                            className={settings.dangerButton}
                            onClick={() => removeModel(model.id)}
                            disabled={models.length <= 1}
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className={`${settings.toolbar} ${settings.formActions}`}>
                      <div className={settings.hint}>配置只保存在本地插件存储中。</div>
                      <div className={settings.actions}>
                        {editingAgent ? (
                          <button type="button" className={settings.button} onClick={() => onEditAgent(null)}>
                            取消编辑
                          </button>
                        ) : null}
                        <button type="submit" className={settings.primaryButton}>
                          {editingAgent ? "保存修改" : "添加 Agent"}
                        </button>
                      </div>
                    </div>
                  </form>
                </section>

                <section className={settings.card}>
                  <div className={settings.cardHeader}>
                    <div>
                      <h5>已配置 Agent</h5>
                      <p>至少保留一个 Agent。删除当前模型后会自动切换到可用模型。</p>
                    </div>
                  </div>
                  <div className={`${settings.cardBody} ${settings.agentList}`}>
                    {agents.map((agent) => (
                      <article key={agent.id} className={settings.agentItem}>
                        <div className={settings.agentItemHeader}>
                          <div>
                            <div className={settings.agentName}>{agent.name || (agent as any).displayName}</div>
                            <div className={settings.agentProvider}>
                              {PROVIDER_LABELS[agent.provider] || agent.provider}
                            </div>
                          </div>
                          <div className={settings.actions}>
                            <button type="button" className={settings.button} onClick={() => onEditAgent(agent)}>
                              编辑
                            </button>
                            <button type="button" className={settings.button} onClick={() => onExportAgent(agent.id)}>
                              导出
                            </button>
                            <button
                              type="button"
                              className={settings.dangerButton}
                              onClick={() => onDeleteAgent(agent.id)}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                        <div className={settings.modelList}>
                          {(agent.models || []).map((model) => (
                            <div key={model.id} className={settings.modelItem}>
                              <strong>{model.name}</strong>
                              <span>
                                {model.modelId}
                                {model.maxTokens ? ` · ${model.maxTokens}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {activeSection === "appearance" ? (
              <section className={settings.card}>
                <div className={settings.cardHeader}>
                  <div>
                    <h5>主题模式</h5>
                    <p>使用 CSS variables 驱动，不再在组件里硬编码颜色。</p>
                  </div>
                </div>
                <div className={settings.cardBody}>
                  <div className={settings.themeChoices}>
                    <button
                      type="button"
                      className={`${settings.themeChoice} ${themeMode === "dark" ? settings.themeChoiceActive : ""}`}
                      onClick={() => onThemeModeChange("dark")}
                    >
                      <strong>深色</strong>
                      <span>接近 Codex 工作台的低亮度界面。</span>
                    </button>
                    <button
                      type="button"
                      className={`${settings.themeChoice} ${themeMode === "light" ? settings.themeChoiceActive : ""}`}
                      onClick={() => onThemeModeChange("light")}
                    >
                      <strong>浅色</strong>
                      <span>适合明亮环境，保留同一套布局密度。</span>
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {activeSection === "about" ? (
              <section className={settings.card}>
                <div className={settings.cardHeader}>
                  <div>
                    <h5>UI 架构</h5>
                    <p>核心界面已经拆分为主题、Shell、Chat、Composer、ToolCalls、Settings 模块。</p>
                  </div>
                </div>
                <div className={settings.cardBody}>
                  <p className={settings.hint}>
                    旧的全局样式仍用于少量附件预览和历史兼容组件；新的核心界面使用 CSS Modules + CSS variables，
                    之后继续迭代时可以按模块替换旧样式，而不是继续堆进一个巨大的样式文件。
                  </p>
                </div>
              </section>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
};
