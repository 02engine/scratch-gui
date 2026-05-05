import * as React from "react";
import { Attachment } from "../types";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";

interface AttachmentInteractionLayerProps {
  previewAttachment: Attachment | null;
  onClosePreview: () => void;
}

export const AttachmentInteractionLayer: React.FC<AttachmentInteractionLayerProps> = ({
  previewAttachment,
  onClosePreview,
}) => {
  if (!previewAttachment) {
    return null;
  }

  return <AttachmentPreviewModal attachment={previewAttachment} onClose={onClosePreview} />;
};
