import { scratchToUCF, ucfToScratch } from "./ucf";
import { normalizeModelUCF, toAnnotatedUCF } from "./annotatedUcf";

const getScratchBlocks = () => (window as any).ScratchBlocks || window.Blockly;

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

const resolveVariableReferences = (vm: PluginContext["vm"], workspace: Blockly.WorkspaceSvg, blocksState: any[]) => {
  const createScratchFieldId = () =>
    window.Blockly?.Utils?.genUid?.() || `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const target = vm.editingTarget;
  const runtimeTargets = Array.isArray(vm.runtime?.targets) ? vm.runtime.targets : [];
  const stageTarget = runtimeTargets.find((item: any) => item?.isStage) || target;
  repairListVariableValues(vm, target?.id);

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
    ...workspace.getAllVariables().map((item: any) => ({
      id: item.id_ || item.id,
      name: item.name,
      type: item.type || "",
      source: "workspace",
      target: null,
      variable: item,
    })),
  ];

  const createStableVariableId = (name: string, type: string) => {
    const base = String(name || "").trim() || createScratchFieldId();
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

  const ensureWorkspaceVariable = (id: string, name: string, type: string) => {
    if (!workspace) return;
    try {
      const existingById =
        typeof (workspace as any).getVariableById === "function" ? (workspace as any).getVariableById(id) : null;
      if (existingById) return;

      const existingByName =
        typeof (workspace as any).getVariable === "function" ? (workspace as any).getVariable(name, type) : null;
      if (existingByName) return;

      if (typeof (workspace as any).createVariable === "function") {
        (workspace as any).createVariable(name, type, id);
      }
    } catch (error) {
      console.warn("[AI Assistant] Failed to ensure workspace variable", { id, name, type, error });
    }
  };

  const ensureRuntimeVariable = (id: string, name: string, type: string) => {
    let variableRecord = existingVariables.find((item) => item.id === id && item.type === type);
    if (!variableRecord) {
      variableRecord = existingVariables.find((item) => item.name === name && item.type === type);
    }
    if (variableRecord?.source === "runtime") {
      if (type === "list") {
        repairListVariableValue(variableRecord.target, variableRecord.variable);
      }
      ensureWorkspaceVariable(variableRecord.id, variableRecord.name, type);
      return variableRecord;
    }

    const ownerTarget = type === "broadcast_msg" ? stageTarget : stageTarget || target;
    let variable = getTargetVariables(ownerTarget).find((item) => item.id === id || (item.name === name && item.type === type));
    if (!variable) {
      ownerTarget?.createVariable(id, name, type, false);
      variable = ownerTarget?.variables?.[id] || getTargetVariables(ownerTarget).find((item) => item.id === id);
    }
    if (type === "list") {
      repairListVariableValue(ownerTarget, variable);
    }
    ensureWorkspaceVariable(id, name, type);
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

  const findVariableReference = (nameOrId: string, type: string) => {
    const byName = existingVariables.find((item) => item.name === nameOrId && item.type === type);
    if (byName) return byName;

    const byId = existingVariables.find((item) => item.id === nameOrId && item.type === type);
    if (byId) return byId;

    return null;
  };

  const normalizeVariableField = (field: any) => {
    const variableType = field.name === "VARIABLE" ? "" : "list";
    const requestedName = String(field.value || "").trim();
    if (!requestedName) {
      return;
    }

    const existingVariable = findVariableReference(requestedName, variableType);
    if (existingVariable) {
      field.id = existingVariable.id;
      field.value = existingVariable.name;
      field.variableType = variableType;
      ensureRuntimeVariable(existingVariable.id, existingVariable.name, variableType);
      return;
    }

    const fieldId = createStableVariableId(requestedName, variableType);
    field.id = fieldId;
    field.value = requestedName;
    field.variableType = variableType;
    ensureRuntimeVariable(fieldId, requestedName, variableType);
  };

  blocksState.forEach((blockState) => {
    Object.values(blockState.fields || {}).forEach((field: any) => {
      if (field.name !== "VARIABLE" && field.name !== "LIST" && field.name !== "LIST_MENU") return;
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
    setTimeout(() => {
      workspace.fireDeletionListeners(startBlock);
    });
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

  const result = await replaceBlocksRangeByUCF(vm, workspace, boundary.startBlockId, boundary.endBlockId, ucfString, {
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
      ...(result.diagnostics || {}),
    },
  };
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
    setTimeout(() => {
      workspace.fireDeletionListeners(topBlock);
    });
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
