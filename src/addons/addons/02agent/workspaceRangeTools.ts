import { scratchToUCF, ucfToScratch } from "./ucf";
import { normalizeModelUCF, toAnnotatedUCF } from "./annotatedUcf";
import { cloneBlockMap, validateBlockGraph, validateRuntimeBroadcastBlocks, validateSerializedBroadcastSchema } from "./blockGraph";

declare const require: any;

const getScratchBlocks = () => (window as any).ScratchBlocks || window.Blockly;
const LARGE_SCRIPT_BLOCK_THRESHOLD = 120;

const setBlocklyEventGroup = (grouped: boolean) => {
  const events = getScratchBlocks()?.Events;
  if (typeof events?.setGroup !== "function") return;
  try {
    events.setGroup(grouped);
  } catch (error) {
    console.warn("[02Agent] Failed to set Blockly event group", error);
  }
};

const resolveTargetForRange = (vm: PluginContext["vm"], startBlockId: string, endBlockId: string) => {
  const target = vm.runtime.targets.find((item) => {
    const blocks = item.blocks?._blocks;
    return blocks && blocks[startBlockId] && blocks[endBlockId];
  });
  return target || null;
};

const getBlockStateById = (target: Scratch.RenderTarget | null, blockId: string) => {
  if (!target?.blocks?._blocks) return null;
  return target.blocks._blocks[blockId] || null;
};

const getTopBlockIdFromState = (target: Scratch.RenderTarget | null, blockId: string) => {
  let current = getBlockStateById(target, blockId);
  while (current?.parent) {
    current = getBlockStateById(target, current.parent);
  }
  return current?.id || null;
};

const getContinuousChainFromState = (target: Scratch.RenderTarget | null, topBlockId: string) => {
  const chain: any[] = [];
  let current = getBlockStateById(target, topBlockId);
  while (current) {
    chain.push(current);
    current = current.next ? getBlockStateById(target, current.next) : null;
  }
  return chain;
};

const getScriptBoundaryIds = (target: Scratch.RenderTarget | null, scriptId: string) => {
  const topBlockId = getTopBlockIdFromState(target, scriptId);
  if (!topBlockId || topBlockId !== scriptId) {
    return { success: false, error: "Script not found or is not a top-level script" };
  }

  const chain = getContinuousChainFromState(target, topBlockId);
  if (!chain.length) {
    return { success: false, error: "Script chain is empty" };
  }

  return {
    success: true,
    startBlockId: chain[0].id,
    endBlockId: chain[chain.length - 1].id,
    blockCount: chain.length,
  };
};

const collectRangeRuntimeBlocks = (target: Scratch.RenderTarget | null, selectedBlocks: any[]) => {
  const requiredBlockIds = new Set<string>();

  const collectReferencedBlocks = (blockId: string) => {
    if (!blockId || requiredBlockIds.has(blockId)) return;
    requiredBlockIds.add(blockId);
    const runtimeBlock = getBlockStateById(target, blockId);
    if (!runtimeBlock?.inputs) return;

    Object.values(runtimeBlock.inputs).forEach((input: any) => {
      if (input.block) collectReferencedBlocks(input.block);
      if (input.shadow) collectReferencedBlocks(input.shadow);
    });
  };

  selectedBlocks.forEach((block) => collectReferencedBlocks(block.id));
  const selectedOrderMap = new Map(selectedBlocks.map((block, index) => [block.id, index]));
  const isWithinSelectedRange = (blockId?: string | null) => Boolean(blockId && selectedOrderMap.has(blockId));

  return Array.from(requiredBlockIds).map((blockId) => {
    const runtimeBlock = getBlockStateById(target, blockId);
    const selectedIndex = selectedOrderMap.get(blockId);
    const isSelectedChainBlock = selectedIndex !== undefined;
    const nextSelectedBlockId =
      isSelectedChainBlock && selectedIndex < selectedBlocks.length - 1 ? selectedBlocks[selectedIndex + 1].id : null;

    return {
      ...runtimeBlock,
      topLevel: selectedIndex === 0,
      parent: isSelectedChainBlock
        ? selectedIndex === 0
          ? null
          : selectedBlocks[selectedIndex - 1].id
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
};

const getRangeBlocks = (target: Scratch.RenderTarget | null, startBlockId: string, endBlockId: string) => {
  const topBlockId = getTopBlockIdFromState(target, startBlockId);
  if (!topBlockId) {
    return { success: false, error: "Range blocks not found" };
  }

  const chain = getContinuousChainFromState(target, topBlockId);
  const startIndex = chain.findIndex((block) => block.id === startBlockId);
  const endIndex = chain.findIndex((block) => block.id === endBlockId);

  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
    return { success: false, error: "Invalid range order" };
  }

  return {
    success: true,
    rangeBlocks: chain.slice(startIndex, endIndex + 1),
  };
};

const escapeXml = (value: unknown) =>
  String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const mutationToXml = (mutation: Record<string, any>) => {
  const tagName = mutation.tagName || "mutation";
  const attributes = Object.entries(mutation)
    .filter(([key]) => key !== "children" && key !== "tagName")
    .map(([key, value]) => {
      const normalizedValue = key === "blockInfo" ? JSON.stringify(value) : value;
      return ` ${key}="${escapeXml(normalizedValue)}"`;
    })
    .join("");
  const children = Array.isArray(mutation.children)
    ? mutation.children.map((item) => mutationToXml(item)).join("")
    : "";
  return `<${tagName}${attributes}>${children}</${tagName}>`;
};

const blockStateToXml = (blockId: string, blocksMap: Map<string, any>) => {
  const block = blocksMap.get(blockId);
  if (!block) return "";

  const tagName = block.shadow ? "shadow" : "block";
  const position =
    block.topLevel && typeof block.x !== "undefined" && typeof block.y !== "undefined"
      ? ` x="${escapeXml(block.x)}" y="${escapeXml(block.y)}"`
      : "";

  let xml = `<${tagName} id="${escapeXml(block.id)}" type="${escapeXml(block.opcode)}"${position}>`;

  if (block.mutation) {
    xml += mutationToXml(block.mutation);
  }

  if (typeof block.commentText === "string" && block.commentText.trim()) {
    const width = Number(block.commentWidth) || 200;
    const height = Number(block.commentHeight) || 160;
    xml += `<comment pinned="false" h="${escapeXml(height)}" w="${escapeXml(width)}">${escapeXml(
      block.commentText,
    )}</comment>`;
  }

  Object.values(block.inputs || {}).forEach((input: any) => {
    if (!input?.block && !input?.shadow) return;
    xml += `<value name="${escapeXml(input.name)}">`;
    if (input.block) {
      xml += blockStateToXml(input.block, blocksMap);
    }
    if (input.shadow && input.shadow !== input.block) {
      xml += blockStateToXml(input.shadow, blocksMap);
    }
    xml += "</value>";
  });

  Object.values(block.fields || {}).forEach((field: any) => {
    xml += `<field name="${escapeXml(field.name)}"`;
    if (field.id) {
      xml += ` id="${escapeXml(field.id)}"`;
    }
    if (typeof field.variableType === "string") {
      xml += ` variabletype="${escapeXml(field.variableType)}"`;
    }
    xml += `>${escapeXml(field.value ?? "")}</field>`;
  });

  if (block.next) {
    xml += `<next>${blockStateToXml(block.next, blocksMap)}</next>`;
  }

  xml += `</${tagName}>`;
  return xml;
};

const blockStatesToXml = (blocksState: any[]) => {
  const blocksMap = new Map(blocksState.map((blockState) => [blockState.id, blockState]));
  const topLevelBlocks = blocksState.filter((blockState) => blockState.topLevel);
  return `<xml xmlns="http://www.w3.org/1999/xhtml">${topLevelBlocks
    .map((blockState) => blockStateToXml(blockState.id, blocksMap))
    .join("")}</xml>`;
};

const getTargetVariables = (target: any) => Object.values(target?.variables || {}) as any[];

const repairListVariableValue = (target: any, variable: any) => {
  if (!target || !variable || variable.type !== "list" || Array.isArray(variable.value)) {
    return null;
  }

  const repairedValue =
    variable.value === undefined || variable.value === null || variable.value === "" ? [] : [variable.value];
  const previousValue = variable.value;
  variable.value = repairedValue;
  if ("_value" in variable) {
    variable._value = repairedValue;
  }
  if ("_monitorUpToDate" in variable) {
    variable._monitorUpToDate = false;
  }

  return {
    targetId: target.id,
    variableId: variable.id,
    name: variable.name,
    previousValue,
    repairedValue,
  };
};

export const repairListVariableValues = (vm: PluginContext["vm"], targetId?: string) => {
  const targets = targetId
    ? [vm.runtime?.getTargetById?.(targetId)].filter(Boolean)
    : Array.isArray(vm.runtime?.targets)
      ? vm.runtime.targets
      : [];
  const repairs: any[] = [];

  targets.forEach((target: any) => {
    getTargetVariables(target).forEach((variable) => {
      const repair = repairListVariableValue(target, variable);
      if (repair) {
        repairs.push(repair);
      }
    });
  });

  return repairs;
};

export const resolveVariableReferences = (
  vm: PluginContext["vm"],
  workspace: Blockly.WorkspaceSvg,
  blocksState: any[],
  targetOverride: any = null,
  options: { commit?: boolean; repairLists?: boolean; syncWorkspace?: boolean } = {},
) => {
  const createScratchFieldId = () =>
    window.Blockly?.Utils?.genUid?.() || `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const target = targetOverride || vm.editingTarget;
  const commit = options.commit !== false;
  const runtimeTargets = Array.isArray(vm.runtime?.targets) ? vm.runtime.targets : [];
  const stageTarget = runtimeTargets.find((item: any) => item?.isStage) || target;
  if (commit && options.repairLists !== false) repairListVariableValues(vm, target?.id);

  const existingVariables = [
    ...runtimeTargets.flatMap((runtimeTarget: any) =>
      getTargetVariables(runtimeTarget).map((item: any) => ({
        id: item.id,
        name: item.name,
        type: item.type || "",
        source: "runtime",
        target: runtimeTarget,
        variable: item,
      })),
    ),
    ...(workspace?.getAllVariables?.() || []).map((item: any) => ({
      id: item.id_ || item.id,
      name: item.name,
      type: item.type || "",
      source: "workspace",
      target: null,
      variable: item,
    })),
  ];

  const variableMatchesScope = (item: any, scope: string) => {
    if (scope === "local") return item.source === "runtime" && item.target?.id === target?.id;
    if (scope === "global") return item.source === "runtime" && Boolean(item.target?.isStage);
    return true;
  };

  const createStableVariableId = (name: string, type: string, scope: string) => {
    const rawBase = String(name || "").trim() || createScratchFieldId();
    const base = scope === "local" ? `${target?.id || "sprite"}:local:${rawBase}` : rawBase;
    const conflictingVariable = existingVariables.find((item) => item.id === base && (item.name !== name || item.type !== type));
    if (!conflictingVariable) return base;

    const suffix = type === "list" ? "list" : type === "broadcast_msg" ? "broadcast" : "var";
    let index = 2;
    let nextId = `${base}-${suffix}`;
    while (existingVariables.some((item) => item.id === nextId && (item.name !== name || item.type !== type))) {
      nextId = `${base}-${suffix}-${index}`;
      index += 1;
    }
    return nextId;
  };

  const ensureWorkspaceVariable = (id: string, name: string, type: string, scope: string) => {
    if (!workspace || options.syncWorkspace === false) return;
    try {
      const existingById =
        typeof (workspace as any).getVariableById === "function" ? (workspace as any).getVariableById(id) : null;
      if (existingById) return;

      const existingByName =
        typeof (workspace as any).getVariable === "function" ? (workspace as any).getVariable(name, type) : null;
      if (existingByName && scope !== "local") return;

      if (typeof (workspace as any).createVariable === "function") {
        (workspace as any).createVariable(name, type, id);
      }
    } catch (error) {
      console.warn("[AI Assistant] Failed to ensure workspace variable", { id, name, type, error });
    }
  };

  const ensureRuntimeVariable = (id: string, name: string, type: string, scope: string) => {
    let variableRecord = existingVariables.find((item) =>
      item.id === id && item.type === type && variableMatchesScope(item, scope));
    if (!variableRecord) {
      variableRecord = existingVariables.find((item) =>
        item.name === name && item.type === type && variableMatchesScope(item, scope));
    }
    if (variableRecord?.source === "runtime") {
      if (type === "list" && commit && options.repairLists !== false) {
        repairListVariableValue(variableRecord.target, variableRecord.variable);
      }
      if (commit) ensureWorkspaceVariable(variableRecord.id, variableRecord.name, type, scope);
      return variableRecord;
    }

    const ownerTarget = type === "broadcast_msg" ? stageTarget : scope === "local" ? target : stageTarget || target;
    let variable = getTargetVariables(ownerTarget).find((item) => item.id === id || (item.name === name && item.type === type));
    if (!variable && commit) {
      ownerTarget?.createVariable(id, name, type, false);
      variable = ownerTarget?.variables?.[id] || getTargetVariables(ownerTarget).find((item) => item.id === id);
    }
    if (type === "list" && commit && options.repairLists !== false) {
      repairListVariableValue(ownerTarget, variable);
    }
    if (commit) ensureWorkspaceVariable(id, name, type, scope);
    existingVariables.push({
      id,
      name,
      type,
      source: "runtime",
      target: ownerTarget,
      variable,
    });
    return existingVariables[existingVariables.length - 1];
  };

  const findVariableReference = (nameOrId: string, type: string, scope: string) => {
    const byName = existingVariables.find((item) =>
      item.name === nameOrId && item.type === type && variableMatchesScope(item, scope));
    if (byName) return byName;

    const byId = existingVariables.find((item) =>
      item.id === nameOrId && item.type === type && variableMatchesScope(item, scope));
    if (byId) return byId;

    return null;
  };

  const normalizeVariableField = (field: any) => {
    const variableType = field.variableType === "broadcast_msg"
      ? "broadcast_msg"
      : field.name === "VARIABLE" ? "" : "list";
    const requestedScope = field.scope === "local" ? "local" : field.scope === "global" ? "global" : "auto";
    const requestedName = String(field.value || "").trim();
    if (!requestedName) {
      return;
    }

    const requestedId = typeof field.id === "string" ? field.id : "";
    const existingVariable = (requestedId && findVariableReference(requestedId, variableType, requestedScope)) ||
      findVariableReference(requestedName, variableType, requestedScope);
    if (existingVariable) {
      field.id = existingVariable.id;
      field.value = existingVariable.name;
      field.variableType = variableType;
      ensureRuntimeVariable(existingVariable.id, existingVariable.name, variableType, requestedScope);
      return;
    }

    const fieldId = requestedId || createStableVariableId(requestedName, variableType, requestedScope);
    field.id = fieldId;
    field.value = requestedName;
    field.variableType = variableType;
    ensureRuntimeVariable(fieldId, requestedName, variableType, requestedScope);
  };

  blocksState.forEach((blockState) => {
    Object.values(blockState.fields || {}).forEach((field: any) => {
      if (field.name !== "VARIABLE" && field.name !== "LIST" && field.name !== "LIST_MENU" && field.variableType !== "broadcast_msg") return;
      normalizeVariableField(field);
    });
  });
};

const collectTopLevelBlockIds = (workspace: Blockly.WorkspaceSvg) =>
  workspace
    .getTopBlocks(false)
    .map((block) => block.id)
    .sort();

const buildFailureResult = (error: string, stage: string, diagnostics: Record<string, unknown> = {}) => ({
  success: false,
  error,
  stage,
  diagnostics,
});

const collectRuntimeSubtreeBlockIds = (target: Scratch.RenderTarget | null, blockId: string, result = new Set<string>()) => {
  if (!target?.blocks?._blocks || !blockId || result.has(blockId)) return result;
  const block = target.blocks._blocks[blockId];
  if (!block) return result;
  result.add(blockId);
  Object.values(block.inputs || {}).forEach((input: any) => {
    if (input?.block) collectRuntimeSubtreeBlockIds(target, input.block, result);
    if (input?.shadow) collectRuntimeSubtreeBlockIds(target, input.shadow, result);
  });
  if (block.next) collectRuntimeSubtreeBlockIds(target, block.next, result);
  return result;
};

const removeRuntimeScriptBlocks = (target: Scratch.RenderTarget, topBlockId: string) => {
  const targetBlocks = target.blocks as any;
  const blockIds = collectRuntimeSubtreeBlockIds(target, topBlockId);
  const removedComments: string[] = [];

  blockIds.forEach((blockId) => {
    const block = targetBlocks._blocks?.[blockId];
    if (block?.comment && target.comments?.[block.comment]) {
      delete target.comments[block.comment];
      removedComments.push(block.comment);
    }
  });
  Object.entries(target.comments || {}).forEach(([commentId, comment]: [string, any]) => {
    if (comment?.blockId && blockIds.has(comment.blockId)) {
      delete target.comments[commentId];
      removedComments.push(commentId);
    }
  });
  blockIds.forEach((blockId) => {
    delete targetBlocks._blocks[blockId];
  });
  if (Array.isArray(targetBlocks._scripts)) {
    targetBlocks._scripts = targetBlocks._scripts.filter((scriptId: string) => scriptId !== topBlockId);
  }
  targetBlocks.resetCache?.();
  return { removedBlockIds: [...blockIds], removedComments };
};

const insertRuntimeBlocks = (target: Scratch.RenderTarget, blocksState: any[]) => {
  const targetBlocks = target.blocks as any;
  const insertedBlockIds: string[] = [];
  const insertedCommentIds: string[] = [];

  blocksState.forEach((blockState) => {
    const block = {
      ...blockState,
      fields: { ...(blockState.fields || {}) },
      inputs: { ...(blockState.inputs || {}) },
    };
    delete block.commentText;
    delete block.commentWidth;
    delete block.commentHeight;
    targetBlocks._blocks[block.id] = block;
    insertedBlockIds.push(block.id);
  });

  blocksState.forEach((blockState) => {
    if (typeof blockState.commentText !== "string" || !blockState.commentText.trim()) return;
    const commentId = `comment-${blockState.id}`;
    const width = Number(blockState.commentWidth) || 200;
    const height = Number(blockState.commentHeight) || 160;
    const x = Number(blockState.x || 0) + 32;
    const y = Number(blockState.y || 0) + 32;
    target.createComment?.(commentId, blockState.id, blockState.commentText, x, y, width, height, false);
    insertedCommentIds.push(commentId);
  });

  const topLevelBlocks = blocksState.filter((blockState) => blockState.topLevel);
  if (Array.isArray(targetBlocks._scripts)) {
    topLevelBlocks.forEach((blockState) => {
      if (!targetBlocks._scripts.includes(blockState.id)) targetBlocks._scripts.push(blockState.id);
      if (targetBlocks._blocks[blockState.id]) targetBlocks._blocks[blockState.id].topLevel = true;
    });
  }
  targetBlocks.resetCache?.();
  target.blocks.updateTargetSpecificBlocks?.(Boolean(target.isStage));
  return { insertedBlockIds, insertedCommentIds };
};

const refreshWorkspaceAfterRuntimeWrite = async (vm: PluginContext["vm"], target: Scratch.RenderTarget) => {
  if (vm.editingTarget?.id !== target.id) {
    vm.setEditingTarget(target.id);
    await new Promise((resolve) => window.setTimeout(resolve, 60));
  }
  try {
    const stageTarget = vm.runtime?.getTargetForStage?.();
    const broadcastVariables = stageTarget
      ? Object.fromEntries(Object.entries(stageTarget.variables || {}).filter(([, variable]: [string, any]) => variable?.type === "broadcast_msg"))
      : {};
    vm.emitWorkspaceUpdate?.();
    // Scratch's workspace serializer removes unreferenced broadcasts as a cleanup side effect.
    // Agent edits must never delete project data that was not part of the patch.
    if (stageTarget) Object.entries(broadcastVariables).forEach(([id, variable]) => {
      if (!stageTarget.variables[id]) stageTarget.variables[id] = variable;
    });
  } catch (error) {
    console.warn("[02Agent] Runtime blocks were written but workspace refresh failed", error);
    return error instanceof Error ? error.message : String(error);
  }
  vm.emitTargetsUpdate?.(false);
  vm.runtime?.emitProjectChanged?.();
  return null;
};

const syncLargeScriptDirectly = async (
  vm: PluginContext["vm"],
  target: Scratch.RenderTarget,
  oldTopBlockId: string | null,
  blocksState: any[],
  operation: "insert" | "replace",
) => {
  const topLevelBlocks = blocksState.filter((blockState) => blockState.topLevel);
  if (topLevelBlocks.length !== 1) {
    return buildFailureResult("Runtime-direct sync requires exactly one top-level stack", "validate_direct_topology", {
      targetId: target.id,
      topLevelBlockCount: topLevelBlocks.length,
    });
  }

  const removed = oldTopBlockId ? removeRuntimeScriptBlocks(target, oldTopBlockId) : { removedBlockIds: [], removedComments: [] };
  const inserted = insertRuntimeBlocks(target, blocksState);
  repairListVariableValues(vm, target.id);
  const refreshError = await refreshWorkspaceAfterRuntimeWrite(vm, target);

  return {
    success: true,
    syncMode: "vm-direct",
    operation,
    targetId: target.id,
    insertedTopBlockId: topLevelBlocks[0].id,
    blockCount: blocksState.length,
    removedBlockCount: removed.removedBlockIds.length,
    insertedBlockCount: inserted.insertedBlockIds.length,
    commentCount: inserted.insertedCommentIds.length,
    workspaceRefreshWarning: refreshError || undefined,
  };
};

const applyBlockCommentsToWorkspace = (workspace: Blockly.WorkspaceSvg, blocksState: any[]) => {
  blocksState.forEach((blockState) => {
    if (typeof blockState.commentText !== "string" || !blockState.commentText.trim()) return;
    const block = workspace.getBlockById(blockState.id) as any;
    if (!block) return;

    if (typeof block.setCommentText === "function") {
      block.setCommentText(blockState.commentText);
    } else if (block.comment && typeof block.comment.setText === "function") {
      block.comment.setText(blockState.commentText);
    }
  });
};

export const getBlocksRangeUCF = (
  vm: PluginContext["vm"],
  _workspace: Blockly.WorkspaceSvg,
  startBlockId: string,
  endBlockId: string,
) => {
  const target = resolveTargetForRange(vm, startBlockId, endBlockId);
  const result = getRangeBlocks(target, startBlockId, endBlockId);
  if (!result.success) {
    return result;
  }

  const blocksArray = collectRangeRuntimeBlocks(target, result.rangeBlocks);
  return {
    success: true,
    ucf: toAnnotatedUCF([
      {
        blocks: blocksArray,
        statementBlockIds: result.rangeBlocks.map((block) => block.id),
      },
    ], vm.runtime),
    blockCount: result.rangeBlocks.length,
    startBlockId,
    endBlockId,
  };
};

export const replaceBlocksRangeByUCF = async (
  vm: PluginContext["vm"],
  _workspace: Blockly.WorkspaceSvg,
  startBlockId: string,
  endBlockId: string,
  ucfString: string,
  options: { includeComments?: boolean; linkTopLevelStatements?: boolean } = {},
) => {
  const target = resolveTargetForRange(vm, startBlockId, endBlockId);
  console.log("[AI Assistant Range Replace] resolved runtime target", {
    startBlockId,
    endBlockId,
    targetId: target?.id || null,
    editingTargetId: vm.editingTarget?.id || null,
  });
  if (!target) {
    return buildFailureResult("Range blocks not found in runtime targets", "resolve_target", {
      startBlockId,
      endBlockId,
    });
  }

  let switchedTarget = false;
  if (vm.editingTarget?.id !== target.id) {
    console.log("[AI Assistant Range Replace] switching editing target", { from: vm.editingTarget?.id, to: target.id });
    vm.setEditingTarget(target.id);
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    switchedTarget = true;
  }

  const workspace = switchedTarget
    ? (window.Blockly.getMainWorkspace() as Blockly.WorkspaceSvg)
    : _workspace || (window.Blockly.getMainWorkspace() as Blockly.WorkspaceSvg);
  const topLevelBefore = collectTopLevelBlockIds(workspace);

  const startBlock = workspace.getBlockById(startBlockId) as Blockly.BlockSvg | null;
  const endBlock = workspace.getBlockById(endBlockId) as Blockly.BlockSvg | null;
  if (!startBlock || !endBlock) {
    return buildFailureResult("Range blocks not found in current workspace", "resolve_workspace_blocks", {
      startBlockId,
      endBlockId,
      hasStartBlock: Boolean(startBlock),
      hasEndBlock: Boolean(endBlock),
    });
  }

  const previousBlockId = startBlock.previousConnection?.targetConnection?.sourceBlock_?.id || null;
  const nextBlockId = endBlock.nextConnection?.targetConnection?.sourceBlock_?.id || null;
  const startXY = startBlock.getRelativeToSurfaceXY();

  const blocksToDelete: Blockly.BlockSvg[] = [];
  let collecting: Blockly.BlockSvg | null = startBlock;
  while (collecting) {
    blocksToDelete.push(collecting);
    if (collecting.id === endBlockId) break;
    collecting = collecting.getNextBlock() as Blockly.BlockSvg | null;
  }
  if (!blocksToDelete.length || blocksToDelete[blocksToDelete.length - 1]?.id !== endBlockId) {
    return buildFailureResult("Selected range is not a continuous next-chain in workspace", "resolve_range", {
      startBlockId,
      endBlockId,
      visitedBlockIds: blocksToDelete.map((block) => block.id),
      breakAtBlockId: blocksToDelete[blocksToDelete.length - 1]?.id || null,
    });
  }

  try {
    const newBlocksState = ucfToScratch(normalizeModelUCF(ucfString), {
      runtime: vm.runtime,
      includeComments: options.includeComments === true,
      linkTopLevelStatements: options.linkTopLevelStatements === true,
    });
    if (!newBlocksState.length) {
      return buildFailureResult("Replacement UCF produced no blocks", "parse_replacement", {
        startBlockId,
        endBlockId,
      });
    }
    const topLevelBlocks = newBlocksState.filter((blockState) => blockState.topLevel);
    if (topLevelBlocks.length !== 1) {
      return buildFailureResult(
        "Replacement UCF must contain exactly one top-level stack",
        "validate_replacement_topology",
        {
          startBlockId,
          endBlockId,
          topLevelBlockCount: topLevelBlocks.length,
        },
      );
    }
    const topLevelBlockState = topLevelBlocks[0];
    topLevelBlockState.x = startXY.x;
    topLevelBlockState.y = startXY.y;
    resolveVariableReferences(vm, workspace, newBlocksState);
    const xmlText = blockStatesToXml(newBlocksState);

    setBlocklyEventGroup(true);

    console.log("[AI Assistant Range Replace] before delete", {
      startBlockId,
      endBlockId,
      blocksToDelete: blocksToDelete.map((block) => block.id),
      previousBlockId,
      nextBlockId,
    });

    if (startBlock.previousConnection?.isConnected()) {
      startBlock.previousConnection.disconnect();
    }
    if (endBlock.nextConnection?.isConnected()) {
      endBlock.nextConnection.disconnect();
    }
    startBlock.dispose(false, true);

    console.log("[AI Assistant Range Replace] after delete", {
      remainingStart: workspace.getBlockById(startBlockId)?.id || null,
      remainingEnd: workspace.getBlockById(endBlockId)?.id || null,
    });

    const xmlDom = window.Blockly.Xml.textToDom(xmlText);
    window.Blockly.Xml.domToWorkspace(xmlDom, workspace);
    applyBlockCommentsToWorkspace(workspace, newBlocksState);
    repairListVariableValues(vm, target.id);

    let insertedBlock = workspace.getBlockById(topLevelBlockState.id) as Blockly.BlockSvg | null;
    if (!insertedBlock) {
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      insertedBlock = workspace.getBlockById(topLevelBlockState.id) as Blockly.BlockSvg | null;
    }
    if (!insertedBlock) {
      return buildFailureResult("Inserted block not found", "locate_inserted_block", {
        startBlockId,
        endBlockId,
        insertedTopBlockId: topLevelBlockState.id,
      });
    }

    let reconnectedPrevious = false;
    let reconnectedNext = false;
    const previousBlock = previousBlockId ? (workspace.getBlockById(previousBlockId) as Blockly.BlockSvg | null) : null;
    const nextBlock = nextBlockId ? (workspace.getBlockById(nextBlockId) as Blockly.BlockSvg | null) : null;

    if (
      previousBlock?.nextConnection &&
      insertedBlock.previousConnection &&
      previousBlock.nextConnection.checkType_(insertedBlock.previousConnection)
    ) {
      previousBlock.nextConnection.connect(insertedBlock.previousConnection);
      reconnectedPrevious = true;
    }

    let lastInsertedBlock = insertedBlock;
    while (lastInsertedBlock.getNextBlock()) {
      lastInsertedBlock = lastInsertedBlock.getNextBlock() as Blockly.BlockSvg;
    }

    if (
      nextBlock?.previousConnection &&
      lastInsertedBlock.nextConnection &&
      lastInsertedBlock.nextConnection.checkType_(nextBlock.previousConnection)
    ) {
      lastInsertedBlock.nextConnection.connect(nextBlock.previousConnection);
      reconnectedNext = true;
    }

    console.log("[AI Assistant Range Replace] reconnect result", {
      insertedTopBlockId: insertedBlock.id,
      lastInsertedBlockId: lastInsertedBlock.id,
      reconnectedPrevious,
      reconnectedNext,
    });

    const requiresPreviousReconnect = Boolean(previousBlockId);
    const requiresNextReconnect = Boolean(nextBlockId);
    if ((requiresPreviousReconnect && !reconnectedPrevious) || (requiresNextReconnect && !reconnectedNext)) {
      insertedBlock.dispose(false, true);
      return buildFailureResult(
        "Replacement inserted new blocks but failed to reconnect the range boundaries safely",
        "reconnect_boundaries",
        {
          startBlockId,
          endBlockId,
          previousBlockId,
          nextBlockId,
          insertedTopBlockId: insertedBlock.id,
          lastInsertedBlockId: lastInsertedBlock.id,
          reconnectedPrevious,
          reconnectedNext,
          visitedDeletedBlockIds: blocksToDelete.map((block) => block.id),
        },
      );
    }

    const topLevelAfter = collectTopLevelBlockIds(workspace);
    const orphanTopLevelBlockIds = topLevelAfter.filter(
      (blockId) => !topLevelBefore.includes(blockId) && blockId !== insertedBlock?.id,
    );

    if (orphanTopLevelBlockIds.length > 0) {
      insertedBlock.dispose(false, true);
      return buildFailureResult(
        "Replacement created unexpected top-level orphan blocks",
        "validate_workspace_after_replace",
        {
          startBlockId,
          endBlockId,
          insertedTopBlockId: insertedBlock.id,
          orphanTopLevelBlockIds,
          topLevelBefore,
          topLevelAfter,
        },
      );
    }

    return {
      success: true,
      insertedTopBlockId: insertedBlock.id,
      blockCount: newBlocksState.length,
      reconnectedPrevious,
      reconnectedNext,
      diagnostics: {
        previousBlockId,
        nextBlockId,
        lastInsertedBlockId: lastInsertedBlock.id,
        orphanTopLevelBlockIds,
        topLevelBefore,
        topLevelAfter,
      },
    };
  } catch (error) {
    return buildFailureResult(error instanceof Error ? error.message : "Failed to replace block range", "exception", {
      startBlockId,
      endBlockId,
    });
  } finally {
    setBlocklyEventGroup(false);
  }
};

export const replaceScriptByUCF = async (
  vm: PluginContext["vm"],
  workspace: Blockly.WorkspaceSvg,
  scriptId: string,
  ucfString: string,
  options: { includeComments?: boolean } = {},
) => {
  const target = vm.runtime.targets.find((item) => item.blocks?._blocks?.[scriptId]) || null;
  if (!target) {
    return buildFailureResult("Script not found in runtime targets", "resolve_script_target", { scriptId });
  }

  const boundary = getScriptBoundaryIds(target, scriptId);
  if (!boundary.success) {
    return buildFailureResult(boundary.error, "resolve_script_boundaries", {
      scriptId,
      targetId: target.id,
    });
  }

  let parsedBlockDiagnostics: Record<string, unknown> = {};
  let directSyncResult: any = null;
  try {
    const newBlocksState = ucfToScratch(normalizeModelUCF(ucfString), {
      runtime: vm.runtime,
      includeComments: options.includeComments === true,
    });
    parsedBlockDiagnostics = {
      parsedBlockCount: newBlocksState.length,
      parsedTopLevelBlocks: newBlocksState.filter((blockState) => blockState.topLevel).map((blockState) => ({
        id: blockState.id,
        opcode: blockState.opcode,
      })),
    };
    if (newBlocksState.length >= LARGE_SCRIPT_BLOCK_THRESHOLD) {
      const oldTopBlock = getBlockStateById(target, scriptId);
      const x = Number(oldTopBlock?.x ?? 50);
      const y = Number(oldTopBlock?.y ?? 50);
      const topLevelBlockState = newBlocksState.find((blockState) => blockState.topLevel);
      if (topLevelBlockState) {
        topLevelBlockState.x = x;
        topLevelBlockState.y = y;
      }
      const workspaceForVariables = workspace || (window.Blockly.getMainWorkspace() as Blockly.WorkspaceSvg);
      if (vm.editingTarget?.id !== target.id) {
        vm.setEditingTarget(target.id);
        await new Promise((resolve) => window.setTimeout(resolve, 60));
      }
      resolveVariableReferences(vm, workspaceForVariables, newBlocksState);
      directSyncResult = await syncLargeScriptDirectly(vm, target, scriptId, newBlocksState, "replace");
    }
  } catch (error) {
    return buildFailureResult(error instanceof Error ? error.message : "Failed to parse replacement script", "parse_direct_candidate", {
      scriptId,
      targetId: target.id,
      ...parsedBlockDiagnostics,
    });
  }

  const result = directSyncResult || await replaceBlocksRangeByUCF(vm, workspace, boundary.startBlockId, boundary.endBlockId, ucfString, {
    includeComments: options.includeComments === true,
  });
  return {
    ...result,
    diagnostics: {
      scriptId,
      targetId: target.id,
      startBlockId: boundary.startBlockId,
      endBlockId: boundary.endBlockId,
      scriptBlockCount: boundary.blockCount,
      ...parsedBlockDiagnostics,
      ...(result.diagnostics || {}),
    },
  };
};

const normalizeProcedureCode = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

const parseMutationArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const applyProcedureArgumentIds = (block: any, argumentIds: string[]) => {
  if (!block?.mutation || argumentIds.length === 0) return;
  const previousIds = parseMutationArray(block.mutation.argumentids);
  if (previousIds.length !== argumentIds.length) return;
  const nextInputs: Record<string, any> = { ...(block.inputs || {}) };
  previousIds.forEach((previousId, index) => {
    const nextId = argumentIds[index];
    if (previousId === nextId || !Object.prototype.hasOwnProperty.call(nextInputs, previousId)) return;
    nextInputs[nextId] = { ...nextInputs[previousId], name: nextId };
    delete nextInputs[previousId];
  });
  block.inputs = nextInputs;
  block.mutation.argumentids = JSON.stringify(argumentIds);
};

export const replaceTargetScriptsByUCFSections = async (
  vm: PluginContext["vm"],
  _workspace: Blockly.WorkspaceSvg,
  targetId: string,
  sections: Array<{ scriptId: string; code: string; changed?: boolean }>,
  options: { includeComments?: boolean; canCommit?: () => boolean } = {},
) => {
  const target = targetId ? vm.runtime.getTargetById(targetId) : vm.editingTarget;
  if (!target) {
    return buildFailureResult("Target not found", "resolve_target", { targetId });
  }

  const workspace = _workspace || (window.Blockly.getMainWorkspace() as Blockly.WorkspaceSvg);
  const currentBlocks = target.blocks?._blocks || {};
  const sectionIds = sections.map((section) => section.scriptId).filter(Boolean);
  if (new Set(sectionIds).size !== sectionIds.length) {
    return buildFailureResult("Target file contains duplicate script ids", "validate_target_script_ids", { targetId: target.id, scriptIds: sectionIds });
  }
  const currentTopLevelIds = (Array.isArray(target.blocks?._scripts) ? target.blocks._scripts : Object.keys(currentBlocks))
    .filter((id: string, index: number, list: string[]) => list.indexOf(id) === index)
    .filter((id: string) => currentBlocks[id]?.topLevel === true && (currentBlocks[id]?.parent === null || currentBlocks[id]?.parent === undefined));
  const changedSections = sections.filter((section) => section.changed !== false || !currentBlocks[section.scriptId]?.topLevel);
  const retainedSectionIds = new Set(
    sections.filter((section) => section.changed === false && currentBlocks[section.scriptId]?.topLevel === true).map((section) => section.scriptId),
  );
  const removedTopLevelIds = currentTopLevelIds.filter((id) => !retainedSectionIds.has(id));
  const candidateBlocks = cloneBlockMap(currentBlocks);
  const existingProcedureArgumentIds = new Map<string, string[]>();
  Object.values(currentBlocks).forEach((block: any) => {
    if (block?.opcode !== "procedures_prototype") return;
    const proccode = normalizeProcedureCode(block.mutation?.proccode);
    const argumentIds = parseMutationArray(block.mutation?.argumentids);
    if (proccode && argumentIds.length) existingProcedureArgumentIds.set(proccode, argumentIds);
  });
  const reservedIds = new Set<string>();
  (vm.runtime?.targets || []).forEach((runtimeTarget: any) => {
    Object.keys(runtimeTarget?.blocks?._blocks || {}).forEach((id) => reservedIds.add(id));
  });
  const generatedIds = new Set<string>();
  const parsedScripts: Array<{ scriptId: string; blocksState: any[]; topLevelBlockId: string }> = [];
  const commentPlans: Array<{ id: string; blockId: string; text: string; x: number; y: number; width: number; height: number }> = [];

  const makeUniqueId = (preferred?: string, allowExisting = false) => {
    const candidate = String(preferred || "").trim();
    if (candidate && !generatedIds.has(candidate) && (allowExisting || !reservedIds.has(candidate))) {
      generatedIds.add(candidate);
      reservedIds.add(candidate);
      return candidate;
    }
    let next = "";
    do {
      next = window.Blockly?.Utils?.genUid?.() || `02agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    } while (reservedIds.has(next) || generatedIds.has(next));
    generatedIds.add(next);
    reservedIds.add(next);
    return next;
  };

  const remapParsedBlocks = (blocksState: any[], preferredTopLevelId: string) => {
    const topLevel = blocksState.find((blockState) => blockState.topLevel === true);
    if (!topLevel) return null;
    const oldToNew = new Map<string, string>();
    blocksState.forEach((blockState) => {
      const preferred = blockState === topLevel && preferredTopLevelId ? preferredTopLevelId : undefined;
      const mayReuseExistingTopId = Boolean(preferred && currentBlocks[preferred]?.topLevel === true);
      oldToNew.set(blockState.id, makeUniqueId(preferred, mayReuseExistingTopId));
    });
    blocksState.forEach((blockState) => {
      blockState.id = oldToNew.get(blockState.id) || blockState.id;
      blockState.parent = blockState.parent ? oldToNew.get(blockState.parent) || blockState.parent : null;
      blockState.next = blockState.next ? oldToNew.get(blockState.next) || blockState.next : null;
      Object.values(blockState.inputs || {}).forEach((input: any) => {
        if (input?.block) input.block = oldToNew.get(input.block) || input.block;
        if (input?.shadow) input.shadow = oldToNew.get(input.shadow) || input.shadow;
      });
    });
    return blocksState;
  };

  try {
    for (const section of changedSections) {
      const blocksState = ucfToScratch(normalizeModelUCF(section.code), {
        runtime: vm.runtime,
        includeComments: options.includeComments === true,
      });
      if (!blocksState.length) {
        return buildFailureResult("Script UCF produced no blocks", "parse_target_script", { targetId: target.id, scriptId: section.scriptId });
      }
      const topLevelBlocks = blocksState.filter((blockState) => blockState.topLevel);
      if (topLevelBlocks.length !== 1) {
        return buildFailureResult("Each script section must produce exactly one top-level stack", "validate_target_script_topology", {
          targetId: target.id,
          scriptId: section.scriptId,
          topLevelBlockCount: topLevelBlocks.length,
        });
      }

      const preferredTopId = section.scriptId && (currentBlocks[section.scriptId]?.topLevel === true || !reservedIds.has(section.scriptId))
        ? section.scriptId
        : "";
      const remapped = remapParsedBlocks(blocksState, preferredTopId);
      if (!remapped) return buildFailureResult("Could not allocate a top-level script block", "allocate_target_script_id", { targetId: target.id, scriptId: section.scriptId });
      remapped.forEach((blockState) => {
        if (blockState?.opcode !== "procedures_prototype") return;
        const existingIds = existingProcedureArgumentIds.get(normalizeProcedureCode(blockState.mutation?.proccode));
        if (existingIds) applyProcedureArgumentIds(blockState, existingIds);
      });
      resolveVariableReferences(vm, workspace, remapped, target, { commit: false });
      const localGraph = validateBlockGraph(Object.fromEntries(remapped.map((blockState) => [blockState.id, blockState])));
      if (!localGraph.valid) {
        return buildFailureResult("Generated script block graph is invalid", "validate_generated_graph", { targetId: target.id, scriptId: section.scriptId, errors: localGraph.errors, stats: localGraph.stats });
      }
      const localBroadcast = validateRuntimeBroadcastBlocks(Object.fromEntries(remapped.map((blockState) => [blockState.id, blockState])));
      if (!localBroadcast.valid) {
        return buildFailureResult("Generated broadcast block graph is invalid", "validate_generated_broadcasts", { targetId: target.id, scriptId: section.scriptId, errors: localBroadcast.errors });
      }
      const topLevelBlock = remapped.find((blockState) => blockState.topLevel);
      parsedScripts.push({ scriptId: section.scriptId || topLevelBlock.id, blocksState: remapped, topLevelBlockId: topLevelBlock.id });
    }

    const removeIds = new Set<string>();
    removedTopLevelIds.forEach((topBlockId) => collectRuntimeSubtreeBlockIds({ blocks: { _blocks: candidateBlocks } } as any, topBlockId, removeIds));
    removeIds.forEach((id) => delete candidateBlocks[id]);

    parsedScripts.forEach((script) => {
      script.blocksState.forEach((blockState) => {
        const block = { ...blockState, fields: { ...(blockState.fields || {}) }, inputs: Object.fromEntries(Object.entries(blockState.inputs || {}).map(([name, input]) => [name, input && typeof input === "object" ? { ...input } : input])) };
        delete block.commentText;
        delete block.commentWidth;
        delete block.commentHeight;
        candidateBlocks[block.id] = block;
      });
    });

    const procedureArgumentIds = new Map<string, string[]>();
    for (const block of Object.values(candidateBlocks) as any[]) {
      if (block?.opcode !== "procedures_prototype") continue;
      const proccode = normalizeProcedureCode(block.mutation?.proccode);
      const argumentIds = parseMutationArray(block.mutation?.argumentids);
      if (!proccode || !argumentIds.length) continue;
      if (procedureArgumentIds.has(proccode)) {
        return buildFailureResult("Target contains duplicate custom block definitions", "validate_procedure_definitions", { targetId: target.id, proccode });
      }
      procedureArgumentIds.set(proccode, argumentIds);
    }
    const mutableBlockIds = new Set(parsedScripts.flatMap((script) => script.blocksState.map((blockState) => blockState.id)));
    Object.values(candidateBlocks).forEach((block: any) => {
      if (!mutableBlockIds.has(block?.id) || block?.opcode !== "procedures_call") return;
      const argumentIds = procedureArgumentIds.get(normalizeProcedureCode(block.mutation?.proccode));
      if (argumentIds) applyProcedureArgumentIds(block, argumentIds);
    });

    const candidateScripts = sections.map((section) => {
      if (section.changed === false && retainedSectionIds.has(section.scriptId)) return section.scriptId;
      const replacement = parsedScripts.find((script) => script.scriptId === section.scriptId);
      return replacement?.topLevelBlockId || section.scriptId;
    });
    const uniqueCandidateScripts = candidateScripts.filter((id, index, list) => id && list.indexOf(id) === index);
    const candidateComments = { ...(target.comments || {}) };
    removeIds.forEach((blockId) => {
      Object.entries(candidateComments).forEach(([commentId, comment]: [string, any]) => {
        if (comment?.blockId === blockId) delete candidateComments[commentId];
      });
    });
    parsedScripts.forEach((script) => {
      script.blocksState.forEach((blockState) => {
        if (typeof blockState.commentText !== "string" || !blockState.commentText.trim()) return;
        let commentId = `comment-${blockState.id}`;
        let suffix = 2;
        while (candidateComments[commentId]) commentId = `comment-${blockState.id}-${suffix++}`;
        const block = candidateBlocks[blockState.id];
        block.comment = commentId;
        commentPlans.push({ id: commentId, blockId: blockState.id, text: blockState.commentText, x: Number(blockState.x || 0) + 32, y: Number(blockState.y || 0) + 32, width: Number(blockState.commentWidth) || 200, height: Number(blockState.commentHeight) || 160 });
      });
    });

    const graph = validateBlockGraph(candidateBlocks, { scripts: uniqueCandidateScripts });
    if (!graph.valid) {
      return buildFailureResult("Candidate target block graph is invalid; no VM changes were made", "validate_candidate_graph", { targetId: target.id, errors: graph.errors, stats: graph.stats });
    }
    const broadcastGraph = validateRuntimeBroadcastBlocks(candidateBlocks);
    if (!broadcastGraph.valid) {
      return buildFailureResult("Candidate broadcast block graph is invalid; no VM changes were made", "validate_candidate_broadcasts", { targetId: target.id, errors: broadcastGraph.errors });
    }
    try {
      const sb3 = require("scratch-vm/src/serialization/sb3");
      const serializedBlocks = sb3.serializeBlocks(candidateBlocks)[0];
      const serializedBroadcast = validateSerializedBroadcastSchema({ targets: [{ blocks: serializedBlocks }] });
      if (!serializedBroadcast.valid) {
        return buildFailureResult("Candidate blocks do not serialize to valid SB3 broadcast input arrays", "validate_candidate_serialization", { targetId: target.id, errors: serializedBroadcast.errors });
      }
    } catch (error) {
      return buildFailureResult(error instanceof Error ? error.message : "Could not validate candidate SB3 serialization", "validate_candidate_serialization", { targetId: target.id });
    }

    const before = {
      blocks: target.blocks._blocks,
      scripts: target.blocks._scripts,
      comments: target.comments,
      variablesByTarget: new Map((vm.runtime?.targets || []).map((item: any) => [item.id, {
        container: item.variables,
        entries: new Map(Object.entries(item.variables || {}).map(([id, variable]: [string, any]) => [id, {
          variable,
          value: variable?.value,
          internalValue: variable?._value,
          monitorUpToDate: variable?._monitorUpToDate,
        }])),
      }])),
    };
    let committed = false;
    const restore = async () => {
      target.blocks._blocks = before.blocks;
      target.blocks._scripts = before.scripts;
      target.comments = before.comments;
      before.variablesByTarget.forEach((state: any, id) => {
        const previousTarget = vm.runtime?.getTargetById?.(id);
        if (!previousTarget) return;
        previousTarget.variables = state.container;
        Object.keys(previousTarget.variables || {}).forEach((variableId) => {
          if (!state.entries.has(variableId)) delete previousTarget.variables[variableId];
        });
        state.entries.forEach((entry: any, variableId: string) => {
          previousTarget.variables[variableId] = entry.variable;
          if (entry.variable) {
            entry.variable.value = entry.value;
            if ("_value" in entry.variable) entry.variable._value = entry.internalValue;
            if ("_monitorUpToDate" in entry.variable) entry.variable._monitorUpToDate = entry.monitorUpToDate;
          }
        });
      });
      target.blocks.resetCache?.();
      target.blocks.updateTargetSpecificBlocks?.(Boolean(target.isStage));
      await refreshWorkspaceAfterRuntimeWrite(vm, target);
    };

    if (options.canCommit && !options.canCommit()) {
      return buildFailureResult("PROJECT_SWITCHING: project changed before the candidate graph could be committed", "project_switching", { targetId: target.id });
    }
    setBlocklyEventGroup(true);
    try {
      target.blocks._blocks = candidateBlocks;
      target.blocks._scripts = uniqueCandidateScripts;
      target.comments = candidateComments;
      parsedScripts.forEach((script) => resolveVariableReferences(vm, workspace, script.blocksState, target, {
        commit: true,
        repairLists: false,
        syncWorkspace: false,
      }));
      commentPlans.forEach((comment) => target.createComment?.(comment.id, comment.blockId, comment.text, comment.x, comment.y, comment.width, comment.height, false));
      target.blocks.resetCache?.();
      target.blocks.updateTargetSpecificBlocks?.(Boolean(target.isStage));
      const committedGraph = validateBlockGraph(target.blocks._blocks, { scripts: target.blocks._scripts });
      if (!committedGraph.valid) throw new Error(`Committed target block graph is invalid: ${JSON.stringify(committedGraph.errors).slice(0, 1000)}`);
      committed = true;
    } catch (error) {
      await restore();
      return buildFailureResult(error instanceof Error ? error.message : "Failed to commit target block graph", "commit_target_graph", { targetId: target.id });
    } finally {
      setBlocklyEventGroup(false);
    }

    const refreshError = await refreshWorkspaceAfterRuntimeWrite(vm, target);
    return {
      success: true,
      syncMode: "vm-direct-target-transaction",
      targetId: target.id,
      scriptCount: uniqueCandidateScripts.length,
      removedScriptIds: removedTopLevelIds,
      insertedScriptIds: parsedScripts.map((script) => script.topLevelBlockId),
      scriptIdMap: Object.fromEntries(parsedScripts.map((script) => [script.scriptId, script.topLevelBlockId])),
      removedBlockCount: removeIds.size,
      insertedBlockCount: parsedScripts.reduce((sum, script) => sum + script.blocksState.length, 0),
      commentCount: commentPlans.length,
      graph: validateBlockGraph(target.blocks._blocks, { scripts: target.blocks._scripts }).stats,
      workspaceRefreshWarning: refreshError || undefined,
      rollback: async () => {
        if (committed) await restore();
      },
    };
  } catch (error) {
    return buildFailureResult(error instanceof Error ? error.message : "Failed to prepare target script transaction", "prepare_target_graph", { targetId: target.id });
  } finally {
    setBlocklyEventGroup(false);
  }
};

export const insertScriptByUCF = async (
  vm: PluginContext["vm"],
  _workspace: Blockly.WorkspaceSvg,
  targetId: string,
  ucfString: string,
  options: { includeComments?: boolean } = {},
) => {
  const target = targetId ? vm.runtime.getTargetById(targetId) : vm.editingTarget;
  if (!target) {
    return buildFailureResult("Target not found", "resolve_target", { targetId });
  }

  let switchedTarget = false;
  if (vm.editingTarget?.id !== target.id) {
    vm.setEditingTarget(target.id);
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    switchedTarget = true;
  }

  const workspace = switchedTarget
    ? (window.Blockly.getMainWorkspace() as Blockly.WorkspaceSvg)
    : _workspace || (window.Blockly.getMainWorkspace() as Blockly.WorkspaceSvg);
  const topLevelBefore = collectTopLevelBlockIds(workspace);
  let parsedBlockDiagnostics: Record<string, unknown> = {};

  try {
    const newBlocksState = ucfToScratch(normalizeModelUCF(ucfString), {
      runtime: vm.runtime,
      includeComments: options.includeComments === true,
    });
    parsedBlockDiagnostics = {
      parsedBlockCount: newBlocksState.length,
      parsedTopLevelBlocks: newBlocksState.filter((blockState) => blockState.topLevel).map((blockState) => ({
        id: blockState.id,
        opcode: blockState.opcode,
      })),
      parsedOpcodes: [...new Set(newBlocksState.map((blockState) => blockState.opcode))].slice(0, 40),
    };
    if (!newBlocksState.length) {
      return buildFailureResult("Inserted UCF produced no blocks", "parse_insert", { targetId: target.id });
    }

    const topLevelBlocks = newBlocksState.filter((blockState) => blockState.topLevel);
    if (topLevelBlocks.length !== 1) {
      return buildFailureResult("Inserted UCF must contain exactly one top-level stack", "validate_insert_topology", {
        targetId: target.id,
        topLevelBlockCount: topLevelBlocks.length,
      });
    }

    resolveVariableReferences(vm, workspace, newBlocksState);
    if (newBlocksState.length >= LARGE_SCRIPT_BLOCK_THRESHOLD) {
      const topLevelBlockState = topLevelBlocks[0];
      if (topLevelBlockState.x === undefined) topLevelBlockState.x = 50;
      if (topLevelBlockState.y === undefined) topLevelBlockState.y = 50;
      return syncLargeScriptDirectly(vm, target, null, newBlocksState, "insert");
    }
    const xmlText = blockStatesToXml(newBlocksState);

    setBlocklyEventGroup(true);
    const xmlDom = window.Blockly.Xml.textToDom(xmlText);
    window.Blockly.Xml.domToWorkspace(xmlDom, workspace);
    applyBlockCommentsToWorkspace(workspace, newBlocksState);
    repairListVariableValues(vm, target.id);

    let insertedBlock = workspace.getBlockById(topLevelBlocks[0].id) as Blockly.BlockSvg | null;
    if (!insertedBlock) {
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      insertedBlock = workspace.getBlockById(topLevelBlocks[0].id) as Blockly.BlockSvg | null;
    }
    if (!insertedBlock) {
      return buildFailureResult("Inserted top-level block not found in workspace", "locate_inserted_block", {
        targetId: target.id,
        insertedTopBlockId: topLevelBlocks[0].id,
      });
    }

    const topLevelAfter = collectTopLevelBlockIds(workspace);
    const newTopLevelBlockIds = topLevelAfter.filter((blockId) => !topLevelBefore.includes(blockId));

    if (!newTopLevelBlockIds.includes(insertedBlock.id)) {
      insertedBlock.dispose(false, true);
      return buildFailureResult("Inserted script did not create a visible top-level workspace block", "validate_insert", {
        targetId: target.id,
        insertedTopBlockId: insertedBlock.id,
        topLevelBefore,
        topLevelAfter,
      });
    }

    return {
      success: true,
      insertedTopBlockId: insertedBlock.id,
      targetId: target.id,
      blockCount: newBlocksState.length,
      diagnostics: {
        topLevelBefore,
        topLevelAfter,
        newTopLevelBlockIds,
      },
    };
  } catch (error) {
    return buildFailureResult(error instanceof Error ? error.message : "Failed to insert script", "exception", {
      targetId: target.id,
      ...parsedBlockDiagnostics,
    });
  } finally {
    setBlocklyEventGroup(false);
  }
};

export const deleteScriptById = async (
  vm: PluginContext["vm"],
  _workspace: Blockly.WorkspaceSvg,
  scriptId: string,
) => {
  const target = vm.runtime.targets.find((item) => item.blocks?._blocks?.[scriptId]) || null;
  if (!target) {
    return buildFailureResult("Script not found in runtime targets", "resolve_script_target", { scriptId });
  }

  const boundary = getScriptBoundaryIds(target, scriptId);
  if (!boundary.success) {
    return buildFailureResult(boundary.error, "resolve_script_boundaries", {
      scriptId,
      targetId: target.id,
    });
  }

  let switchedTarget = false;
  if (vm.editingTarget?.id !== target.id) {
    vm.setEditingTarget(target.id);
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    switchedTarget = true;
  }

  const workspace = switchedTarget
    ? (window.Blockly.getMainWorkspace() as Blockly.WorkspaceSvg)
    : _workspace || (window.Blockly.getMainWorkspace() as Blockly.WorkspaceSvg);
  const topBlock = workspace.getBlockById(scriptId) as Blockly.BlockSvg | null;
  if (!topBlock) {
    return buildFailureResult("Script not found in current workspace", "resolve_workspace_script", {
      scriptId,
      targetId: target.id,
    });
  }

  try {
    setBlocklyEventGroup(true);
    topBlock.dispose(false, true);
    return {
      success: true,
      deletedScriptId: scriptId,
      targetId: target.id,
      blockCount: boundary.blockCount,
    };
  } catch (error) {
    return buildFailureResult(error instanceof Error ? error.message : "Failed to delete script", "exception", {
      scriptId,
      targetId: target.id,
    });
  } finally {
    setBlocklyEventGroup(false);
  }
};
