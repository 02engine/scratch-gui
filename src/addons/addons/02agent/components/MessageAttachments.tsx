import * as React from "react";
import styles from "../styles.less";
import { Attachment } from "../types";
import { getAttachmentDisplayName } from "../attachmentUtils";

interface MessageAttachmentsProps {
  attachments: Attachment[];
  onOpenAttachment: (attachment: Attachment) => void;
  vm: PluginContext["vm"];
}

export const MessageAttachments: React.FC<MessageAttachmentsProps> = ({ attachments, onOpenAttachment, vm }) => {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  return (
    <div className={styles.messageAttachments}>
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className={`${styles.messageAttachment} ${
            attachment.kind === "workspace-ucf" || attachment.kind === "workspace-ucf-range"
              ? styles.blockAttachment
              : styles.fileAttachment
          }`}
        >
          <button
            className={styles.attachmentMainButton}
            onClick={() => {
              console.log("[AI Assistant Jump][MessageAttachments] clicked attachment", attachment);
              onOpenAttachment(attachment);
            }}
            title={getAttachmentDisplayName(attachment, vm)}
          >
            <span className={styles.attachmentBadge}>
              {attachment.kind === "workspace-ucf-range"
                ? "片段"
                : attachment.kind === "workspace-ucf"
                  ? "积木"
                  : "文件"}
            </span>
            <span className={styles.attachmentName}>{getAttachmentDisplayName(attachment, vm)}</span>
          </button>
          {(attachment.kind === "workspace-ucf" || attachment.kind === "workspace-ucf-range") && attachment.preview ? (
            <>
              <button
                className={styles.attachmentExpandButton}
                onClick={() => setExpandedId((prev) => (prev === attachment.id ? null : attachment.id))}
              >
                {expandedId === attachment.id ? "收起" : "展开"}
              </button>
              {expandedId === attachment.id ? (
                <pre className={styles.attachmentPreviewBlock}>{attachment.preview}</pre>
              ) : null}
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
};
