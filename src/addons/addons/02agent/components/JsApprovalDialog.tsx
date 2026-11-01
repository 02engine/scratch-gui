import * as React from "react";
import chat from "../ui/Chat.module.less";

export interface JsApprovalRequest {
    id: number;
    code: string;
}

interface JsApprovalDialogProps {
    request: JsApprovalRequest | null;
    onResolve: (approved: boolean) => void;
}

/**
 * Modal shown in 审核 mode before model-written JavaScript runs. Displays the exact
 * code so the user can judge it, then resolves the pending promise.
 */
export const JsApprovalDialog: React.FC<JsApprovalDialogProps> = ({ request, onResolve }) => {
    if (!request) return null;

    const preview = request.code.length > 6000 ? `${request.code.slice(0, 6000)}\n...[已截断显示]` : request.code;

    return (
        <div className={chat.approvalOverlay} role="dialog" aria-modal="true">
            <div className={chat.approvalPanel}>
                <div className={chat.approvalHeader}>
                    <div>
                        <div className={chat.approvalTitle}>允许运行这段 JavaScript？</div>
                        <div className={chat.approvalSubtitle}>
                            runJavaScript 将以主线程权限执行，可读取页面数据、修改项目并访问网络。
                        </div>
                    </div>
                </div>
                <pre className={chat.approvalCode}>{preview}</pre>
                <div className={chat.approvalActions}>
                    <button type="button" className={chat.approvalDeny} onClick={() => onResolve(false)}>
                        拒绝
                    </button>
                    <button type="button" className={chat.approvalAllow} onClick={() => onResolve(true)}>
                        允许执行
                    </button>
                </div>
            </div>
        </div>
    );
};
