import { scratchToUCF } from "./ucf";

export const toAnnotatedUCF = (sequences: Array<{ blocks: any[]; statementBlockIds: string[] }>, runtime?: any) =>
  sequences
    .map(({ blocks }) => scratchToUCF(blocks, { runtime, includeBlockIds: true }))
    .join("\n\n");

export const stripAnnotatedUCFComments = (ucf: string) =>
  ucf
    .split("\n")
    .map((line) => line.replace(/\s*\/\/\s*blockId:\s*[^\s]+\s*$/i, ""))
    .join("\n");

export const toModelUCF = (blocks: any[], runtime?: any) =>
  scratchToUCF(blocks, { runtime, includeBlockIds: false });

export const normalizeModelUCF = (ucf: string) =>
  stripAnnotatedUCFComments(ucf).trim();
