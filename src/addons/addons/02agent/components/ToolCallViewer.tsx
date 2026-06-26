import * as React from "react";
import toolStyles from "../ui/ToolCalls.module.less";
import { ChatMessage, ToolCall } from "../types";

interface ToolCallViewerProps {
  toolCalls: ToolCall[];
  toolResults?: ChatMessage[];
  isGenerating?: boolean;
}

type ToolCallStatus = "running" | "success" | "error";
type DiffLineKind = "add" | "delete" | "context" | "meta";

interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldLine?: number;
  newLine?: number;
}

interface DiffFile {
  path: string;
  added: number;
  deleted: number;
  lines: DiffLine[];
  truncated: boolean;
}

interface ToolEntry {
  id: string;
  name: string;
  args: any;
  rawArguments: string;
  formattedArguments: string;
  result?: any;
  rawResult: string;
  formattedResult: string;
  status: ToolCallStatus;
  summary: string;
}

const MAX_DIFF_LINES = 180;

const safeParseJson = (value: string) => {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const tryFormatJson = (value: string) => {
  if (!value) return "";
  const parsed = safeParseJson(value);
  return parsed === undefined ? value : JSON.stringify(parsed, null, 2);
};

const stringifyCompact = (value: unknown) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const getToolCallStatus = (result?: ChatMessage): ToolCallStatus => {
  if (!result) return "running";
  if (result.content.startsWith("Error:")) return "error";

  const parsed = safeParseJson(result.content);
  if (parsed && typeof parsed === "object" && "success" in parsed) {
    return parsed.success ? "success" : "error";
  }

  return "success";
};

const asArray = (value: any) => (Array.isArray(value) ? value : []);

const getToolSummary = (name: string, args: any, result: any, status: ToolCallStatus) => {
  if (status === "running") return "正在执行";
  if (status === "error") {
    return result?.error || result?.message || "执行失败";
  }

  switch (name) {
    case "applyPatch": {
      const files = asArray(result?.changedFiles);
      const operationCount = Number(result?.scriptOperationCount || 0);
      if (files.length > 0) {
        return `已同步 ${files.length} 个文件，${operationCount} 个脚本操作`;
      }
      return "补丁已应用";
    }
    case "getDiagnostics":
      return result?.valid ? "诊断通过" : "发现诊断问题";
    case "readFile":
      return `${result?.path || args?.path || "文件"} · ${result?.startLine || 1}-${result?.endLine || result?.totalLines || "?"} 行`;
    case "searchFiles":
    case "searchBlocks":
      return `找到 ${result?.matchCount ?? asArray(result?.matches).length ?? 0} 条结果`;
    case "getBlockHelp":
      return result?.success ? `${result?.dslCall || args?.opcode || "积木"} 用法已读取` : "积木帮助读取失败";
    case "getScratchGuide":
      return `${result?.title || result?.topic || args?.topic || "指南"} 已读取`;
    case "getProjectOverview":
      return `项目概览 · ${asArray(result?.files).length} 个文件`;
    case "listFiles":
      return `列出 ${Array.isArray(result) ? result.length : asArray(result?.files).length} 个文件`;
    default:
      return "执行完成";
  }
};

const buildEntries = (toolCalls: ToolCall[], toolResults: ChatMessage[]): ToolEntry[] =>
  toolCalls.map((toolCall) => {
    const resultMessage = toolResults.find((item) => item.tool_call_id === toolCall.id);
    const args = safeParseJson(toolCall.function.arguments) ?? {};
    const result = safeParseJson(resultMessage?.content || "");
    const status = getToolCallStatus(resultMessage);
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      args,
      rawArguments: toolCall.function.arguments,
      formattedArguments: tryFormatJson(toolCall.function.arguments),
      result,
      rawResult: resultMessage?.content || "",
      formattedResult: tryFormatJson(resultMessage?.content || ""),
      status,
      summary: getToolSummary(toolCall.function.name, args, result, status),
    };
  });

const STATUS_LABELS: Record<ToolCallStatus, string> = {
  running: "执行中",
  success: "完成",
  error: "失败",
};

const TOOL_LABELS: Record<string, string> = {
  applyPatch: "修改文件",
  getDiagnostics: "运行诊断",
  readFile: "读取文件",
  searchFiles: "搜索文件",
  searchBlocks: "搜索积木",
  getBlockHelp: "查看积木",
  getScratchGuide: "读取指南",
  getProjectOverview: "项目概览",
  listFiles: "列出文件",
};

const parsePatchDiff = (patch: string): DiffFile[] => {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;

  String(patch || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((line) => {
      if (line.startsWith("*** Update File:")) {
        current = {
          path: line.slice("*** Update File:".length).trim(),
          added: 0,
          deleted: 0,
          lines: [],
          truncated: false,
        };
        files.push(current);
        oldLine = 0;
        newLine = 0;
        return;
      }

      if (!current || line === "*** Begin Patch" || line === "*** End Patch") return;

      if (current.lines.length >= MAX_DIFF_LINES) {
        current.truncated = true;
        return;
      }

      const hunkMatch = /^@@(?:\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?)?/.exec(line);
      if (hunkMatch) {
        oldLine = Number(hunkMatch[1] || 0);
        newLine = Number(hunkMatch[2] || 0);
        current.lines.push({ kind: "meta", text: line || "@@" });
        return;
      }

      if (line.startsWith("+")) {
        current.added += 1;
        current.lines.push({ kind: "add", text: line.slice(1), newLine: newLine || undefined });
        if (newLine) newLine += 1;
        return;
      }

      if (line.startsWith("-")) {
        current.deleted += 1;
        current.lines.push({ kind: "delete", text: line.slice(1), oldLine: oldLine || undefined });
        if (oldLine) oldLine += 1;
        return;
      }

      if (line.startsWith(" ")) {
        current.lines.push({
          kind: "context",
          text: line.slice(1),
          oldLine: oldLine || undefined,
          newLine: newLine || undefined,
        });
        if (oldLine) oldLine += 1;
        if (newLine) newLine += 1;
        return;
      }

      current.added += 1;
      current.lines.push({ kind: "add", text: line, newLine: newLine || undefined });
      if (newLine) newLine += 1;
    });

  return files.filter((file) => file.path);
};

const collectChangedFiles = (entries: ToolEntry[]) => {
  const byPath = new Map<string, { path: string; added: number; deleted: number; operations: number }>();

  entries.forEach((entry) => {
    if (entry.name !== "applyPatch") return;
    const diffFiles = parsePatchDiff(entry.args?.patch || "");
    diffFiles.forEach((file) => {
      const existing = byPath.get(file.path) || { path: file.path, added: 0, deleted: 0, operations: 0 };
      existing.added += file.added;
      existing.deleted += file.deleted;
      byPath.set(file.path, existing);
    });
    asArray(entry.result?.syncResults).forEach((syncResult: any) => {
      const path = syncResult?.path;
      if (!path) return;
      const existing = byPath.get(path) || { path, added: 0, deleted: 0, operations: 0 };
      existing.operations += Number(syncResult?.operationCount || 0);
      byPath.set(path, existing);
    });
  });

  return [...byPath.values()];
};

const countDiagnostics = (entries: ToolEntry[]) =>
  entries.reduce(
    (acc, entry) => {
      const diagnostics = asArray(entry.result?.diagnostics);
      diagnostics.forEach((item: any) => {
        acc.errors += asArray(item?.errors).length;
        acc.warnings += asArray(item?.warnings).length;
      });
      return acc;
    },
    { errors: 0, warnings: 0 },
  );

const ToolIcon = ({ status }: { status: ToolCallStatus }) => (
  <span className={`${toolStyles.toolCallGlyph} ${toolStyles[`toolCallGlyph${status}`]}`}>
    {status === "running" ? "" : status === "success" ? "✓" : "!"}
  </span>
);

const renderDiff = (entry: ToolEntry) => {
  const diffFiles = parsePatchDiff(entry.args?.patch || "");
  if (diffFiles.length === 0) return null;

  return (
    <div className={toolStyles.diffStack}>
      {diffFiles.map((file) => (
        <details key={file.path} className={toolStyles.diffFile} open={diffFiles.length <= 2}>
          <summary className={toolStyles.diffFileHeader}>
            <span className={toolStyles.diffFilePath}>{file.path}</span>
            <span className={toolStyles.diffStats}>
              <span className={toolStyles.diffAdded}>+{file.added}</span>
              <span className={toolStyles.diffDeleted}>-{file.deleted}</span>
            </span>
          </summary>
          <div className={toolStyles.diffBody}>
            {file.lines.map((line, index) => (
              <div key={`${file.path}-${index}`} className={`${toolStyles.diffLine} ${toolStyles[`diffLine${line.kind}`]}`}>
                <span className={toolStyles.diffLineNumber}>{line.oldLine ?? ""}</span>
                <span className={toolStyles.diffLineNumber}>{line.newLine ?? ""}</span>
                <span className={toolStyles.diffMarker}>
                  {line.kind === "add" ? "+" : line.kind === "delete" ? "-" : line.kind === "meta" ? "·" : " "}
                </span>
                <code>{line.text || " "}</code>
              </div>
            ))}
            {file.truncated ? <div className={toolStyles.diffTruncated}>已截断较长 diff</div> : null}
          </div>
        </details>
      ))}
    </div>
  );
};

const renderResultPreview = (entry: ToolEntry) => {
  if (entry.status === "running") {
    return <div className={toolStyles.toolCallMuted}>工具仍在运行...</div>;
  }

  if (entry.status === "error") {
    return <div className={toolStyles.toolErrorBox}>{entry.result?.error || entry.rawResult || "工具调用失败"}</div>;
  }

  if (entry.name === "applyPatch") {
    return (
      <div className={toolStyles.toolResultGrid}>
        <span>文件</span>
        <strong>{asArray(entry.result?.changedFiles).length || parsePatchDiff(entry.args?.patch || "").length}</strong>
        <span>脚本操作</span>
        <strong>{entry.result?.scriptOperationCount ?? 0}</strong>
      </div>
    );
  }

  if (entry.name === "getDiagnostics") {
    const diagnostics = countDiagnostics([entry]);
    return (
      <div className={toolStyles.toolResultGrid}>
        <span>状态</span>
        <strong>{entry.result?.valid ? "通过" : "需修复"}</strong>
        <span>错误</span>
        <strong>{diagnostics.errors}</strong>
        <span>警告</span>
        <strong>{diagnostics.warnings}</strong>
      </div>
    );
  }

  if (entry.name === "readFile") {
    return (
      <div className={toolStyles.toolResultGrid}>
        <span>路径</span>
        <strong>{entry.result?.path || entry.args?.path}</strong>
        <span>行数</span>
        <strong>{entry.result?.totalLines ?? "?"}</strong>
      </div>
    );
  }

  return <pre className={toolStyles.toolCompactJson}>{entry.formattedResult || "无返回内容"}</pre>;
};

export const ToolCallViewer: React.FC<ToolCallViewerProps> = ({
  toolCalls,
  toolResults = [],
  isGenerating = false,
}) => {
  const [expanded, setExpanded] = React.useState(true);
  const [expandedDetails, setExpandedDetails] = React.useState<Record<string, boolean>>({});

  const entries = React.useMemo(() => buildEntries(toolCalls, toolResults), [toolCalls, toolResults]);
  const runningCount = entries.filter((entry) => entry.status === "running").length;
  const successCount = entries.filter((entry) => entry.status === "success").length;
  const errorCount = entries.filter((entry) => entry.status === "error").length;
  const changedFiles = React.useMemo(() => collectChangedFiles(entries), [entries]);
  const diagnostics = React.useMemo(() => countDiagnostics(entries), [entries]);
  const hasRunning = runningCount > 0;

  React.useEffect(() => {
    setExpandedDetails((previous) => {
      let changed = false;
      const next = { ...previous };
      entries.forEach((entry) => {
        if (entry.name === "applyPatch" && entry.status !== "error" && next[entry.id] === undefined) {
          next[entry.id] = true;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [entries]);

  const toggleDetail = (id: string) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className={`${toolStyles.toolCallSummary} ${hasRunning ? toolStyles.toolCallSummaryRunning : ""}`}>
      <button type="button" className={toolStyles.toolCallSummaryHeader} onClick={() => setExpanded((prev) => !prev)}>
        <span className={`${toolStyles.toolCallPulse} ${hasRunning ? toolStyles.toolCallPulseActive : ""}`} />
        <span className={toolStyles.toolCallSummaryTitle}>
          {hasRunning ? "正在执行工具" : errorCount > 0 ? "工具调用完成，有失败项" : "工具调用完成"}
        </span>
        <span className={toolStyles.toolCallSummaryMeta}>
          {entries.length} 个工具 · {successCount} 成功{errorCount ? ` · ${errorCount} 失败` : ""}
        </span>
        <span className={toolStyles.toolCallChevron}>{expanded ? "⌃" : "⌄"}</span>
      </button>

      {expanded ? (
        <div className={toolStyles.toolCallBody}>
          {changedFiles.length > 0 || diagnostics.errors > 0 || diagnostics.warnings > 0 ? (
            <div className={toolStyles.toolRunSummary}>
              {changedFiles.length > 0 ? (
                <div className={toolStyles.changedFilesPanel}>
                  <div className={toolStyles.changedFilesHeader}>
                    <strong>{changedFiles.length} 个文件已更改</strong>
                    <span>
                      +{changedFiles.reduce((sum, file) => sum + file.added, 0)} -
                      {changedFiles.reduce((sum, file) => sum + file.deleted, 0)}
                    </span>
                  </div>
                  <div className={toolStyles.changedFileList}>
                    {changedFiles.map((file) => (
                      <div key={file.path} className={toolStyles.changedFileItem}>
                        <span>{file.path}</span>
                        <span>
                          <b className={toolStyles.diffAdded}>+{file.added}</b>{" "}
                          <b className={toolStyles.diffDeleted}>-{file.deleted}</b>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {diagnostics.errors > 0 || diagnostics.warnings > 0 ? (
                <div className={toolStyles.diagnosticPills}>
                  <span className={diagnostics.errors > 0 ? toolStyles.diagnosticPillError : toolStyles.diagnosticPillOk}>
                    {diagnostics.errors} 个错误
                  </span>
                  <span className={diagnostics.warnings > 0 ? toolStyles.diagnosticPillWarn : toolStyles.diagnosticPillOk}>
                    {diagnostics.warnings} 个警告
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={toolStyles.toolCallList}>
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`${toolStyles.toolCallItem} ${
                  entry.status === "running" ? toolStyles.toolCallItemRunning : ""
                }`}
              >
                <button type="button" className={toolStyles.toolCallItemHeader} onClick={() => toggleDetail(entry.id)}>
                  <ToolIcon status={entry.status} />
                  <span className={toolStyles.toolCallName}>{TOOL_LABELS[entry.name] || entry.name}</span>
                  <span className={toolStyles.toolCallSummaryLine}>{entry.summary}</span>
                  <span className={`${toolStyles.toolCallStatus} ${toolStyles[`toolCallStatus${entry.status}`]}`}>
                    {STATUS_LABELS[entry.status]}
                  </span>
                </button>
                {expandedDetails[entry.id] ? (
                  <div className={toolStyles.toolCallDetail}>
                    {renderDiff(entry)}
                    <div className={toolStyles.toolCallSection}>
                      <div className={toolStyles.toolCallSectionTitle}>结果</div>
                      {renderResultPreview(entry)}
                    </div>
                    <details className={toolStyles.rawToolDetails}>
                      <summary>原始参数 / 返回</summary>
                      <div className={toolStyles.toolCallRawGrid}>
                        <div className={toolStyles.toolCallSection}>
                          <div className={toolStyles.toolCallSectionTitle}>参数</div>
                          <pre>{entry.formattedArguments || "{}"}</pre>
                        </div>
                        <div className={toolStyles.toolCallSection}>
                          <div className={toolStyles.toolCallSectionTitle}>返回</div>
                          <pre>{entry.formattedResult || stringifyCompact(entry.rawResult) || "无返回内容"}</pre>
                        </div>
                      </div>
                    </details>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
