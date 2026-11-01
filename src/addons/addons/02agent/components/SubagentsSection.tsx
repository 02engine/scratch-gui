import * as React from "react";
import settings from "../ui/Settings.module.less";
import { SubagentDef } from "../types";
import { BUILTIN_SUBAGENTS } from "../agentStores";

interface SubagentDefWithMeta extends SubagentDef {}

interface SubagentsSectionProps {
    subagents: SubagentDef[];
    onSave: (list: SubagentDef[]) => void;
}

/**
 * Manage subagent presets. Custom entries are stored globally and take precedence over
 * the built-in critic/tester/researcher fallbacks used by the runSubAgent tool.
 */
export const SubagentsSection: React.FC<SubagentsSectionProps> = ({ subagents, onSave }) => {
    const safeList = Array.isArray(subagents) ? subagents : [];
    const [editing, setEditing] = React.useState<SubagentDefWithMeta | null>(null);
    const [message, setMessage] = React.useState("");

    const flash = (text: string) => {
        setMessage(text);
        window.setTimeout(() => setMessage(""), 2500);
    };

    const upsert = (def: SubagentDef) => {
        const next = safeList.some((item) => item.id === def.id)
            ? safeList.map((item) => (item.id === def.id ? def : item))
            : [...safeList, def];
        onSave(next);
        flash("已保存");
    };

    const remove = (id: string) => {
        onSave(safeList.filter((item) => item.id !== id));
        flash("已删除");
    };

    const startEdit = (def: SubagentDefWithMeta) => setEditing({ ...def });
    const startCreate = () =>
        setEditing({ id: `sub-${Date.now().toString(36)}`, name: "", description: "", systemPrompt: "" });

    const submitEdit = () => {
        if (!editing?.name?.trim() || !editing.systemPrompt?.trim()) {
            flash("名称与提示词为必填");
            return;
        }
        upsert({ ...editing, name: editing.name.trim(), systemPrompt: editing.systemPrompt.trim() });
        setEditing(null);
    };

    return (
        <div className={settings.sectionStack}>
            <section className={settings.card}>
                <div className={settings.cardHeader}>
                    <div>
                        <h5>子智能体</h5>
                        <p>
                            runSubAgent 工具会把独立子任务交给这里的角色（每次一轮对话、不带工具）。自定义条目优先于内置预设。
                        </p>
                    </div>
                    <button type="button" className={settings.primaryButton} onClick={startCreate}>
                        + 新建子智能体
                    </button>
                </div>
                {message ? <div className={settings.memoryMessage}>{message}</div> : null}
                <div className={`${settings.cardBody} ${settings.memoryList}`}>
                    {editing ? (
                        <div className={settings.memoryEditor}>
                            <div className={settings.memoryEditorRow}>
                                <input
                                    className={settings.input}
                                    placeholder="profile id（英文，如 critic-v2）"
                                    value={editing.id}
                                    onChange={(event) => setEditing({ ...editing, id: event.target.value })}
                                    disabled={false}
                                />
                                <input
                                    className={settings.input}
                                    placeholder="显示名称"
                                    value={editing.name}
                                    onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                                />
                            </div>
                            <textarea
                                className={settings.memoryTextarea}
                                rows={5}
                                placeholder="子智能体的完整提示词（角色、输出格式、约束）"
                                value={editing.systemPrompt}
                                onChange={(event) => setEditing({ ...editing, systemPrompt: event.target.value })}
                            />
                            <div className={settings.memoryActions}>
                                <button type="button" className={settings.primaryButton} onClick={submitEdit}>
                                    保存
                                </button>
                                <button type="button" className={settings.button} onClick={() => setEditing(null)}>
                                    取消
                                </button>
                            </div>
                        </div>
                    ) : null}

                    {safeList.map((def) => (
                        <div key={def.id} className={settings.memoryRow}>
                            <div className={settings.memoryText}>
                                <strong className={settings.memoryTitle}>
                                    {def.name}{" "}
                                    <code style={{ fontSize: 11, opacity: 0.8 }}>{def.id}</code>
                                    {def.description ? (
                                        <span style={{ opacity: 0.7 }}> · {def.description}</span>
                                    ) : null}
                                </strong>
                                <span
                                    style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                                >
                                    {def.systemPrompt.length > 120
                                        ? `${def.systemPrompt.slice(0, 120)}…`
                                        : def.systemPrompt}
                                </span>
                            </div>
                            <div className={settings.memoryActions}>
                                <button type="button" className={settings.button} onClick={() => startEdit(def)}>
                                    编辑
                                </button>
                                <button type="button" className={settings.button} onClick={() => remove(def.id)}>
                                    删除
                                </button>
                            </div>
                        </div>
                    ))}
                    <div className={settings.memoryGroup}>
                        <div className={settings.memoryGroupLabel}>内置预设 · {BUILTIN_SUBAGENTS.length}</div>
                        {BUILTIN_SUBAGENTS.map((def) => (
                            <div key={def.id} className={settings.memoryRow}>
                                <div className={settings.memoryText}>
                                    <strong className={settings.memoryTitle}>
                                        {def.name}{" "}
                                        <code style={{ fontSize: 11, opacity: 0.8 }}>{def.id}</code>
                                    </strong>
                                    <span style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                        {def.systemPrompt.length > 140
                                            ? `${def.systemPrompt.slice(0, 140)}…`
                                            : def.systemPrompt}
                                    </span>
                                </div>
                                <div className={settings.memoryActions}>
                                    <button
                                        type="button"
                                        className={settings.button}
                                        onClick={() =>
                                            setEditing({
                                                id: `${def.id}-copy`,
                                                name: `${def.name}（副本）`,
                                                description: `克隆自内置 ${def.id}`,
                                                systemPrompt: def.systemPrompt,
                                            })
                                        }
                                    >
                                        克隆
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {safeList.length === 0 ? (
                        <p className={settings.memoryEmpty}>还没有自定义角色；上面的内置预设始终可用，可克隆后修改。</p>
                    ) : null}
                </div>
            </section>
        </div>
    );
};
