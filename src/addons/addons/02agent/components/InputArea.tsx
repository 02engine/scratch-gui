import * as React from "react";
import composer from "../ui/Composer.module.less";
import { parseLocalAttachment } from "../attachments";
import { Attachment, ChatStats } from "../types";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { getAttachmentDisplayName } from "../attachmentUtils";
// import SendIcon from "assets/icon-send.svg";
import StopIcon from "assets/icon-stop.svg";
// import ChevronRightIcon from "assets/icon-chevron-right.svg";
// import ComposeExpandIcon from "assets/icon-compose-expand.svg";

interface InputAreaProps {
    inputText: string;
    setInputText: (text: string) => void;
    attachments: Attachment[];
    setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
    onSend: () => void;
    onStopGenerating: () => void;
    onStartBlockSelection: () => void;
    onCancelBlockSelection: () => void;
    isSelectingBlocks: boolean;
    enableReasoning: boolean;
    onToggleReasoning: () => void;
    planMode: boolean;
    onTogglePlanMode: () => void;
    isPlanReady: boolean;
    onApprovePlan: () => void;
    onOpenAttachment: (attachment: Attachment) => void;
    isGenerating: boolean;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    stats?: ChatStats | null;
    vm: PluginContext["vm"];
}

const formatCompactTokens = (value?: number) => {
    if (value === undefined || value === null || !Number.isFinite(value)) return "--";
    if (value >= 1_000_000) {
        const scaled = value / 1_000_000;
        return `${scaled.toFixed(scaled >= 10 ? 0 : 1)}M`;
    }
    if (value >= 1_000) {
        const scaled = value / 1_000;
        return `${scaled.toFixed(scaled >= 10 ? 0 : 1)}k`;
    }
    return String(Math.round(value));
};

const formatLatency = (value?: number) => {
    if (value === undefined || value === null || !Number.isFinite(value)) return "--";
    return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(1)}s`;
};

const ContextRing = ({ percent }: { percent: number }) => {
    const radius = 5;
    const circumference = 2 * Math.PI * radius;
    const bounded = Math.max(0, Math.min(100, percent));
    return (
        <svg className={composer.statRing} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <circle className={composer.statRingTrack} cx="6" cy="6" r={radius} />
            <circle
                className={composer.statRingFill}
                cx="6"
                cy="6"
                r={radius}
                strokeDasharray={`${(circumference * bounded) / 100} ${circumference}`}
                transform="rotate(-90 6 6)"
            />
        </svg>
    );
};

const IconSend = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor">
    <path d="M2.2 13.1 13.7 8 2.2 2.9l1.4 4.1 5.1 1-5.1 1-1.4 4.1Z" fill="currentColor" stroke-width="0.5" stroke-linejoin="round" />
</svg>

const IconComposeExpand = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 2.25H2.75V4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M9 2.25h2.25V4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M5 11.75H2.75V9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M9 11.75h2.25V9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M5 2.25 2.25 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
    <path d="M9 2.25 11.75 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
    <path d="M5 11.75 2.25 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
    <path d="M9 11.75 11.75 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
</svg>



export const InputArea: React.FC<InputAreaProps> = ({
    inputText,
    setInputText,
    attachments,
    setAttachments,
    onSend,
    onStopGenerating,
    onStartBlockSelection,
    onCancelBlockSelection,
    isSelectingBlocks,
    enableReasoning,
    onToggleReasoning,
    planMode,
    onTogglePlanMode,
    isPlanReady,
    onApprovePlan,
    onOpenAttachment,
    isGenerating,
    isExpanded,
    onToggleExpanded,
    stats,
    vm,
}) => {
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);
    const [previewAttachment, setPreviewAttachment] = React.useState<Attachment | null>(null);
    const [expandedId, setExpandedId] = React.useState<string | null>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        const parsedAttachments = await Promise.all(
            files.map(async (file) => {
                try {
                    return await parseLocalAttachment(file);
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : "未知错误";
                    return {
                        id: `${Date.now()}-${file.name}`,
                        name: file.name,
                        kind: "text-file" as const,
                        mimeType: file.type || "application/octet-stream",
                        content: `导入失败：${message}`,
                        preview: `导入失败：${message}`,
                        meta: {
                            source: "local-file",
                        },
                    };
                }
            }),
        );

        setAttachments((prev) => [...prev, ...parsedAttachments]);
        event.target.value = "";
    };

    return (
        <div className={`${composer.inputArea} ${isExpanded ? composer.inputAreaExpanded : ""}`}>
            {attachments.length > 0 ? (
                <div className={composer.attachments}>
                    {attachments.map((attachment) => (
                        <div key={attachment.id} className={composer.attachmentItem}>
                            <span className={composer.attachmentKind}>
                                {attachment.kind === "workspace-ucf-range"
                                    ? "片段"
                                    : attachment.kind === "workspace-ucf"
                                        ? "积木"
                                        : "文件"}
                            </span>
                            <button
                                className={composer.inlineTextButton}
                                onClick={() => {
                                    if (attachment.kind === "workspace-ucf" || attachment.kind === "workspace-ucf-range") {
                                        onOpenAttachment(attachment);
                                        return;
                                    }
                                    setPreviewAttachment(attachment);
                                }}
                                title={getAttachmentDisplayName(attachment, vm)}
                            >
                                <span className={composer.attachmentName}>{getAttachmentDisplayName(attachment, vm)}</span>
                            </button>
                            {(attachment.kind === "workspace-ucf" || attachment.kind === "workspace-ucf-range") &&
                                attachment.preview ? (
                                <button
                                    className={composer.attachmentExpandButton}
                                    onClick={() => setExpandedId((prev) => (prev === attachment.id ? null : attachment.id))}
                                >
                                    {expandedId === attachment.id ? "收起" : "展开"}
                                </button>
                            ) : null}
                            <button
                                className={composer.attachmentRemoveButton}
                                onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}
                                title="移除附件"
                            >
                                x
                            </button>
                            {expandedId === attachment.id && attachment.preview ? (
                                <pre className={composer.attachmentPreviewBlock}>{attachment.preview}</pre>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}
            <div className={composer.inputBox}>
                <div className={composer.toggleModeArea}>
                    <button
                        type="button"
                        className={`${composer.modeToggleButton} ${planMode ? composer.modeToggleButtonActive : ""}`}
                        onClick={onTogglePlanMode}
                        title="Plan 模式：让 AI 制定完整的规划"
                        aria-pressed={planMode}
                    >
                        Plan
                    </button>
                    {planMode ? (
                        <span className={composer.modeHint}>
                            {isGenerating
                                ? "正在调研并制定计划..."
                                : isPlanReady
                                    ? "计划已就绪，确认后开始执行"
                                    : "规划你的项目"}
                        </span>
                    ) : null}
                    {planMode && isPlanReady && !isGenerating ? (
                        <button type="button" className={composer.modeApproveButton} onClick={onApprovePlan}>
                            执行计划
                        </button>
                    ) : null}
                </div>
                <div className={composer.composerTextareaWrap}>
                    <textarea
                        className={`${composer.composerTextarea} ${isExpanded ? composer.composerTextareaExpanded : ""}`}
                        placeholder={planMode ? "描述目标，制定详尽的规划..." : "输入消息、修改需求或粘贴上下文..."}
                        value={inputText}
                        onChange={(event) => setInputText(event.target.value)}
                        onKeyDown={(event) => {
                            if (isExpanded) {
                                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                                    event.preventDefault();
                                    onSend();
                                }
                                return;
                            }

                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                onSend();
                            }
                        }}
                    />
                    <button
                        type="button"
                        className={composer.composerExpandButton}
                        onClick={onToggleExpanded}
                        title={isExpanded ? "退出全屏输入" : "展开输入框"}
                        aria-label={isExpanded ? "退出全屏输入" : "展开输入框"}
                    >
                        <IconComposeExpand />
                    </button>
                </div>
                <div className={composer.inputBottomRow}>
                    <div className={composer.inputToolsScroller}>
                        <div className={composer.inputTools}>
                            <button
                                type="button"
                                className={enableReasoning ? composer.toolButtonActive : ""}
                                onClick={onToggleReasoning}
                                title="开启或关闭思考"
                            >
                                思考
                            </button>
                            <button
                                type="button"
                                className={composer.toolButton}
                                onClick={isSelectingBlocks ? onCancelBlockSelection : onStartBlockSelection}
                                title="选择积木片段"
                            >
                                {isSelectingBlocks ? "取消框选" : "选择积木"}
                            </button>
                            <button
                                type="button"
                                className={composer.toolButton}
                                onClick={() => fileInputRef.current?.click()}
                                title="导入本地附件"
                            >
                                添加文件
                            </button>
                        </div>
                    </div>
                    <div className={composer.inputComposerActions}>
                        {/* <div className={composer.inputHint}>
                            <span>{isExpanded ? "Ctrl+Enter 发送，Enter 换行" : "Enter 发送，Shift + Enter 换行"}</span>
                            <span className={composer.inputHintChevron}>
                                <img src={ChevronRightIcon} aria-hidden="true" alt="" />
                            </span>
                        </div> */}
                        {isGenerating ? (
                            <button
                                type="button"
                                onClick={onStopGenerating}
                                className={`${composer.primaryButton} ${isExpanded ? composer.expandedComposerSendButton : composer.iconButton} ${composer.stopButton}`}
                                title="停止生成"
                                aria-label="停止生成"
                            >
                                <img src={StopIcon} aria-hidden="true" alt="" />
                            </button>
                        ) : (
                            <div
                                type="button"
                                onClick={onSend}
                                className={`${composer.primaryButton} ${isExpanded ? composer.expandedComposerSendButton : composer.iconButton}`}
                                title={planMode ? "制定计划" : "发送"}
                                aria-label={planMode ? "制定计划" : "发送"}
                            >
                                <IconSend />
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {stats ? (
                <div className={composer.statsBar} title="最近一次请求统计">
                    {stats.tokensPerSecond !== undefined ? (
                        <span className={`${composer.statItem} ${composer.statPrimary}`}>
                            {stats.tokensPerSecond.toFixed(1)} tok/s
                        </span>
                    ) : stats.ttftMs !== undefined ? (
                        <span className={`${composer.statItem} ${composer.statPrimary}`}>
                            首 token {formatLatency(stats.ttftMs)}
                        </span>
                    ) : null}
                    {stats.contextUsedTokens !== undefined ? (
                        <span className={composer.statItem}>
                            {stats.contextWindow ? (
                                <ContextRing
                                    percent={(stats.contextUsedTokens / Math.max(1, stats.contextWindow)) * 100}
                                />
                            ) : null}
                            上下文 {formatCompactTokens(stats.contextUsedTokens)}
                            {stats.contextWindow ? ` / ${formatCompactTokens(stats.contextWindow)}` : ""}
                            {stats.contextWindow
                                ? ` (${Math.min(
                                    100,
                                    Math.round((stats.contextUsedTokens / Math.max(1, stats.contextWindow)) * 100),
                                )}%)`
                                : ""}
                        </span>
                    ) : null}
                    {stats.cacheHitPercent !== undefined ? (
                        <span className={composer.statItem}>缓存命中 {Math.round(stats.cacheHitPercent)}%</span>
                    ) : null}
                    {stats.outputTokens !== undefined ? (
                        <span className={composer.statItem}>输出 {formatCompactTokens(stats.outputTokens)} tok</span>
                    ) : null}
                    {stats.estimated ? <span className={composer.statEstimated}>估算</span> : null}
                </div>
            ) : null}
            <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,.json,.js,.ts,.tsx,.jsx,.css,.less,.html,.xml,.yaml,.yml,.csv,.log,.ucf,.docx,.xls,.xlsx,.xlsm,.xlsb,.ods"
                multiple
                className={composer.fileInput}
                onChange={handleFileChange}
            />
            {previewAttachment ? (
                <AttachmentPreviewModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
            ) : null}
        </div>
    );
};
