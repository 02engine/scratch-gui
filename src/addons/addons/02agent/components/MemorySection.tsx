import * as React from "react";
import settings from "../ui/Settings.module.less";
import {
    MemoryBlock,
    MemoryScope,
    deleteMemoryBlock,
    listMemoryBlocks,
    setMemoryBlock,
} from "../agentStores";

interface MemorySectionProps {}

const SCOPE_LABEL: Record<MemoryScope, string> = {
    longTerm: "长期记忆",
    project: "项目记忆",
};

/**
 * Manage persistent memory blocks (long-term / project). Reads localStorage on mount and
 * after each mutation; the AI tools share the same store, so edits made here are visible
 * to the next turn and vice versa.
 */
export const MemorySection: React.FC<MemorySectionProps> = () => {
    const [blocks, setBlocks] = React.useState<MemoryBlock[]>([]);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editingText, setEditingText] = React.useState("");
    const [creating, setCreating] = React.useState(false);
    const [createText, setCreateText] = React.useState("");
    const [createScope, setCreateScope] = React.useState<MemoryScope>("longTerm");
    const [createTitle, setCreateTitle] = React.useState("");
    const [message, setMessage] = React.useState<string>("");

    const reload = React.useCallback(() => {
        setBlocks(listMemoryBlocks());
    }, []);

    React.useEffect(() => {
        reload();
    }, [reload]);

    const flash = (text: string) => {
        setMessage(text);
        window.setTimeout(() => setMessage(""), 2500);
    };

    const handleSaveEdit = (block: MemoryBlock) => {
        if (!editingText.trim()) return;
        setMemoryBlock({ id: block.id, scope: block.scope, title: block.title, text: editingText });
        setEditingId(null);
        reload();
        flash("已保存");
    };

    const handleDelete = (id: string) => {
        try {
            deleteMemoryBlock(id);
            flash("已删除");
        } catch (error) {
            flash(`删除失败：${(error as Error).message}`);
        }
        reload();
    };

    const handleCreate = () => {
        if (!createText.trim()) return;
        try {
            setMemoryBlock({ scope: createScope, title: createTitle.trim() || undefined, text: createText.trim() });
            setCreating(false);
            setCreateText("");
            setCreateTitle("");
            reload();
            flash("已添加");
        } catch (error) {
            flash(`添加失败：${(error as Error).message}`);
        }
    };

    return (
        <div className={settings.sectionStack}>
            <section className={settings.card}>
                <div className={settings.cardHeader}>
                    <div>
                        <h5>持久记忆</h5>
                        <p>
                            AI 通过 memory 工具读写这里的条目。长期记忆跨项目保留用户偏好与规则；项目记忆随当前项目，
                            记录项目约定。直接编辑会立即生效。
                        </p>
                    </div>
                    <button
                        type="button"
                        className={settings.primaryButton}
                        onClick={() => setCreating((value) => !value)}
                    >
                        {creating ? "取消" : "+ 添加记忆"}
                    </button>
                </div>
                {message ? <div className={settings.memoryMessage}>{message}</div> : null}
                <div className={`${settings.cardBody} ${settings.memoryList}`}>
                    {creating ? (
                        <div className={settings.memoryEditor}>
                            <div className={settings.memoryEditorRow}>
                                <select
                                    className={settings.select}
                                    value={createScope}
                                    onChange={(event) => setCreateScope(event.target.value as MemoryScope)}
                                >
                                    <option value="longTerm">长期记忆</option>
                                    <option value="project">项目记忆</option>
                                </select>
                                <input
                                    className={settings.input}
                                    placeholder="可选标题"
                                    value={createTitle}
                                    onChange={(event) => setCreateTitle(event.target.value)}
                                />
                            </div>
                            <textarea
                                className={settings.memoryTextarea}
                                placeholder="记忆内容（精炼、包含关键细节）"
                                rows={3}
                                value={createText}
                                onChange={(event) => setCreateText(event.target.value)}
                            />
                            <button type="button" className={settings.primaryButton} onClick={handleCreate}>
                                保存
                            </button>
                        </div>
                    ) : null}
                    {blocks.length === 0 && !creating ? (
                        <p className={settings.memoryEmpty}>还没有任何记忆条目。</p>
                    ) : null}
                    {(["longTerm", "project"] as MemoryScope[]).map((scope) => {
                        const rows = blocks.filter((block) => block.scope === scope);
                        if (rows.length === 0) return null;
                        return (
                            <div key={scope} className={settings.memoryGroup}>
                                <div className={settings.memoryGroupLabel}>
                                    {SCOPE_LABEL[scope]} · {rows.length}
                                </div>
                                {rows.map((block) => (
                                    <div key={block.id} className={settings.memoryRow}>
                                        {editingId === block.id ? (
                                            <div className={settings.memoryEditorInline}>
                                                <textarea
                                                    className={settings.memoryTextarea}
                                                    rows={3}
                                                    value={editingText}
                                                    onChange={(event) => setEditingText(event.target.value)}
                                                />
                                                <div className={settings.memoryActions}>
                                                    <button
                                                        type="button"
                                                        className={settings.primaryButton}
                                                        onClick={() => handleSaveEdit(block)}
                                                    >
                                                        保存
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={settings.button}
                                                        onClick={() => setEditingId(null)}
                                                    >
                                                        取消
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className={settings.memoryText}>
                                                    {block.title ? (
                                                        <strong className={settings.memoryTitle}>
                                                            {block.title}
                                                        </strong>
                                                    ) : null}
                                                    {block.text}
                                                </div>
                                                <div className={settings.memoryActions}>
                                                    <button
                                                        type="button"
                                                        className={settings.button}
                                                        onClick={() => {
                                                            setEditingId(block.id);
                                                            setEditingText(block.text);
                                                        }}
                                                    >
                                                        编辑
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={settings.button}
                                                        onClick={() => handleDelete(block.id)}
                                                    >
                                                        删除
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
};
