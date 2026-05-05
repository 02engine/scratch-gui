import * as React from "react";
import styles from "../styles.less";
import { Attachment } from "../types";

interface AttachmentPreviewModalProps {
  attachment: Attachment;
  onClose: () => void;
}

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({ attachment, onClose }) => {
  return (
    <div className={styles.settingsModalOverlay} onClick={onClose}>
      <div className={styles.previewModal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{attachment.name}</h3>
        </div>
        <div className={styles.previewMeta}>
          <span>{attachment.kind}</span>
          <span>{attachment.mimeType || "unknown"}</span>
        </div>
        <pre className={styles.previewContent}>{attachment.preview || attachment.content}</pre>
        <button className={styles.closeBtn} onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
};
