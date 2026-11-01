import * as React from "react";
import settings from "../ui/Settings.module.less";
import { MemorySection } from "./MemorySection";
import { SubagentsSection } from "./SubagentsSection";
import { Agent, AgentModel, MCPServerConfig, MCPToolInfo, SkillConfig, PromptConfig , SubagentDef} from "../types";
import { PROVIDER_DEFAULT_CONTEXT_WINDOWS, PROVIDER_DEFAULT_URLS } from "../constants";
import { scratchToolSchemas } from "../toolSchemas";
import { MUTATING_TOOLS } from "../toolRuntime";
import { mcpRegistry } from "../mcpClient";
import {
    JsPermissionMode,
    JS_PERMISSION_MODES,
    JS_PERMISSION_LABELS,
    JS_PERMISSION_DESCRIPTIONS,
} from "../jsPermission";


type SettingsSection = "agents" | "mcp" | "tools" | "skills" | "memory" | "subagents" | "prompt" | "appearance" | "debug" | "about";

/** Top-level groups shown in the settings rail; each group exposes its sections as sub-tabs. */
const SECTION_GROUPS: Array<{ id: string; label: string; sublabel?: string; sections: SettingsSection[] }> = [
    { id: "defaults", label: "默认设置", sublabel: "模型与外部服务", sections: ["agents", "mcp"] },
    { id: "personalize", label: "工具与个性化", sublabel: "AI 行为的自定义项", sections: ["tools", "skills", "memory", "subagents", "prompt"] },
    { id: "interface", label: "界面与开发模式", sublabel: "主题与调试", sections: ["appearance", "debug"] },
    { id: "about", label: "关于", sections: ["about"] },
];

const SUBTAB_LABELS: Record<SettingsSection, string> = {
    agents: "模型",
    mcp: "MCP",
    tools: "工具",
    skills: "技能",
    memory: "记忆",
    subagents: "子智能体",
    prompt: "提示词",
    appearance: "主题",
    debug: "调试与性能",
    about: "关于",
};
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
    debugMode: boolean;
    onToggleDebugMode: (next: boolean) => void;
    onOpenBenchmark: () => void;
    mcpServers: MCPServerConfig[];
    onSaveMCPServer: (server: MCPServerConfig) => void;
    onDeleteMCPServer: (id: string) => void;
    disabledTools: string[];
    onSetDisabledTools: (next: string[]) => void;
    jsPermission: JsPermissionMode;
    onSetJsPermission: (mode: JsPermissionMode) => void;
    skills: SkillConfig[];
    subagents: SubagentDef[];
    onSaveSubagents: (list: SubagentDef[]) => void;
    onSaveSkill: (skill: SkillConfig) => void;
    onDeleteSkill: (id: string) => void;
    promptConfig: PromptConfig;
    onSavePromptConfig: (config: PromptConfig) => void;
    /** The fully-assembled system prompt (base + user override + skills) actually sent to the model. */
    systemPrompt: string;
    onClose: () => void;
    isCompact?: boolean;
}

const CONTEXT_WINDOW_OPTIONS = [
    { value: 32000, label: "32K" },
    { value: 64000, label: "64K" },
    { value: 128000, label: "128K" },
    { value: 200000, label: "200K" },
    { value: 256000, label: "256K" },
    { value: 512000, label: "512K" },
    { value: 1000000, label: "1M" },
];

const isPresetContextWindow = (value?: number) =>
    value !== undefined && CONTEXT_WINDOW_OPTIONS.some((option) => option.value === value);

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
    contextWindow: PROVIDER_DEFAULT_CONTEXT_WINDOWS.openai,
});

const createDefaultMcpServer = (): MCPServerConfig => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    url: "",
    transport: "http",
    apiKey: "",
    customHeaders: "",
    enabled: true,
    disabledTools: [],
});

const createDefaultSkill = (): SkillConfig => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    description: "",
    content: "",
    enabled: true,
});

const getDefaultModelForProvider = (provider: Agent["provider"]) => {
    if (provider === "zhipu") return { name: "GLM-4", modelId: "glm-4", contextWindow: PROVIDER_DEFAULT_CONTEXT_WINDOWS.zhipu };
    if (provider === "deepseek") return { name: "DeepSeek Chat", modelId: "deepseek-chat", contextWindow: PROVIDER_DEFAULT_CONTEXT_WINDOWS.deepseek };
    if (provider === "anthropic" || provider === "custom_anthropic") {
        return {
            name: "Claude 3.5 Sonnet",
            modelId: "claude-3-5-sonnet-latest",
            contextWindow: PROVIDER_DEFAULT_CONTEXT_WINDOWS[provider],
        };
    }
    const contextWindow = PROVIDER_DEFAULT_CONTEXT_WINDOWS[provider];
    return {
        name: "GPT-4o",
        modelId: "gpt-4o",
        ...(contextWindow ? { contextWindow } : {}),
    };
};

interface FetchedModel {
    id: string;
    name: string;
}

const normalizeModelsUrl = (baseUrl: string) => {
    const normalized = baseUrl.trim().replace(/\/$/, "");
    if (!normalized) return "";
    if (normalized.endsWith("/models")) return normalized;
    if (normalized.endsWith("/chat/completions")) return normalized.slice(0, -"/chat/completions".length) + "/models";
    return `${normalized}/models`;
};

const getModelDisplayName = (model: Record<string, unknown>) => {
    const value = model.display_name || model.displayName || model.name || model.id;
    return typeof value === "string" ? value : "";
};

const parseModelResponse = (payload: unknown): FetchedModel[] => {
    const candidate = payload as Record<string, unknown>;
    const rawModels = Array.isArray(candidate?.data)
        ? candidate.data
        : Array.isArray(candidate?.models)
            ? candidate.models
            : Array.isArray(payload)
                ? payload
                : [];

    return rawModels
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const model = item as Record<string, unknown>;
            const idValue = model.id || model.name;
            if (typeof idValue !== "string" || !idValue.trim()) return null;
            return {
                id: idValue,
                name: getModelDisplayName(model) || idValue,
            };
        })
        .filter((item): item is FetchedModel => Boolean(item));
};

const fetchProviderModels = async (provider: Agent["provider"], baseUrl: string, apiKey: string, signal?: AbortSignal) => {
    const url = normalizeModelsUrl(baseUrl || PROVIDER_DEFAULT_URLS[provider] || "");
    if (!url) throw new Error("请先填写 Base URL");
    if (!apiKey.trim()) throw new Error("请先填写 API Key");

    const headers: Record<string, string> = {};
    if (provider === "anthropic" || provider === "custom_anthropic") {
        headers["x-api-key"] = apiKey.trim();
        headers["anthropic-version"] = "2023-06-01";
        headers["anthropic-dangerous-direct-browser-access"] = "true";
    } else {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const response = await fetch(url, { headers, signal });
    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`获取模型列表失败：${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`);
    }

    const models = parseModelResponse(await response.json());
    if (models.length === 0) throw new Error("接口没有返回可用模型");
    return models;
};

interface MCPSectionProps {
    servers: MCPServerConfig[];
    onSave: (server: MCPServerConfig) => void;
    onDelete: (id: string) => void;
}

const MCPSection: React.FC<MCPSectionProps> = ({ servers, onSave, onDelete }) => {
    const [editing, setEditing] = React.useState<Partial<MCPServerConfig> | null>(null);
    const [statusById, setStatusById] = React.useState<Record<string, string>>({});
    const [testing, setTesting] = React.useState<string | null>(null);
    const [expandedId, setExpandedId] = React.useState<string | null>(null);
    const [testTools, setTestTools] = React.useState<MCPToolInfo[] | null>(null);

    const runTest = async (server: MCPServerConfig, list?: Partial<MCPServerConfig>) => {
        const candidate: MCPServerConfig = { ...server, ...(list as object) } as MCPServerConfig;
        setTestTools(null);
        if (!candidate.url?.trim()) {
            setStatusById((prev) => ({ ...prev, [candidate.id]: "请先填写服务器 URL" }));
            return;
        }
        setTesting(candidate.id);
        try {
            const result = await mcpRegistry.testServer(candidate);
            if (result.lastError) {
                setStatusById((prev) => ({ ...prev, [candidate.id]: `连接失败：${result.lastError}` }));
            } else {
                onSave(result);
                const count = result.cachedTools?.length ?? 0;
                setTestTools(result.cachedTools || []);
                setStatusById((prev) => ({ ...prev, [candidate.id]: `连接成功，发现 ${count} 个工具` }));
            }
        } catch (error: any) {
            setStatusById((prev) => ({
                ...prev,
                [candidate.id]: `连接失败：${error?.message || String(error)}`,
            }));
        } finally {
            setTesting(null);
        }
    };

    const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editing) return;
        const url = (editing.url || "").trim();
        const name = (editing.name || "").trim();
        if (!name) {
            window.alert("请填写服务器名称");
            return;
        }
        if (!/^https?:\/\//i.test(url)) {
            window.alert("URL 需要以 http:// 或 https:// 开头");
            return;
        }
        if (editing.customHeaders?.trim()) {
            try {
                const parsed = JSON.parse(editing.customHeaders);
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("必须是 JSON 对象");
            } catch (error: any) {
                window.alert(`自定义请求头不是合法的 JSON 对象：${error?.message || error}`);
                return;
            }
        }
        onSave({
            ...createDefaultMcpServer(),
            ...editing,
            id: editing.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name,
            url,
            transport: editing.transport === "sse" ? "sse" : "http",
            enabled: editing.enabled !== false,
            disabledTools: editing.disabledTools || [],
        });
        setEditing(null);
        setTestTools(null);
    };

    const toggleServerTool = (server: MCPServerConfig, toolName: string, enabled: boolean) => {
        const next = new Set(server.disabledTools || []);
        if (enabled) next.delete(toolName);
        else next.add(toolName);
        onSave({ ...server, disabledTools: Array.from(next) });
    };

    return (
        <div className={settings.sectionStack}>
            <section className={settings.card}>
                <div className={settings.cardHeader}>
                    <div>
                        <h5>MCP 服务器</h5>
                        <p>通过 MCP（Model Context Protocol）为 AI 接入外部工具。支持 Streamable HTTP 与 SSE，请求经内置服务器中继出站，无需额外代理配置。</p>
                    </div>
                    <button
                        type="button"
                        className={settings.button}
                        onClick={() => setEditing(createDefaultMcpServer())}
                    >
                        添加服务器
                    </button>
                </div>
                <div className={`${settings.cardBody} ${settings.agentList}`}>
                    {servers.length === 0 ? (
                        <div className={settings.hint}>还没有配置 MCP 服务器。点击“添加服务器”开始。</div>
                    ) : null}
                    {servers.map((server) => (
                        <article key={server.id} className={settings.agentItem}>
                            <div className={settings.agentItemHeader}>
                                <div>
                                    <div className={settings.agentName}>{server.name || "(未命名)"}</div>
                                    <div className={settings.agentProvider}>
                                        {server.transport === "sse" ? "SSE" : "Streamable HTTP"} · {server.url}
                                    </div>
                                </div>
                                <div className={settings.actions}>
                                    <label className={settings.checkLabel} title={server.enabled ? "已启用" : "已禁用"}>
                                        <input
                                            type="checkbox"
                                            checked={server.enabled}
                                            onChange={(event) => onSave({ ...server, enabled: event.target.checked })}
                                        />
                                        启用
                                    </label>
                                    <button
                                        type="button"
                                        className={settings.button}
                                        disabled={testing === server.id}
                                        onClick={() => void runTest(server)}
                                    >
                                        {testing === server.id ? "连接中..." : "测试连接"}
                                    </button>
                                    <button
                                        type="button"
                                        className={settings.button}
                                        onClick={() => setEditing({ ...server })}
                                    >
                                        编辑
                                    </button>
                                    <button
                                        type="button"
                                        className={settings.dangerButton}
                                        onClick={() => {
                                            if (window.confirm(`确定删除 MCP 服务器“${server.name}”吗？`)) onDelete(server.id);
                                        }}
                                    >
                                        删除
                                    </button>
                                </div>
                            </div>
                            <div className={settings.hint}>
                                {statusById[server.id] ||
                                    (server.lastConnectedAt
                                        ? `上次连接：${new Date(server.lastConnectedAt).toLocaleString()} · 工具 ${server.cachedTools?.length ?? 0} 个`
                                        : "尚未测试连接")}
                                {server.lastError ? ` · 错误：${server.lastError}` : ""}
                            </div>
                            {(server.cachedTools?.length ?? 0) > 0 ? (
                                <div className={settings.toolGroup}>
                                    <button
                                        type="button"
                                        className={settings.ghostButton}
                                        onClick={() => setExpandedId(expandedId === server.id ? null : server.id)}
                                    >
                                        {expandedId === server.id ? "收起工具列表" : `展开工具列表（${server.cachedTools?.length}）`}
                                    </button>
                                    {expandedId === server.id ? (
                                        <div className={settings.toolList}>
                                            {server.cachedTools!.map((tool) => {
                                                const toolEnabled = !(server.disabledTools || []).includes(tool.name);
                                                return (
                                                    <label key={tool.name} className={settings.checkRow} title={tool.description || tool.name}>
                                                        <input
                                                            type="checkbox"
                                                            checked={toolEnabled}
                                                            onChange={(event) => toggleServerTool(server, tool.name, event.target.checked)}
                                                        />
                                                        <code>{tool.name}</code>
                                                        <span className={settings.toolDesc}>{tool.description || ""}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </article>
                    ))}
                </div>
            </section>

            {editing ? (
                <section className={settings.card}>
                    <div className={settings.cardHeader}>
                        <div>
                            <h5>{servers.some((server) => server.id === editing.id) ? "编辑服务器" : "添加服务器"}</h5>
                            <p>保存后在列表中“测试连接”以发现该服务器提供的工具。</p>
                        </div>
                    </div>
                    <form className={settings.cardBody} onSubmit={handleSave}>
                        <div className={settings.formGrid}>
                            <label className={settings.field}>
                                <span className={settings.label}>名称</span>
                                <input
                                    className={settings.input}
                                    value={editing.name || ""}
                                    onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                                    placeholder="例如：filesystem"
                                    required
                                />
                            </label>
                            <label className={settings.field}>
                                <span className={settings.label}>传输方式</span>
                                <select
                                    className={settings.select}
                                    value={editing.transport || "http"}
                                    onChange={(event) =>
                                        setEditing({ ...editing, transport: event.target.value as MCPServerConfig["transport"] })
                                    }
                                >
                                    <option value="http">Streamable HTTP（推荐）</option>
                                    <option value="sse">HTTP + SSE（旧版）</option>
                                </select>
                            </label>
                            <label className={`${settings.field} ${settings.fieldFull}`}>
                                <span className={settings.label}>服务器 URL</span>
                                <input
                                    className={settings.input}
                                    value={editing.url || ""}
                                    onChange={(event) => setEditing({ ...editing, url: event.target.value })}
                                    placeholder="https://example.com/mcp"
                                    required
                                />
                            </label>
                            <label className={`${settings.field} ${settings.fieldFull}`}>
                                <span className={settings.label}>API Key（可选，作为 Authorization: Bearer）</span>
                                <input
                                    className={settings.input}
                                    type="password"
                                    value={editing.apiKey || ""}
                                    onChange={(event) => setEditing({ ...editing, apiKey: event.target.value })}
                                    placeholder="留空表示不发送 Bearer Token"
                                />
                            </label>
                            <label className={`${settings.field} ${settings.fieldFull}`}>
                                <span className={settings.label}>自定义请求头（可选，JSON 对象）</span>
                                <textarea
                                    className={`${settings.input} ${settings.textarea}`}
                                    rows={3}
                                    value={editing.customHeaders || ""}
                                    onChange={(event) => setEditing({ ...editing, customHeaders: event.target.value })}
                                    placeholder={'{"X-Tenant": "a"}'}
                                    spellCheck={false}
                                />
                            </label>
                        </div>
                        <div className={`${settings.toolbar} ${settings.formActions}`}>
                            <div className={settings.actions}>
                                <button type="button" className={settings.button} onClick={() => setEditing(null)}>
                                    取消
                                </button>
                                <button
                                    type="button"
                                    className={settings.button}
                                    disabled={testing === editing.id}
                                    onClick={() => {
                                        if (!editing.url?.trim() || !editing.name?.trim()) {
                                            window.alert("请先填写名称和 URL");
                                            return;
                                        }
                                        void runTest(
                                            {
                                                ...(editing as MCPServerConfig),
                                            },
                                            editing,
                                        );
                                    }}
                                >
                                    {testing === editing.id ? "连接中..." : "测试连接"}
                                </button>
                                <button type="submit" className={settings.primaryButton}>
                                    保存
                                </button>
                            </div>
                        </div>
                        {testTools !== null ? <div className={settings.hint}>发现 {testTools.length} 个工具</div> : null}
                    </form>
                </section>
            ) : null}
        </div>
    );
};

interface ToolsSectionProps {
    disabledTools: string[];
    onSetDisabledTools: (next: string[]) => void;
    jsPermission: JsPermissionMode;
    onSetJsPermission: (mode: JsPermissionMode) => void;
}

/** Built-in tools grouped for display in settings (读取 / 修改 / AI 协作 / 系统与外部). */
const classifyTool = (name: string): "read" | "mutate" | "assist" | "system" => {
    if (name === "runJavaScript") return "system";
    if (MUTATING_TOOLS.has(name)) return "mutate";
    if (["readFile","listFiles","searchFiles","getProjectOverview","readVariable","readListSlice","searchList","getDataSummary","getDiagnostics","listCostumes","searchBlocks","getBlocksHelp","searchExtensions","getAllExtensions","getExtensionBlocks","getScratchGuide"].includes(name)) return "read";
    if (["askUser","updateTodoList","listMemoryBlocks","getMemoryBlock","setMemoryBlock","replaceMemoryBlockText","deleteMemoryBlock","runSubAgent","checkSubagentResults","listSkills","readSkill","createSkill","startStageRecording","stopStageRecording"].includes(name)) return "assist";
    return "system";
};

const buildToolGroups = () => {
    const buckets: Record<string, Set<string>> = { read: new Set(), mutate: new Set(), assist: new Set(), system: new Set() };
    scratchToolSchemas.forEach((tool) => buckets[classifyTool(tool.function.name)].add(tool.function.name));
    return [
        { key: "read", label: "编辑器读取（只读）", names: buckets.read },
        { key: "mutate", label: "编辑器修改（写入项目）", names: buckets.mutate },
        { key: "assist", label: "AI 协作与记忆", names: buckets.assist },
        { key: "system", label: "系统与外部（网络 / 代码执行 / 技能管理）", names: buckets.system },
    ];
};

const ToolsSection: React.FC<ToolsSectionProps> = ({ disabledTools, onSetDisabledTools, jsPermission, onSetJsPermission }) => {
    const disabledSet = React.useMemo(() => new Set(disabledTools), [disabledTools]);
    const tools = scratchToolSchemas;
    const toolGroups = React.useMemo(() => buildToolGroups(), []);

    const toggleTool = (name: string, enabled: boolean) => {
        const next = new Set(disabledSet);
        if (enabled) next.delete(name);
        else next.add(name);
        onSetDisabledTools(Array.from(next));
    };

    const enabledCount = tools.filter((tool) => !disabledSet.has(tool.function.name)).length;

    return (
        <div className={settings.sectionStack}>
            <section className={settings.card}>
                <div className={settings.cardHeader}>
                    <div>
                        <h5>JavaScript 执行权限</h5>
                        <p>runJavaScript 工具在主线程运行模型写的代码，可访问页面全局（含 localStorage 中的密钥）。选择它被允许做什么。</p>
                    </div>
                </div>
                <div className={settings.cardBody}>
                    <div className={settings.permissionChoices}>
                        {JS_PERMISSION_MODES.map((mode) => (
                            <label
                                key={mode}
                                className={`${settings.permissionChoice}${jsPermission === mode ? ` ${settings.permissionChoiceActive}` : ""}`}
                            >
                                <input
                                    type="radio"
                                    name="js-permission"
                                    checked={jsPermission === mode}
                                    onChange={() => onSetJsPermission(mode)}
                                />
                                <span className={settings.permissionChoiceBody}>
                                    <span className={settings.permissionChoiceTitle}>{JS_PERMISSION_LABELS[mode]}</span>
                                    <span className={settings.permissionChoiceDesc}>{JS_PERMISSION_DESCRIPTIONS[mode]}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            </section>
            <section className={settings.card}>
                <div className={settings.cardHeader}>
                    <div>
                        <h5>内置工具</h5>
                        <p>控制随每次请求发送给模型的内置工具。已启用 {enabledCount} / {tools.length} 个。计划模式下写入类工具仍会自动禁用。</p>
                    </div>
                    <div className={settings.actions}>
                        <button
                            type="button"
                            className={settings.button}
                            onClick={() => onSetDisabledTools([])}
                            disabled={enabledCount === tools.length}
                        >
                            全部启用
                        </button>
                        <button
                            type="button"
                            className={settings.button}
                            onClick={() => onSetDisabledTools(tools.map((tool) => tool.function.name))}
                            disabled={enabledCount === 0}
                        >
                            全部禁用
                        </button>
                    </div>
                </div>
                <div className={`${settings.cardBody} ${settings.toolList}`}>
                    {toolGroups.map((group) => {
                        const rows = tools.filter((tool) => group.names.has(tool.function.name));
                        if (rows.length === 0) return null;
                        return (
                            <div key={group.key} className={settings.toolGroup}>
                                <div className={settings.toolGroupLabel}>
                                    {group.label} · {rows.length}
                                </div>
                                {rows.map((tool) => {
                                    const name = tool.function.name;
                                    const checked = !disabledSet.has(name);
                                    return (
                                        <label key={name} className={settings.checkRow} title={tool.function.description}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(event) => toggleTool(name, event.target.checked)}
                                            />
                                            <code>{name}</code>
                                            {MUTATING_TOOLS.has(name) ? <span className={settings.toolBadge}>写入</span> : null}
                                            <span className={settings.toolDesc}>{tool.function.description}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
};

interface SkillsSectionProps {
    skills: SkillConfig[];
    onSave: (skill: SkillConfig) => void;
    onDelete: (id: string) => void;
}

const SkillsSection: React.FC<SkillsSectionProps> = ({ skills, onSave, onDelete }) => {
    const [editing, setEditing] = React.useState<Partial<SkillConfig> | null>(null);
    const importInputRef = React.useRef<HTMLInputElement | null>(null);

    const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editing) return;
        const name = (editing.name || "").trim();
        const content = (editing.content || "").trim();
        if (!name) {
            window.alert("请填写技能名称");
            return;
        }
        if (!content) {
            window.alert("请填写技能内容");
            return;
        }
        onSave({
            id: editing.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name,
            description: (editing.description || "").trim(),
            content,
            enabled: editing.enabled !== false,
        });
        setEditing(null);
    };

    const handleExport = () => {
        const blob = new Blob([JSON.stringify(skills, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "02agent-skills.json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            const list = Array.isArray(parsed) ? parsed : parsed?.skills;
            if (!Array.isArray(list)) throw new Error("文件不是技能数组或 {skills:[...]} 结构");
            for (const item of list) {
                if (!item || typeof item.name !== "string" || typeof item.content !== "string") continue;
                onSave({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    name: item.name.trim(),
                    description: typeof item.description === "string" ? item.description : "",
                    content: item.content,
                    enabled: item.enabled !== false,
                });
            }
        } catch (error) {
            window.alert(`导入失败：${error instanceof Error ? error.message : String(error)}`);
        } finally {
            event.target.value = "";
        }
    };

    return (
        <div className={settings.sectionStack}>
            <section className={settings.card}>
                <div className={settings.cardHeader}>
                    <div>
                        <h5>已配置技能</h5>
                        <p>启用的技能会以 Markdown 形式注入到系统提示词中，相当于自定义指令/工作规范。</p>
                    </div>
                    <div className={settings.actions}>
                        <button type="button" className={settings.button} onClick={() => setEditing(createDefaultSkill())}>
                            添加技能
                        </button>
                        <button type="button" className={settings.button} onClick={handleExport} disabled={skills.length === 0}>
                            导出
                        </button>
                        <button type="button" className={settings.button} onClick={() => importInputRef.current?.click()}>
                            导入
                        </button>
                    </div>
                </div>
                <div className={`${settings.cardBody} ${settings.agentList}`}>
                    {skills.length === 0 ? <div className={settings.hint}>还没有配置技能。</div> : null}
                    {skills.map((skill) => (
                        <article key={skill.id} className={settings.agentItem}>
                            <div className={settings.agentItemHeader}>
                                <div>
                                    <div className={settings.agentName}>{skill.name}</div>
                                    <div className={settings.agentProvider}>{skill.description || skill.content.slice(0, 80)}</div>
                                </div>
                                <div className={settings.actions}>
                                    <label className={settings.checkLabel}>
                                        <input
                                            type="checkbox"
                                            checked={skill.enabled}
                                            onChange={(event) => onSave({ ...skill, enabled: event.target.checked })}
                                        />
                                        启用
                                    </label>
                                    <button type="button" className={settings.button} onClick={() => setEditing({ ...skill })}>
                                        编辑
                                    </button>
                                    <button
                                        type="button"
                                        className={settings.dangerButton}
                                        onClick={() => {
                                            if (window.confirm(`确定删除技能“${skill.name}”吗？`)) onDelete(skill.id);
                                        }}
                                    >
                                        删除
                                    </button>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            {editing ? (
                <section className={settings.card}>
                    <div className={settings.cardHeader}>
                        <div>
                            <h5>{skills.some((skill) => skill.id === editing.id) ? "编辑技能" : "添加技能"}</h5>
                        </div>
                    </div>
                    <form className={settings.cardBody} onSubmit={handleSave}>
                        <div className={settings.formGrid}>
                            <label className={settings.field}>
                                <span className={settings.label}>名称</span>
                                <input
                                    className={settings.input}
                                    value={editing.name || ""}
                                    onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                                    placeholder="例如：代码审查规范"
                                    required
                                />
                            </label>
                            <label className={settings.field}>
                                <span className={settings.label}>描述（可选）</span>
                                <input
                                    className={settings.input}
                                    value={editing.description || ""}
                                    onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                                    placeholder="一句话说明何时使用该技能"
                                />
                            </label>
                            <label className={`${settings.field} ${settings.fieldFull}`}>
                                <span className={settings.label}>内容（Markdown 指令）</span>
                                <textarea
                                    className={`${settings.input} ${settings.textarea}`}
                                    rows={10}
                                    value={editing.content || ""}
                                    onChange={(event) => setEditing({ ...editing, content: event.target.value })}
                                    placeholder={"## 规范\n- 修改积木前先用 getDiagnostics 检查"}
                                    spellCheck={false}
                                />
                            </label>
                        </div>
                        <div className={`${settings.toolbar} ${settings.formActions}`}>
                            <div className={settings.actions}>
                                <button type="button" className={settings.button} onClick={() => setEditing(null)}>
                                    取消
                                </button>
                                <button type="submit" className={settings.primaryButton}>
                                    保存
                                </button>
                            </div>
                        </div>
                    </form>
                </section>
            ) : null}

            <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className={settings.fileInput}
                onChange={(event) => void handleImport(event)}
            />
        </div>
    );
};

interface PromptSectionProps {
    config: PromptConfig;
    onSave: (config: PromptConfig) => void;
    systemPrompt: string;
}

const PromptSection: React.FC<PromptSectionProps> = ({ config, onSave, systemPrompt }) => {
    const [mode, setMode] = React.useState<PromptConfig["mode"]>(config?.mode || "append");
    const [text, setText] = React.useState<string>(config?.text || "");
    const [includeBase, setIncludeBase] = React.useState<boolean>(config?.includeBase !== false);
    const [saved, setSaved] = React.useState(false);
    const savedTimerRef = React.useRef<number | null>(null);

    const flashSaved = () => {
        setSaved(true);
        if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
        savedTimerRef.current = window.setTimeout(() => setSaved(false), 2000);
    };

    // Apply one or more fields immediately (used by the instant-apply switch/mode controls).
    const saveFields = (overrides: Partial<PromptConfig> = {}) => {
        const next: PromptConfig = {
            mode: overrides.mode ?? mode,
            text: overrides.text ?? text,
            includeBase: overrides.includeBase ?? includeBase,
        };
        setMode(next.mode);
        setIncludeBase(next.includeBase);
        onSave(next);
        flashSaved();
    };

    const handleSave = () => {
        onSave({ mode, text, includeBase });
        flashSaved();
    };

    const modeOptions: Array<{ value: PromptConfig["mode"]; label: string; hint: string }> = [
        { value: "append", label: "追加（默认）", hint: "自定义内容放在内置基础提示词之后，叠加生效。" },
        { value: "prepend", label: "前置", hint: "自定义内容放在基础提示词之前，优先级最高。" },
        { value: "replace", label: "完全替换", hint: "只用你的文本作为系统提示词，丢弃内置基础提示词。此模式需自行描述工具与工作流，否则 AI 可能行为不稳定。" },
    ];

    return (
        <div className={settings.sectionStack}>
            <section className={settings.card}>
                <div className={settings.cardHeader}>
                    <div>
                        <h5>系统提示词</h5>
                        <p>自定义发给模型的系统提示词。技能（设置→技能）始终在最终提示词末尾追加，不受此设置影响。</p>
                    </div>
                    <button type="button" className={settings.primaryButton} onClick={handleSave}>
                        {saved ? "已保存" : "保存"}
                    </button>
                </div>
                <div className={settings.cardBody}>
                    <label className={settings.checkLabel}>
                        <input
                            type="checkbox"
                            checked={includeBase}
                            onChange={(event) => {
                                // Persist instantly: users expect this switch to take effect
                                // without hunting for the header save button.
                                setIncludeBase(event.target.checked);
                                saveFields({ includeBase: event.target.checked });
                            }}
                        />
                        <span>
                            <strong>启用内置默认提示词</strong>
                            <span className={settings.toolDesc}> 关闭后，内置基础提示词与计划模式提示词都不再注入，只使用下方自定义内容（另有技能时追加）。</span>
                        </span>
                    </label>
                    <div>
                        <span className={settings.label}>合并方式</span>
                        <div className={settings.formGrid}>
                            {modeOptions.map((option) => (
                                <label key={option.value} className={settings.checkLabel}>
                                    <input
                                        type="radio"
                                        name="prompt-mode"
                                        checked={mode === option.value}
                                        onChange={() => saveFields({ mode: option.value })}
                                    />
                                    <span>
                                        <strong>{option.label}</strong>
                                        <span className={settings.toolDesc}> {option.hint}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <label className={`${settings.field} ${settings.fieldFull}`}>
                        <span className={settings.label}>提示词内容</span>
                        <textarea
                            className={`${settings.input} ${settings.textarea}`}
                            rows={14}
                            value={text}
                            onChange={(event) => {
                                setText(event.target.value);
                                setSaved(false);
                            }}
                            placeholder={"You are helpful assistant...（注意：replace 模式下此文本将完全替代内置提示词）"}
                            spellCheck={false}
                        />
                    </label>
                    <div className={`${settings.toolbar} ${settings.formActions}`}>
                        <button type="button" className={settings.button} onClick={handleSave}>
                            {saved ? "已保存" : "保存"}
                        </button>
                    </div>
                </div>
            </section>
            <section className={settings.card}>
                <div className={settings.cardHeader}>
                    <div>
                        <h5>当前生效的系统提示词</h5>
                        <p>这是上一次发送消息时，实际发给模型的完整系统提示词（内置基础 + 你的自定义 + 技能 合并后）。改完设置后发送一条消息即可刷新。</p>
                    </div>
                    <button
                        type="button"
                        className={settings.button}
                        onClick={() => {
                            if (navigator.clipboard?.writeText) {
                                void navigator.clipboard.writeText(systemPrompt || "");
                                window.setTimeout(() => alert("已复制系统提示词"), 0);
                            }
                        }}
                        disabled={!systemPrompt}
                    >
                        复制
                    </button>
                </div>
                <div className={settings.cardBody}>
                    <textarea
                        className={`${settings.input} ${settings.textarea}`}
                        rows={16}
                        readOnly
                        value={systemPrompt || "（尚未发送消息，暂无系统提示词。发送一次消息后这里会显示实际生效的完整提示词。）"}
                        spellCheck={false}
                    />
                </div>
            </section>
        </div>
    );
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
    debugMode,
    onToggleDebugMode,
    onOpenBenchmark,
    mcpServers,
    onSaveMCPServer,
    onDeleteMCPServer,
    disabledTools,
    onSetDisabledTools,
    jsPermission,
    onSetJsPermission,
    skills,
    subagents,
    onSaveSubagents,
    onSaveSkill,
    onDeleteSkill,
    promptConfig,
    onSavePromptConfig,
    systemPrompt,
    onClose,
    isCompact,
}) => {
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);
    const [activeSection, setActiveSection] = React.useState<SettingsSection>("agents");
    const [formData, setFormData] = React.useState<Partial<Agent>>({ provider: "openai" });
    const [models, setModels] = React.useState<AgentModel[]>([createDefaultModel()]);
    const [fetchedModels, setFetchedModels] = React.useState<FetchedModel[]>([]);
    const [selectedFetchedModelId, setSelectedFetchedModelId] = React.useState("");
    const [isFetchingModels, setIsFetchingModels] = React.useState(false);
    const [modelFetchMessage, setModelFetchMessage] = React.useState("");

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
                        contextWindow: (editingAgent as any).contextWindow,
                    },
                ],
            );
            return;
        }

        setFormData({ provider: "openai", baseUrl: PROVIDER_DEFAULT_URLS.openai });
        setModels([createDefaultModel()]);
    }, [editingAgent]);

    const handleFetchModels = React.useCallback(
        async (options?: { silent?: boolean; signal?: AbortSignal }) => {
            const provider = formData.provider || "openai";
            const baseUrl = formData.baseUrl?.trim() || PROVIDER_DEFAULT_URLS[provider] || "";
            const apiKey = formData.apiKey || "";

            if (!apiKey.trim()) {
                if (!options?.silent) setModelFetchMessage("填写 API Key 后会自动获取模型列表，也可以继续手动输入模型 ID。");
                return;
            }

            setIsFetchingModels(true);
            if (!options?.silent) setModelFetchMessage("正在获取模型列表...");

            try {
                const nextModels = await fetchProviderModels(provider, baseUrl, apiKey, options?.signal);
                setFetchedModels(nextModels);
                setSelectedFetchedModelId((previous) => previous || nextModels[0]?.id || "");
                setModelFetchMessage(`已获取 ${nextModels.length} 个模型，可从下拉选择或继续自定义输入。`);
            } catch (error) {
                if (options?.signal?.aborted) return;
                setFetchedModels([]);
                setSelectedFetchedModelId("");
                setModelFetchMessage(error instanceof Error ? error.message : "获取模型列表失败");
            } finally {
                if (!options?.signal?.aborted) setIsFetchingModels(false);
            }
        },
        [formData.apiKey, formData.baseUrl, formData.provider],
    );

    React.useEffect(() => {
        setFetchedModels([]);
        setSelectedFetchedModelId("");
        setModelFetchMessage("");
    }, [formData.provider, formData.baseUrl]);

    React.useEffect(() => {
        if (!formData.apiKey?.trim()) return;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => {
            void handleFetchModels({ silent: true, signal: controller.signal });
        }, 600);

        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [formData.apiKey, formData.baseUrl, formData.provider, handleFetchModels]);

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

    const addFetchedModel = () => {
        const selected = fetchedModels.find((model) => model.id === selectedFetchedModelId);
        if (!selected) return;

        setModels((previous) => {
            if (previous.some((model) => model.modelId === selected.id)) return previous;
            return [
                ...previous,
                {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    name: selected.name || selected.id,
                    modelId: selected.id,
                },
            ];
        });
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

    const activeGroup = SECTION_GROUPS.find((group) => group.sections.includes(activeSection)) || SECTION_GROUPS[0];
    const sectionTitle = SUBTAB_LABELS[activeSection];
    const sectionDescription = {
        "agents": "管理 Agents",
        "mcp": "连接 MCP 服务器，为 AI 提供外部工具",
        "tools": "启用或禁用内置工具",
        "skills": "自定义注入系统提示词的技能",
        "memory": "管理 AI 的长期记忆与项目记忆",
        "subagents": "管理 runSubAgent 可用的子智能体角色",
        "prompt": "编辑发给模型的系统提示词",
        "appearance": "切换界面主题",
        "debug": "性能基准与开发者工具",
        "about": "关于本项目"
    }[activeSection] || ""

    return (
        <div className={settings.overlay} onClick={onClose}>
            <div
                className={`${settings.modal} ${isCompact ? settings.modalCompact : ""}`}
                onClick={(event) => event.stopPropagation()}
            >
                <aside className={settings.settingsNav}>
                    <div className={settings.settingsTitle}>
                        <h3>设置</h3>
                    </div>
                    <nav className={settings.navList} aria-label="设置分类">
                        {SECTION_GROUPS.map((group) => {
                            const isActive = group.id === activeGroup.id;
                            return (
                                <button
                                    key={group.id}
                                    type="button"
                                    className={`${settings.navItem} ${isActive ? settings.navItemActive : ""}`}
                                    onClick={() => setActiveSection(group.sections[0])}
                                    title={group.sublabel}
                                >
                                    <span>{group.label}</span>
                                </button>
                            );
                        })}
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
                    {activeGroup.sections.length > 1 ? (
                        <nav className={settings.subTabs} aria-label={`${activeGroup.label}分类`}>
                            {activeGroup.sections.map((section) => (
                                <button
                                    key={section}
                                    type="button"
                                    className={`${settings.subTabItem} ${activeSection === section ? settings.subTabItemActive : ""}`}
                                    onClick={() => setActiveSection(section)}
                                >
                                    {SUBTAB_LABELS[section]}
                                </button>
                            ))}
                        </nav>
                    ) : null}

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
                                                <p>配置 API Key 后会自动通过 API 获取模型列表；也可以继续手动输入自定义模型 ID。</p>
                                            </div>
                                            <button type="button" className={settings.button} onClick={addModel}>
                                                添加模型
                                            </button>
                                        </div>
                                        <div className={settings.modelFetchPanel}>
                                            <div className={settings.modelFetchControls}>
                                                <select
                                                    className={settings.select}
                                                    value={selectedFetchedModelId}
                                                    onChange={(event) => setSelectedFetchedModelId(event.target.value)}
                                                    disabled={fetchedModels.length === 0}
                                                >
                                                    {fetchedModels.length === 0 ? <option value="">暂无可选模型</option> : null}
                                                    {fetchedModels.map((model) => (
                                                        <option key={model.id} value={model.id}>
                                                            {model.name === model.id ? model.id : `${model.name} (${model.id})`}
                                                        </option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    className={settings.button}
                                                    onClick={() => void handleFetchModels()}
                                                    disabled={isFetchingModels}
                                                >
                                                    {isFetchingModels ? "获取中..." : "刷新模型"}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={settings.button}
                                                    onClick={addFetchedModel}
                                                    disabled={!selectedFetchedModelId}
                                                >
                                                    添加选中模型
                                                </button>
                                            </div>
                                            <div className={settings.hint}>
                                                {modelFetchMessage || "模型 ID 输入框支持从已获取列表选择，也支持直接输入自定义模型。"}
                                            </div>
                                            <datalist id="02agent-fetched-models">
                                                {fetchedModels.map((model) => (
                                                    <option key={model.id} value={model.id} label={model.name} />
                                                ))}
                                            </datalist>
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
                                                        list="02agent-fetched-models"
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
                                                    <input
                                                        className={settings.input}
                                                        value={model.imageModel || ""}
                                                        onChange={(event) =>
                                                            updateModel(
                                                                model.id,
                                                                "imageModel",
                                                                event.target.value.trim() || undefined,
                                                            )
                                                        }
                                                        placeholder="生成图像模型ID（可选，用于 AI 生成造型）"
                                                    />
                                                    <div className={settings.contextWindowControl}>
                                                        <select
                                                            className={settings.select}
                                                            value={
                                                                model.contextWindow === undefined
                                                                    ? ""
                                                                    : isPresetContextWindow(model.contextWindow)
                                                                        ? String(model.contextWindow)
                                                                        : "custom"
                                                            }
                                                            onChange={(event) => {
                                                                const nextValue = event.target.value;
                                                                if (!nextValue) {
                                                                    updateModel(model.id, "contextWindow", undefined);
                                                                    return;
                                                                }
                                                                if (nextValue === "custom") {
                                                                    updateModel(model.id, "contextWindow", 100000);
                                                                    return;
                                                                }
                                                                updateModel(model.id, "contextWindow", Number(nextValue));
                                                            }}
                                                            title="上下文窗口"
                                                        >
                                                            <option value="">跟随默认</option>
                                                            {CONTEXT_WINDOW_OPTIONS.map((option) => (
                                                                <option key={option.value} value={option.value}>
                                                                    {option.label}
                                                                </option>
                                                            ))}
                                                            <option value="custom">自定义</option>
                                                        </select>
                                                        {model.contextWindow !== undefined &&
                                                            !isPresetContextWindow(model.contextWindow) ? (
                                                            <input
                                                                className={`${settings.input} ${settings.contextWindowInput}`}
                                                                type="number"
                                                                min={1024}
                                                                max={10000000}
                                                                value={model.contextWindow || ""}
                                                                onChange={(event) =>
                                                                    updateModel(
                                                                        model.id,
                                                                        "contextWindow",
                                                                        event.target.value
                                                                            ? Number(event.target.value)
                                                                            : undefined,
                                                                    )
                                                                }
                                                                placeholder="tokens"
                                                            />
                                                        ) : null}
                                                    </div>
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

                        {activeSection === "mcp" ? (
                            <MCPSection servers={mcpServers} onSave={onSaveMCPServer} onDelete={onDeleteMCPServer} />
                        ) : null}

                        {activeSection === "tools" ? (
                            <ToolsSection
                                disabledTools={disabledTools}
                                onSetDisabledTools={onSetDisabledTools}
                                jsPermission={jsPermission}
                                onSetJsPermission={onSetJsPermission}
                            />
                        ) : null}

                        {activeSection === "memory" ? <MemorySection /> : null}

                        {activeSection === "subagents" ? (
                            <SubagentsSection subagents={subagents} onSave={onSaveSubagents} />
                        ) : null}

                        {activeSection === "skills" ? (
                            <SkillsSection skills={skills} onSave={onSaveSkill} onDelete={onDeleteSkill} />
                        ) : null}

                        {activeSection === "prompt" ? (
                            <PromptSection config={promptConfig} onSave={onSavePromptConfig} systemPrompt={systemPrompt} />
                        ) : null}

                        {activeSection === "appearance" ? (
                            <section className={settings.card}>
                                <div className={settings.cardHeader}>
                                    <div>
                                        <h5>切换主题</h5>
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

                        {activeSection === "debug" ? (
                            <div className={settings.sectionStack}>
                                <section className={settings.card}>
                                    <div className={settings.cardHeader}>
                                        <div>
                                            <h5>调试模式</h5>
                                            <p>开启后可从调试入口打开性能基准面板。</p>
                                        </div>
                                    </div>
                                    <div className={settings.cardBody}>
                                        <button
                                            type="button"
                                            className={`${settings.themeChoice} ${debugMode ? settings.themeChoiceActive : ""}`}
                                            onClick={() => onToggleDebugMode(!debugMode)}
                                        >
                                            <strong>{debugMode ? "已开启" : "已关闭"}</strong>
                                            <span>开启后可从调试入口打开性能基准面板。</span>
                                        </button>
                                    </div>
                                </section>
                                <section className={settings.card}>
                                    <div className={settings.cardHeader}>
                                        <div>
                                            <h5>性能基准</h5>
                                            <p>在真实聊天渲染管线中测量流式输出的 FPS、掉帧与长任务，不会写入真实会话历史。</p>
                                        </div>
                                        <button
                                            type="button"
                                            className={settings.button}
                                            onClick={onOpenBenchmark}
                                            disabled={!debugMode}
                                        >
                                            打开性能基准面板
                                        </button>
                                    </div>
                                </section>
                            </div>
                        ) : null}

                        {activeSection === "about" ? (
                            <>
                                <section className={settings.card}>
                                    <section className={settings.cardHeader}>
                                        <div>
                                            <h5>贡献者（排名不分先后）</h5>
                                            <ul className={settings.list}>
                                                <li>白猫</li>
                                                <li>酷可MC</li>
                                                <li>0.2Studio 所有成员</li>
                                            </ul>
                                        </div>
                                    </section>
                                </section>
                                {/* <section className={settings.card}>
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
                                </section> */}
                            </>
                        ) : null}
                    </div>
                </main>
            </div>
        </div>
    );
};
