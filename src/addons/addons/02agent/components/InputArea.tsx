import * as React from "react";
import composer from "../ui/Composer.module.less";
import { parseLocalAttachment } from "../attachments";
import { Attachment } from "../types";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { getAttachmentDisplayName } from "../attachmentUtils";
import SendIcon from "assets/icon-send.svg";
import StopIcon from "assets/icon-stop.svg";
import ChevronRightIcon from "assets/icon-chevron-right.svg";
import ComposeExpandIcon from "assets/icon-compose-expand.svg";

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
  onOpenAttachment: (attachment: Attachment) => void;
  isGenerating: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  vm: PluginContext["vm"];
}

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
  onOpenAttachment,
  isGenerating,
  isExpanded,
  onToggleExpanded,
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
        <div className={composer.composerTextareaWrap}>
          <textarea
            className={`${composer.composerTextarea} ${isExpanded ? composer.composerTextareaExpanded : ""}`}
            placeholder="输入消息、修改需求或粘贴上下文..."
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
            <img src={ComposeExpandIcon} aria-hidden="true" alt="" />
          </button>
        </div>
        <div className={composer.inputBottomRow}>
          <div className={composer.inputToolsScroller}>
            <div className={composer.inputTools}>
              <button
                type="button"
                className={`${composer.toolButton} ${enableReasoning ? composer.toolButtonActive : ""}`}
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
            <div className={composer.inputHint}>
              <span>{isExpanded ? "Ctrl+Enter 发送，Enter 换行" : "Enter 发送，Shift + Enter 换行"}</span>
              <span className={composer.inputHintChevron}>
                <img src={ChevronRightIcon} aria-hidden="true" alt="" />
              </span>
            </div>
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
              <button
                type="button"
                onClick={onSend}
                className={`${composer.primaryButton} ${isExpanded ? composer.expandedComposerSendButton : composer.iconButton}`}
                title="发送"
                aria-label="发送"
              >
                <img src={SendIcon} aria-hidden="true" alt="" />
              </button>
            )}
          </div>
        </div>
      </div>
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
