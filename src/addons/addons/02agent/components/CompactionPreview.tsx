import * as React from "react";
import chat from "../ui/Chat.module.less";

export const CompactionPreview: React.FC<{ summary: string | null; onClose: () => void }> = ({ summary, onClose }) => {
    if (!summary) return null;
    return (
        <div className={chat.compactionOverlay} role="dialog" aria-modal="true" onClick={onClose}>
            <div className={chat.compactionPanel} onClick={(event) => event.stopPropagation()}>
                <div className={chat.approvalHeader}>
                    <div>
                        <div className={chat.approvalTitle}>压缩记忆内容</div>
                        <div className={chat.approvalSubtitle}>
                            以下快照已替代更早的对话上下文（analysis 与 state_snapshot）。
                        </div>
                    </div>
                </div>
                <pre className={chat.compactionBody}>{summary}</pre>
                <div className={chat.approvalActions}>
                    <button type="button" className={chat.approvalDeny} onClick={onClose}>
                        关闭
                    </button>
                </div>
            </div>
        </div>
    );
};
