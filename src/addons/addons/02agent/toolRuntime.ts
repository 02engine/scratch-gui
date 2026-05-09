export const REQUIRED_TOOL_ARGUMENTS: Record<string, string[]> = {
  readFile: ["path"],
  searchFiles: ["query"],
  searchBlocks: ["query"],
  getBlockHelp: ["opcode"],
  applyPatch: ["patch"],
  createSpriteWithSvg: ["svg"],
  addCostumeWithSvg: ["svg"],
  batchAddCostumesWithSvg: ["costumes"],
  reorderCostume: ["newIndex"],
};

const isMissingToolArgument = (value: unknown) =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

export const validateToolArguments = (functionName: string, args: Record<string, unknown>) => {
  const requiredArguments = REQUIRED_TOOL_ARGUMENTS[functionName] || [];
  const missingArguments = requiredArguments.filter((argumentName) => isMissingToolArgument(args[argumentName]));

  if (missingArguments.length > 0) {
    throw new Error(
      `Tool ${functionName} requires argument(s): ${missingArguments.join(", ")}. Received: ${JSON.stringify(args)}`,
    );
  }
};

export const callAITool = async (aiTools: Record<string, any> | null, functionName: string, args: Record<string, any>) => {
  if (!aiTools || typeof aiTools[functionName] !== "function") {
    throw new Error(`Tool ${functionName} not found`);
  }

  validateToolArguments(functionName, args);

  switch (functionName) {
    case "readFile":
      return aiTools[functionName](args.path, args.startLine, args.endLine);
    case "searchFiles":
      return aiTools[functionName](args);
    case "searchBlocks":
      return aiTools[functionName](args);
    case "getBlockHelp":
      return aiTools[functionName](args.opcode);
    case "getScratchGuide":
      return aiTools[functionName](args.topic);
    case "getProjectOverview":
      return aiTools[functionName]();
    case "applyPatch":
      return aiTools[functionName](args.patch);
    case "getDiagnostics":
      return aiTools[functionName](args.path);
    case "listFiles":
      return aiTools[functionName]();
    case "createSpriteWithSvg":
      return aiTools[functionName](args);
    case "updateSpriteProperties":
      return aiTools[functionName](args);
    case "listCostumes":
      return aiTools[functionName](args);
    case "addCostumeWithSvg":
      return aiTools[functionName](args);
    case "batchAddCostumesWithSvg":
      return aiTools[functionName](args);
    case "deleteCostume":
      return aiTools[functionName](args);
    case "batchDeleteCostumes":
      return aiTools[functionName](args);
    case "reorderCostume":
      return aiTools[functionName](args);
    case "setCostumeOrder":
      return aiTools[functionName](args);
    case "deleteSprite":
      return aiTools[functionName](args);
    default:
      return aiTools[functionName]();
  }
};
