import { Attachment } from "./types";
import { scratchToUCF } from "./ucf";
import { getAttachmentDisplayName } from "./attachmentUtils";

const isSelectableBlock = (block: Blockly.BlockSvg) => {
  const isShadow = typeof (block as any).isShadow === "function" ? (block as any).isShadow() : Boolean((block as any).isShadow_);
  if (isShadow) return false;
  if (typeof (block as any).isInsertionMarker === "function" && (block as any).isInsertionMarker()) return false;
  return Boolean(block.svgPath_ || block.getSvgRoot?.());
};

const getSelectedBlocksFromRect = (workspace: Blockly.WorkspaceSvg, rect: DOMRect) => {
  const selectedBlocks: Blockly.BlockSvg[] = [];
  const seen = new Set<string>();

  for (const block of workspace.getAllBlocks().filter(isSelectableBlock) as Blockly.BlockSvg[]) {
    const svgPathRect = block.svgPath_?.getBoundingClientRect();
    const svgRect = svgPathRect || block.getSvgRoot()?.getBoundingClientRect();
    if (!svgRect) continue;

    const overlap = !(
      svgRect.right < rect.left ||
      svgRect.left > rect.right ||
      svgRect.bottom < rect.top ||
      svgRect.top > rect.bottom
    );

    if (!overlap) continue;
    if (seen.has(block.id)) continue;

    seen.add(block.id);
    selectedBlocks.push(block);
  }

  console.log(
    "[AI Assistant Range] rect hit blocks:",
    selectedBlocks.map((block) => ({
      id: block.id,
      opcode: block.type,
      parent: block.parentBlock_?.id || null,
      next: block.getNextBlock()?.id || null,
      rect: block.svgPath_?.getBoundingClientRect(),
    })),
  );

  return selectedBlocks;
};

const getTopBlockId = (block: Blockly.BlockSvg) => {
  let current = block;
  while (current.parentBlock_) {
    current = current.parentBlock_ as Blockly.BlockSvg;
  }
  return current.id;
};

const getContinuousChain = (workspace: Blockly.WorkspaceSvg, topBlockId: string) => {
  const chain: Blockly.BlockSvg[] = [];
  let current = workspace.getBlockById(topBlockId) as Blockly.BlockSvg | null;
  while (current) {
    chain.push(current);
    current = current.getNextBlock() as Blockly.BlockSvg | null;
  }
  return chain;
};

export const validateContinuousBlockRange = (workspace: Blockly.WorkspaceSvg, blocks: Blockly.BlockSvg[]) => {
  if (!blocks.length) {
    console.warn("[AI Assistant Range] validate failed: empty selection");
    return { valid: false, reason: "当前选择为空" };
  }

  const topBlockIds = Array.from(new Set(blocks.map(getTopBlockId)));
  console.log("[AI Assistant Range] top block ids:", topBlockIds);
  if (topBlockIds.length !== 1) {
    console.warn("[AI Assistant Range] validate failed: multiple top blocks", topBlockIds);
    return { valid: false, reason: "只能选择同一段代码中的积木" };
  }

  const chain = getContinuousChain(workspace, topBlockIds[0]);
  const rawSelectedIds = new Set(blocks.map((block) => block.id));
  const chainBlockIds = new Set(chain.map((block) => block.id));
  const selectedIds = new Set(blocks.map((block) => block.id).filter((id) => chainBlockIds.has(id)));
  console.log(
    "[AI Assistant Range] full chain:",
    chain.map((block, index) => ({
      index,
      id: block.id,
      opcode: block.type,
    })),
  );
  const selectedIndexes = chain
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => selectedIds.has(block.id))
    .map(({ index }) => index);

  console.log("[AI Assistant Range] selected indexes:", selectedIndexes);

  if (!selectedIndexes.length) {
    console.warn("[AI Assistant Range] validate failed: selected indexes empty");
    return { valid: false, reason: "当前选择为空" };
  }

  const minIndex = Math.min(...selectedIndexes);
  const maxIndex = Math.max(...selectedIndexes);
  const expectedIds = chain.slice(minIndex, maxIndex + 1).map((block) => block.id);

  console.log("[AI Assistant Range] expected continuous ids:", expectedIds);
  console.log("[AI Assistant Range] actual selected ids:", Array.from(rawSelectedIds));
  console.log("[AI Assistant Range] selected stack ids:", Array.from(selectedIds));

  if (expectedIds.length !== selectedIndexes.length || expectedIds.some((id) => !selectedIds.has(id))) {
    console.warn("[AI Assistant Range] validate failed: non-continuous selection");
    return { valid: false, reason: "只能选择连续相邻的积木" };
  }

  const rangeBlocks = chain.slice(minIndex, maxIndex + 1);
  console.log(
    "[AI Assistant Range] validated range blocks:",
    rangeBlocks.map((block) => ({
      id: block.id,
      opcode: block.type,
    })),
  );
  return {
    valid: true,
    blocks: rangeBlocks,
    topBlockId: topBlockIds[0],
    startBlockId: rangeBlocks[0].id,
    endBlockId: rangeBlocks[rangeBlocks.length - 1].id,
  };
};

export const createRangeAttachment = (
  vm: PluginContext["vm"],
  workspace: Blockly.WorkspaceSvg,
  rect: DOMRect,
): { attachment?: Attachment; reason?: string } => {
  console.log("[AI Assistant Range] createRangeAttachment rect:", {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  });
  if (!vm?.editingTarget?.blocks?._blocks) {
    return { reason: "02Agent 未找到当前角色的积木数据，请确认已切到代码标签页。" };
  }

  const selectedBlocks = getSelectedBlocksFromRect(workspace, rect);
  const validation = validateContinuousBlockRange(workspace, selectedBlocks);
  if (!validation.valid) {
    console.warn("[AI Assistant Range] create attachment failed:", validation.reason);
    return { reason: validation.reason };
  }

  const requiredBlockIds = new Set<string>();
  const collectReferencedBlocks = (blockId: string) => {
    if (!blockId || requiredBlockIds.has(blockId)) return;
    requiredBlockIds.add(blockId);

    const runtimeBlock = vm.editingTarget.blocks._blocks[blockId];
    if (!runtimeBlock?.inputs) return;

    Object.values(runtimeBlock.inputs).forEach((input: any) => {
      if (input.block) {
        collectReferencedBlocks(input.block);
      }
      if (input.shadow) {
        collectReferencedBlocks(input.shadow);
      }
    });
  };

  validation.blocks.forEach((block) => {
    collectReferencedBlocks(block.id);
  });

  console.log("[AI Assistant Range] required block ids:", Array.from(requiredBlockIds));

  const selectedOrderMap = new Map(validation.blocks.map((block, index) => [block.id, index]));
  const isWithinSelectedRange = (blockId?: string | null) => Boolean(blockId && selectedOrderMap.has(blockId));

  const serializedBlocks = Array.from(requiredBlockIds).map((blockId) => {
    const runtimeBlock = vm.editingTarget.blocks._blocks[blockId];
    const selectedIndex = selectedOrderMap.get(blockId);
    const isSelectedChainBlock = selectedIndex !== undefined;
    const nextSelectedBlockId =
      isSelectedChainBlock && selectedIndex < validation.blocks.length - 1
        ? validation.blocks[selectedIndex + 1].id
        : null;

    return {
      ...runtimeBlock,
      topLevel: selectedIndex === 0,
      parent: isSelectedChainBlock
        ? selectedIndex === 0
          ? null
          : validation.blocks[selectedIndex - 1].id
        : isWithinSelectedRange(runtimeBlock.parent)
          ? runtimeBlock.parent
          : null,
      next: isSelectedChainBlock
        ? nextSelectedBlockId
        : isWithinSelectedRange(runtimeBlock.next)
          ? runtimeBlock.next
          : null,
    };
  });

  console.log(
    "[AI Assistant Range] serialized blocks:",
    serializedBlocks.map((block) => ({
      id: block.id,
      opcode: block.opcode,
      parent: block.parent || null,
      next: block.next || null,
      topLevel: Boolean(block.topLevel),
      inputs: block.inputs,
      shadow: Boolean(block.shadow),
    })),
  );

  const content = scratchToUCF(serializedBlocks, { runtime: vm.runtime, includeBlockIds: true });
  console.log("[AI Assistant Range] generated UCF:\n" + content);
  const attachment: Attachment = {
    id: `${Date.now()}-${validation.startBlockId}`,
    name: "workspace-ucf-range",
    kind: "workspace-ucf-range",
    mimeType: "text/plain",
    content,
    preview: content,
    meta: {
      source: "workspace-range",
      targetId: vm.editingTarget?.id,
      startBlockId: validation.startBlockId,
      endBlockId: validation.endBlockId,
      topBlockId: validation.topBlockId,
      selectedBlockIds: validation.blocks.map((block) => block.id),
      blockCount: validation.blocks.length,
      blockId: validation.startBlockId,
    },
  };
  attachment.name = getAttachmentDisplayName(attachment, vm);
  return { attachment };
};
