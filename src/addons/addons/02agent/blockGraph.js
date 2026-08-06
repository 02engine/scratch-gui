const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const asBlockMap = (blocks) => (blocks && typeof blocks === "object" ? blocks : {});

const addReference = (references, childId, ownerId, relation) => {
  if (!childId) return;
  const owners = references.get(childId) || [];
  owners.push({ ownerId, relation });
  references.set(childId, owners);
};

const walkReachable = (blocks, blockId, reachable, visiting) => {
  if (!blockId || reachable.has(blockId)) return;
  if (visiting.has(blockId)) return;
  const block = blocks[blockId];
  if (!block) return;
  visiting.add(blockId);
  reachable.add(blockId);
  if (block.next) walkReachable(blocks, block.next, reachable, visiting);
  Object.values(block.inputs || {}).forEach((input) => {
    if (!input || typeof input !== "object") return;
    walkReachable(blocks, input.block, reachable, visiting);
    if (input.shadow !== input.block) walkReachable(blocks, input.shadow, reachable, visiting);
  });
  visiting.delete(blockId);
};

export const validateBlockGraph = (blocks, options = {}) => {
  const blockMap = asBlockMap(blocks);
  const ids = new Set(Object.keys(blockMap));
  const errors = [];
  const references = new Map();
  const topLevelIds = [];
  let shadowCount = 0;

  const error = (code, blockId, message, details = {}) => {
    errors.push({ code, blockId, message, ...details });
  };

  Object.entries(blockMap).forEach(([id, block]) => {
    if (!block || typeof block !== "object") {
      error("invalid_block", id, "Block must be an object.");
      return;
    }
    if (block.id !== id) error("block_id_mismatch", id, "Block id must match its map key.", { actualId: block.id });
    if (block.shadow) shadowCount += 1;

    if (block.topLevel === true) {
      topLevelIds.push(id);
      if (block.parent !== null) {
        error("top_level_parent", id, "A top-level block must have parent=null.", { parent: block.parent });
      }
    } else if (!block.parent) {
      error("missing_parent", id, "A non-top-level block must have a parent.");
    } else if (!ids.has(block.parent)) {
      error("missing_parent_reference", id, "Block parent does not exist.", { parent: block.parent });
    }

    if (block.next !== null && block.next !== undefined) {
      if (!ids.has(block.next)) {
        error("missing_next_reference", id, "Block next does not exist.", { next: block.next });
      } else {
        addReference(references, block.next, id, "next");
      }
    }

    Object.entries(block.inputs || {}).forEach(([inputName, input]) => {
      if (!input || typeof input !== "object") {
        error("invalid_input", id, `Input ${inputName} must be an object.`);
        return;
      }
      const seenInputReferences = new Set();
      ["block", "shadow"].forEach((key) => {
        const childId = input[key];
        if (childId === null || childId === undefined) return;
        if (typeof childId !== "string" || !ids.has(childId)) {
          error("missing_input_reference", id, `Input ${inputName}.${key} does not exist.`, { inputName, key, reference: childId });
          return;
        }
        if (!seenInputReferences.has(childId)) addReference(references, childId, id, `input:${inputName}`);
        seenInputReferences.add(childId);
      });
      if (input.block && input.shadow && input.block !== input.shadow) {
        const blockChild = blockMap[input.block];
        const shadowChild = blockMap[input.shadow];
        if (blockChild?.parent !== id) error("input_parent_mismatch", input.block, "Input block parent does not point back to its owner.", { ownerId: id, inputName });
        if (shadowChild?.parent !== id) error("shadow_parent_mismatch", input.shadow, "Shadow block parent does not point back to its owner.", { ownerId: id, inputName });
      }
    });
  });

  references.forEach((owners, childId) => {
    const uniqueOwners = new Set(owners.map((item) => item.ownerId));
    if (owners.length > 1 || uniqueOwners.size > 1) {
      error("multiple_parents", childId, "A block is referenced by more than one parent.", { owners });
    }
    const block = blockMap[childId];
    const ownerId = owners[0]?.ownerId;
    if (block && block.parent !== ownerId) {
      error("reverse_reference_mismatch", childId, "Parent does not match the block reference that owns it.", { parent: block.parent, ownerId });
    }
  });

  const scripts = Array.isArray(options.scripts) ? options.scripts : topLevelIds;
  const scriptSet = new Set();
  scripts.forEach((scriptId) => {
    if (scriptSet.has(scriptId)) error("duplicate_script", scriptId, "The same top-level script is listed more than once.");
    scriptSet.add(scriptId);
    if (!ids.has(scriptId)) error("missing_script_reference", scriptId, "The target script list references a missing block.");
    else if (blockMap[scriptId]?.topLevel !== true) error("non_top_level_script", scriptId, "The target script list must contain only top-level blocks.");
  });

  const reachable = new Set();
  topLevelIds.forEach((id) => walkReachable(blockMap, id, reachable, new Set()));
  ids.forEach((id) => {
    if (!reachable.has(id)) error("orphan_block", id, "Block is not reachable from any top-level script.");
  });

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      blockCount: ids.size,
      topLevelScriptCount: topLevelIds.length,
      shadowBlockCount: shadowCount,
      reachableBlockCount: reachable.size,
      orphanBlockCount: [...ids].filter((id) => !reachable.has(id)).length,
    },
  };
};

const validateBroadcastDefinition = (name, id, path, errors, stageBroadcasts) => {
  if (!stageBroadcasts) return;
  if (!hasOwn(stageBroadcasts, id)) {
    errors.push({ path, message: `Broadcast id ${JSON.stringify(id)} is not registered on the stage.` });
    return;
  }
  if (stageBroadcasts[id] !== name) {
    errors.push({
      path,
      message: `Broadcast id ${JSON.stringify(id)} is registered as ${JSON.stringify(stageBroadcasts[id])}, not ${JSON.stringify(name)}.`,
    });
  }
};

const validateBroadcastPrimitive = (value, path, errors, stageBroadcasts) => {
  if (!Array.isArray(value)) return;
  if (value[0] === 11) {
    if (value.length !== 3 || typeof value[1] !== "string" || typeof value[2] !== "string") {
      errors.push({ path, message: "Broadcast primitive must be [11, broadcastName, broadcastId]." });
    } else {
      validateBroadcastDefinition(value[1], value[2], path, errors, stageBroadcasts);
    }
  }
};

export const validateSerializedBroadcastSchema = (project) => {
  const errors = [];
  const targets = project?.targets || [];
  const stage = targets.find((target) => target?.isStage === true);
  // Partial target serialization is used while preparing an atomic patch. In
  // that mode there is no stage to validate against, so only validate shape.
  const stageBroadcasts = stage && stage.broadcasts && typeof stage.broadcasts === "object"
    ? stage.broadcasts
    : null;
  targets.forEach((target, targetIndex) => {
    Object.entries(target?.blocks || {}).forEach(([blockId, block]) => {
      if (Array.isArray(block)) {
        validateBroadcastPrimitive(block, `targets[${targetIndex}].blocks.${blockId}`, errors, stageBroadcasts);
        return;
      }
      if (!block || typeof block !== "object") return;
      if (["event_broadcast", "event_broadcastandwait"].includes(block.opcode)) {
        const input = block.inputs?.BROADCAST_INPUT;
        if (!Array.isArray(input) || input.length < 2 || input.length > 3) {
          errors.push({ path: `targets[${targetIndex}].blocks.${blockId}.inputs.BROADCAST_INPUT`, message: "Broadcast input must contain two or three items in SB3 format." });
        } else {
          validateBroadcastPrimitive(input[1], `targets[${targetIndex}].blocks.${blockId}.inputs.BROADCAST_INPUT[1]`, errors, stageBroadcasts);
          if (input.length === 3) validateBroadcastPrimitive(input[2], `targets[${targetIndex}].blocks.${blockId}.inputs.BROADCAST_INPUT[2]`, errors, stageBroadcasts);
        }
      }
      if (block.opcode === "event_whenbroadcastreceived") {
        const field = block.fields?.BROADCAST_OPTION;
        if (!Array.isArray(field) || field.length !== 2 || typeof field[0] !== "string" || typeof field[1] !== "string") {
          errors.push({ path: `targets[${targetIndex}].blocks.${blockId}.fields.BROADCAST_OPTION`, message: "Broadcast receiver field must be [broadcastName, broadcastId]." });
        } else {
          validateBroadcastDefinition(
            field[0],
            field[1],
            `targets[${targetIndex}].blocks.${blockId}.fields.BROADCAST_OPTION`,
            errors,
            stageBroadcasts,
          );
        }
      }
    });
  });
  return { valid: errors.length === 0, errors };
};

export const validateRuntimeBroadcastBlocks = (blocks) => {
  const blockMap = asBlockMap(blocks);
  const errors = [];
  Object.values(blockMap).forEach((block) => {
    if (!block || typeof block !== "object") return;
    if (block.opcode === "event_broadcast" || block.opcode === "event_broadcastandwait") {
      if (block.inputs?.BROADCAST_OPTION) errors.push({ blockId: block.id, message: "Broadcast send blocks use BROADCAST_INPUT, not BROADCAST_OPTION." });
      const input = block.inputs?.BROADCAST_INPUT;
      const menuId = input?.block || input?.shadow;
      const menu = menuId ? blockMap[menuId] : null;
      const field = menu?.fields?.BROADCAST_OPTION;
      if (!menu || menu.opcode !== "event_broadcast_menu" || !field || typeof field.value !== "string" || typeof field.id !== "string") {
        errors.push({ blockId: block.id, message: "Broadcast send input must reference an event_broadcast_menu with BROADCAST_OPTION name and id." });
      }
    }
    if (block.opcode === "event_whenbroadcastreceived") {
      if (block.inputs?.BROADCAST_OPTION) errors.push({ blockId: block.id, message: "Broadcast receiver uses a field BROADCAST_OPTION, not an input." });
      const field = block.fields?.BROADCAST_OPTION;
      if (!field || typeof field.value !== "string" || typeof field.id !== "string") {
        errors.push({ blockId: block.id, message: "Broadcast receiver field must contain a broadcast name and id." });
      }
    }
  });
  return { valid: errors.length === 0, errors };
};

export const cloneBlockMap = (blocks) => {
  const result = {};
  Object.entries(asBlockMap(blocks)).forEach(([id, block]) => {
    result[id] = block && typeof block === "object"
      ? { ...block, fields: { ...(block.fields || {}) }, inputs: Object.fromEntries(Object.entries(block.inputs || {}).map(([name, input]) => [name, input && typeof input === "object" ? { ...input } : input])), mutation: block.mutation ? { ...block.mutation } : block.mutation }
      : block;
  });
  return result;
};
