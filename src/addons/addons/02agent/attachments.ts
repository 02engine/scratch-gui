import { nanoid } from "nanoid";
import * as XLSX from "xlsx";
import { Attachment } from "./types";

const mammoth: {
  extractRawText: (options: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
} = require("mammoth/mammoth.browser");

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "js",
  "ts",
  "tsx",
  "jsx",
  "css",
  "less",
  "html",
  "xml",
  "yaml",
  "yml",
  "csv",
  "log",
  "ucf",
]);

const SPREADSHEET_EXTENSIONS = new Set(["xls", "xlsx", "xlsm", "xlsb", "csv", "ods"]);
const DOCUMENT_EXTENSIONS = new Set(["docx"]);

const getFileExtension = (fileName: string) => {
  const match = /\.([^.]+)$/.exec(fileName.toLowerCase());
  return match?.[1] || "";
};

const readFileAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file);
  });

const readFileAsArrayBuffer = (file: File) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error(`Failed to read file: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });

const truncatePreview = (content: string, maxLength = 1200) => {
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength)}\n\n...（内容已截断，发送时会携带完整解析文本）`;
};

const parseSpreadsheet = async (file: File) => {
  const data = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(data, { type: "array" });
  const sections = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as Array<
      Array<string | number | boolean | null>
    >;
    const serializedRows = rows
      .slice(0, 200)
      .map((row) => row.map((cell) => (cell == null ? "" : String(cell))).join("\t"))
      .join("\n");
    return `# Sheet: ${sheetName}\n${serializedRows}`;
  });

  const content = sections.join("\n\n");
  return {
    kind: "spreadsheet" as const,
    content,
    preview: truncatePreview(content),
  };
};

const parseDocument = async (file: File) => {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const result = await mammoth.extractRawText({ arrayBuffer });
  const content = result.value.trim();

  return {
    kind: "document" as const,
    content,
    preview: truncatePreview(content),
  };
};

const parseTextLikeFile = async (file: File) => {
  const content = await readFileAsText(file);
  return {
    kind: "text-file" as const,
    content,
    preview: truncatePreview(content),
  };
};

export const parseLocalAttachment = async (file: File): Promise<Attachment> => {
  const extension = getFileExtension(file.name);

  let parsed;
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    parsed = await parseDocument(file);
  } else if (SPREADSHEET_EXTENSIONS.has(extension)) {
    parsed = await parseSpreadsheet(file);
  } else if (TEXT_EXTENSIONS.has(extension) || file.type.startsWith("text/")) {
    parsed = await parseTextLikeFile(file);
  } else {
    throw new Error(`暂不支持该文件格式：${file.name}`);
  }

  return {
    id: nanoid(),
    name: file.name,
    kind: parsed.kind,
    mimeType: file.type || "application/octet-stream",
    content: parsed.content,
    preview: parsed.preview,
    meta: {
      source: "local-file",
    },
  };
};
