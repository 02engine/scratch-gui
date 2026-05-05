import * as React from "react";
import { scrollBlockIntoView } from "utils/block-helper";
import { Attachment } from "../types";

const findFirstUsableBlockId = (attachment: Attachment, vm: PluginContext["vm"]) => {
  const targetId = attachment.meta?.targetId || vm.editingTarget?.id;
  if (!targetId) return null;

  const target = vm.runtime.getTargetById(targetId);
  const blocks = target?.blocks?._blocks;
  if (!blocks) return null;

  const firstOpcodeLine = attachment.content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("//"));
  if (!firstOpcodeLine) return null;

  const opcode = firstOpcodeLine.split("|")[0].trim();
  const matchedBlock = Object.values(blocks).find((block: unknown) => {
    const typedBlock = block as { opcode?: string; topLevel?: boolean; id?: string } | undefined;
    return typedBlock?.opcode === opcode && typedBlock.topLevel;
  }) as { id?: string } | undefined;

  return matchedBlock?.id || null;
};

export const useAttachmentInteraction = (vm: PluginContext["vm"], workspace: Blockly.WorkspaceSvg) => {
  const previewBlockIdRef = React.useRef<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = React.useState<Attachment | null>(null);

  React.useEffect(() => {
    const handleTargetUpdate = () => {
      if (previewBlockIdRef.current && workspace) {
        const handler = () => {
          if (!previewBlockIdRef.current) return;
          const block = workspace.blockDB_[previewBlockIdRef.current];
          if (block) {
            previewBlockIdRef.current = null;
            scrollBlockIntoView(block, workspace);
          } else {
            requestAnimationFrame(handler);
          }
        };
        requestAnimationFrame(handler);
      }
    };

    vm.on("targetsUpdate", handleTargetUpdate);
    return () => {
      vm.off("targetsUpdate", handleTargetUpdate);
    };
  }, [vm, workspace]);

  const handleOpenAttachment = React.useCallback(
    (attachment: Attachment) => {
      console.log("[AI Assistant Jump][attachmentHook] handleOpenAttachment", {
        attachment,
        currentEditingTargetId: vm.editingTarget?.id,
      });

      if (attachment.kind !== "workspace-ucf" && attachment.kind !== "workspace-ucf-range") {
        setPreviewAttachment(attachment);
        return;
      }

      const targetId = attachment.meta?.targetId || vm.editingTarget?.id;
      const blockId =
        attachment.meta?.startBlockId || attachment.meta?.blockId || findFirstUsableBlockId(attachment, vm);

      console.log("[AI Assistant Jump][attachmentHook] resolved jump target", {
        targetId,
        blockId,
        attachmentMeta: attachment.meta,
      });

      if (!targetId || !blockId) {
        setPreviewAttachment(attachment);
        return;
      }

      if (workspace && vm.editingTarget && targetId === vm.editingTarget.id) {
        const block = workspace.blockDB_[blockId];
        if (block) {
          scrollBlockIntoView(block, workspace);
          return;
        }
      }

      previewBlockIdRef.current = blockId;
      vm.setEditingTarget(targetId);
    },
    [vm, workspace],
  );

  return {
    previewAttachment,
    setPreviewAttachment,
    handleOpenAttachment,
  };
};
