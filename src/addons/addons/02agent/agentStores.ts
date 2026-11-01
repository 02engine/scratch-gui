/**
 * Shared persistence + UI bridges for the collaboration tools:
 *
 *  - Long-term / project memory  (listMemoryBlocks / getMemoryBlock / setMemoryBlock /
 *    replaceMemoryBlockText / deleteMemoryBlock)
 *  - Task list                   (updateTodoList)
 *  - Clarification dialog        (askUser) — bridged to React, same pattern as jsPermission
 *
 * Memory blocks are plain {id, scope, title?, text, updatedAt} rows in localStorage.
 * Long-term memory is global; project memory travels with the currently loaded project
 * (keyed by the project id known to the editor, with a fallback single key).
 */

export type MemoryScope = "project" | "longTerm";

export interface MemoryBlock {
  id: string;
  scope: MemoryScope;
  title?: string;
  text: string;
  updatedAt: number;
}

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface TodoItem {
  id: string;
  title: string;
  status: TodoStatus;
}

const LONGTERM_KEY = "02AGENT_MEMORY_LONGTERM";
const PROJECT_KEY_PREFIX = "02AGENT_MEMORY_PROJECT_";
const TODOS_KEY = "02AGENT_TODOS";

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const safeId = () => `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Best-effort current project id; falls back to a single shared bucket. */
const getCurrentProjectKey = (): string => {
  try {
    const connection = (window as any)?.__02agent_project_id__;
    const id = typeof connection === "string" && connection.trim() ? connection.trim() : "";
    return id ? `${PROJECT_KEY_PREFIX}${id}` : `${PROJECT_KEY_PREFIX}default`;
  } catch {
    return `${PROJECT_KEY_PREFIX}default`;
  }
};

const scopeKey = (scope: MemoryScope) => (scope === "longTerm" ? LONGTERM_KEY : getCurrentProjectKey());

const normalizeBlocks = (rows: MemoryBlock[] | undefined): MemoryBlock[] =>
  Array.isArray(rows)
    ? rows.filter(
        (row) => row && typeof row.id === "string" && typeof row.text === "string" && row.text.trim().length > 0,
      )
    : [];

// ---------------------------------------------------------------- memory

export const listMemoryBlocks = (scope?: MemoryScope, query?: string): MemoryBlock[] => {
  const keys = scope ? [scopeKey(scope)] : [LONGTERM_KEY, getCurrentProjectKey()];
  const rows: MemoryBlock[] = [];
  for (const key of keys) rows.push(...normalizeBlocks(readJson<MemoryBlock[]>(key, [])));
  const needle = query?.trim().toLowerCase();
  if (!needle) return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows
    .filter((row) => `${row.title || ""}\n${row.text}`.toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getMemoryBlock = (id: string): MemoryBlock | undefined => {
  for (const key of [LONGTERM_KEY, getCurrentProjectKey()]) {
    const row = normalizeBlocks(readJson<MemoryBlock[]>(key, [])).find((item) => item.id === id);
    if (row) return row;
  }
  return undefined;
};

export const setMemoryBlock = (input: { id?: string; scope: MemoryScope; title?: string; text: string }) => {
  const key = scopeKey(input.scope);
  const rows = normalizeBlocks(readJson<MemoryBlock[]>(key, []));
  const text = String(input.text || "").trim();
  if (!text) throw new Error("memory text 不能为空");
  const targetId = input.id?.trim() || safeId();
  const existing = rows.findIndex((row) => row.id === targetId);
  const block: MemoryBlock = {
    id: targetId,
    scope: input.scope,
    title: input.title?.trim() || undefined,
    text,
    updatedAt: Date.now(),
  };
  if (existing >= 0) {
    const previous = rows[existing];
    block.scope = previous.scope; // keep the original bucket when overwriting
    rows[existing] = block;
  } else {
    rows.push(block);
  }
  if (!writeJson(key, rows)) throw new Error("写入记忆失败（localStorage 不可用）");
  return { block, updated: existing >= 0 };
};

export const replaceMemoryBlockText = (id: string, find: string, replacement: string) => {
  for (const key of [LONGTERM_KEY, getCurrentProjectKey()]) {
    const rows = normalizeBlocks(readJson<MemoryBlock[]>(key, []));
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) continue;
    const block = rows[index];
    if (!block.text.includes(find)) {
      throw new Error(`记忆 ${id} 中没有找到需要替换的原文前 ${Math.min(find.length, 40)} 个字符`);
    }
    const updatedText = block.text.replace(find, replacement);
    rows[index] = { ...block, text: updatedText, updatedAt: Date.now() };
    if (!writeJson(key, rows)) throw new Error("写入记忆失败（localStorage 不可用）");
    return rows[index];
  }
  throw new Error(`没有找到 id 为 ${id} 的记忆`);
};

export const deleteMemoryBlock = (id: string) => {
  for (const key of [LONGTERM_KEY, getCurrentProjectKey()]) {
    const rows = normalizeBlocks(readJson<MemoryBlock[]>(key, []));
    const next = rows.filter((row) => row.id !== id);
    if (next.length === rows.length) continue;
    if (!writeJson(key, next)) throw new Error("写入记忆失败（localStorage 不可用）");
    return true;
  }
  throw new Error(`没有找到 id 为 ${id} 的记忆`);
};

// ---------------------------------------------------------------- todos

export const listTodos = (): TodoItem[] =>
  normalizeTodoRows(readJson<TodoItem[]>(TODOS_KEY, []));

const normalizeTodoRows = (rows: TodoItem[] | undefined): TodoItem[] =>
  Array.isArray(rows)
    ? rows
        .filter((row) => row && typeof row.title === "string" && row.title.trim())
        .map((row, index) => ({
          id: typeof row.id === "string" && row.id ? row.id : `todo-${index}`,
          title: row.title.trim(),
          status: normalizeTodoStatus(row.status),
        }))
    : [];

const normalizeTodoStatus = (status: unknown): TodoStatus =>
  status === "in_progress" || status === "completed" || status === "cancelled" ? status : "pending";

export const updateTodos = (
  todos: TodoItem[],
): { todos: TodoItem[]; counts: Record<TodoStatus, number> } => {
  const next = normalizeTodoRows(todos);
  if (!writeJson(TODOS_KEY, next)) throw new Error("写入待办失败（localStorage 不可用）");
  const counts: Record<TodoStatus, number> = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
  next.forEach((row) => {
    counts[row.status] += 1;
  });
  return { todos: next, counts };
};


// ---------------------------------------------------------------- subagent bridge

/** Built-in 子智能体预设：每个 preset 是一段独立 system prompt。 */
export const SUBAGENT_PRESETS: Record<string, { label: string; systemPrompt: string }> = {
    critic: {
        label: "审查员",
        systemPrompt:
            "You are a strict code-review subagent for Scratch/02engine projects. Review the given task or diff for correctness, edge cases, and maintainability. Do not execute changes; return findings as concise numbered issues with severity (blocker/warn/nit), plus an overall verdict (pass / needs-changes). Be specific and brief. You may use the provided read-only tools to verify facts before flagging; never modify the project.",
    },
    tester: {
        label: "测试员",
        systemPrompt:
            "You are a testing subagent for Scratch/02engine projects. Given a task description, produce a minimal test plan: what to click/run, expected result per step, and the riskiest edge cases. Output as a short ordered checklist. Do not execute anything; you may use the provided read-only tools to ground expectations in the actual project state.",
    },
    researcher: {
        label: "研究员",
        systemPrompt:
            "You are a research subagent. Given a question, reason over the provided context and return: (1) the direct answer, (2) key evidence or facts used, (3) remaining uncertainties. Keep it under 300 words. You may use the provided read-only tools to check facts; never modify the project. If the tools and context cannot answer it, say what is missing instead of guessing.",
    },
};

export interface SubagentDef {
  /** Stable identifier == user-facing profile name (used by runSubAgent). */
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
}

/** Built-in defaults exposed in settings and editable/clonable there. */
export const BUILTIN_SUBAGENTS: SubagentDef[] = Object.entries(SUBAGENT_PRESETS).map(([key, preset]) => ({
  id: key,
  name: preset.label,
  description: `内置预设（${key}）`,
  systemPrompt: preset.systemPrompt,
}));

let subagentDefs: SubagentDef[] = [];

/** Replace the user-managed list (empty list falls back to builtins at resolution time). */
export const setSubagentDefinitions = (defs: SubagentDef[]) => {
  subagentDefs = Array.isArray(defs)
    ? defs
        .filter((def) => def && def.id?.trim() && def.systemPrompt?.trim())
        .map((def) => ({ ...def, id: def.id.trim(), name: def.name?.trim() || def.id.trim() }))
    : [];
};

/** Resolve by id (profile enum) or Chinese label; custom entries win, builtins are the fallback. */
export const getSubagentDefinition = (profile: string): SubagentDef | undefined =>
  subagentDefs.find((def) => def.id === profile || def.name === profile) ||
  subagentDefs.find((def) => def.name === SUBAGENT_PRESETS[profile]?.label) ||
  (SUBAGENT_PRESETS[profile]
    ? { id: profile, name: SUBAGENT_PRESETS[profile].label, systemPrompt: SUBAGENT_PRESETS[profile].systemPrompt }
    : undefined);

export const listSubagentDefinitions = (): Array<{ id: string; name: string; description: string }> => [
  ...subagentDefs.map((def) => ({ id: def.id, name: def.name, description: def.description || "" })),
  ...Object.entries(SUBAGENT_PRESETS).map(([key, preset]) => ({ id: key, name: preset.label, description: `${preset.label}（内置）` })),
];


// ---------------------------------------------------------------- subagent results (background)

export interface SubagentResultEntry {
  id: string;
  profile: string;
  task: string;
  status: "running" | "completed" | "error";
  summary?: string;
  error?: string;
  /** Set when a run ended early but still produced usable content. */
  partial?: boolean;
  startedAt: number;
  finishedAt?: number;
}

const SUBAGENT_RESULTS_KEY = "02AGENT_SUBAGENT_RESULTS";

const readResults = (): SubagentResultEntry[] => {
  try {
    const raw = localStorage.getItem(SUBAGENT_RESULTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-50) : [];
  } catch {
    return [];
  }
};

const writeResults = (rows: SubagentResultEntry[]) => {
  try {
    localStorage.setItem(SUBAGENT_RESULTS_KEY, JSON.stringify(rows.slice(-50)));
  } catch {
    /* ignore quota errors */
  }
};

export const createSubagentResult = (profile: string, task: string): SubagentResultEntry => {
  const entry: SubagentResultEntry = {
    id: `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    profile,
    task,
    status: "running",
    startedAt: Date.now(),
  };
  writeResults([...readResults(), entry]);
  return entry;
};

export const finishSubagentResult = (id: string, patch: Partial<SubagentResultEntry>) => {
  const rows = readResults().map((row) =>
    row.id === id ? { ...row, ...patch, finishedAt: Date.now() } : row,
  );
  writeResults(rows);
  const finished = rows.find((row) => row.id === id);
  if (finished && resultListener) resultListener(finished);
};

export const listSubagentResults = (): SubagentResultEntry[] => readResults();

type SubagentResultListener = (entry: SubagentResultEntry) => void;
let resultListener: SubagentResultListener | null = null;

export const bindSubagentResultListener = (listener: SubagentResultListener | null): (() => void) => {
  resultListener = listener;
  return () => {
    if (resultListener === listener) resultListener = null;
  };
};

export interface SubagentResult {
    profile: string;
    task: string;
    summary: string;
    /** True when the run ended early (e.g. adapter error) but produced usable content. */
    partial?: boolean;
}

type SubagentRunner = (profile: string, task: string, context?: string) => Promise<SubagentResult>;

let subagentRunner: SubagentRunner | null = null;

export const bindSubagentRunner = (runner: SubagentRunner | null): (() => void) => {
    subagentRunner = runner;
    return () => {
        if (subagentRunner === runner) subagentRunner = null;
    };
};

export const runSubagentProfile = async (
    profile: string,
    task: string,
    context?: string,
): Promise<SubagentResult> => {
    if (!subagentRunner) {
        throw new Error("子智能体当前不可用（宿主未就绪）。请直接基于现有上下文继续任务。");
    }
    return subagentRunner(profile, task, context);
};


// ---------------------------------------------------------------- skills bridge

export interface SkillEntry {
  id: string;
  name: string;
  description?: string;
  content: string;
}

type SkillsProvider = () => SkillEntry[];

let skillsProvider: SkillsProvider | null = null;

export const bindSkillsProvider = (provider: SkillsProvider | null): (() => void) => {
  skillsProvider = provider;
  return () => {
    if (skillsProvider === provider) skillsProvider = null;
  };
};


export interface SkillWriteInput {
  id?: string;
  name: string;
  description?: string;
  content: string;
}

export interface SkillWriteResult {
  status: "created" | "updated";
  id: string;
  enabled: boolean;
  /** Display name of the skill, filled in by the store when notifying listeners. */
  name?: string;
}

type SkillsWriter = (input: SkillWriteInput, author: "ai") => SkillWriteResult | null;
let skillsWriter: SkillsWriter | null = null;

/** Host registers its real skills state setter; returns null when unavailable. */
export const bindSkillsWriter = (writer: SkillsWriter | null): (() => void) => {
  skillsWriter = writer;
  return () => {
    if (skillsWriter === writer) skillsWriter = null;
  };
};

/** AI writes are review-gated: the entry is stored with enabled=false on both create and content update. */
export const writeSkillByAuthor = (input: SkillWriteInput, author: "ai"): SkillWriteResult => {
  if (!skillsWriter) {
    throw new Error("当前没有可写的技能存储（宿主未就绪）。请把这条流程贴给用户，或稍后再试。");
  }
  const result = skillsWriter(input, author);
  if (!result) throw new Error("技能写入失败（宿主拒绝）。请直接告知用户。");
  try {
    notifySkillsChanged({ ...result, name: input.name });
  } catch {
    /* listener errors must not fail the write */
  }
  return result;
};

// ---------------------------------------------------------------- skills-changed reflow

type SkillsChangedListener = (result: SkillWriteResult) => void;
let skillsChangedListener: SkillsChangedListener | null = null;

/** Host subscribes so the model learns about AI-written skills in its next turn. */
export const bindSkillsChangedListener = (listener: SkillsChangedListener | null): (() => void) => {
  skillsChangedListener = listener;
  return () => {
    if (skillsChangedListener === listener) skillsChangedListener = null;
  };
};

const notifySkillsChanged = (result: SkillWriteResult) => {
  skillsChangedListener?.(result);
};


// ---------------------------------------------------------------- image model bridge (for ai-generated costumes)

export interface ImageModelConfig {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

type ImageModelResolver = () => ImageModelConfig | null;
let imageModelResolver: ImageModelResolver | null = null;

export const bindImageModelResolver = (resolver: ImageModelResolver | null): (() => void) => {
  imageModelResolver = resolver;
  return () => {
    if (imageModelResolver === resolver) imageModelResolver = null;
  };
};

export const resolveImageModel = (): ImageModelConfig | null => imageModelResolver?.() || null;

// ---------------------------------------------------------------- generic status notice bridge

type NoticeListener = (text: string, autoClearMs?: number) => void;
let noticeListener: NoticeListener | null = null;

export const bindNoticeListener = (listener: NoticeListener | null): (() => void) => {
  noticeListener = listener;
  return () => {
    if (noticeListener === listener) noticeListener = null;
  };
};

/** Tools push user-facing tips; the host renders them as a transient status notice. */
export const pushNotice = (text: string, autoClearMs?: number) => {
  noticeListener?.(text, autoClearMs);
};

/** Enabled skills only, normalized (trimmed, non-empty names). */
export const getEnabledSkills = (): SkillEntry[] =>
  skillsProvider
    ? skillsProvider().filter((skill) => skill && skill.name?.trim() && skill.content?.trim())
    : [];

// ---------------------------------------------------------------- askUser bridge

export type AskUserQuestionType = "choice" | "input" | "multiChoice";

export interface AskUserQuestion {
  id: string;
  question: string;
  questionType?: AskUserQuestionType;
  options?: string[];
}

export interface AskUserRequest {
  questions: AskUserQuestion[];
  context?: string;
}

export interface AskUserAnswered {
  id: string;
  question: string;
  answer: string;
}

type AskUserHandler = (questions: AskUserQuestion[], context?: string) => Promise<AskUserAnswered[]>;

let askUserHandler: AskUserHandler | null = null;

export const bindAskUserHandler = (handler: AskUserHandler | null): (() => void) => {
  askUserHandler = handler;
  return () => {
    if (askUserHandler === handler) askUserHandler = null;
  };
};

/** Fail closed when no dialog is mounted: the model learns asking is unavailable. */
export const requestUserInput = async (
  questions: AskUserQuestion[],
  context?: string,
): Promise<AskUserAnswered[]> => {
  if (!askUserHandler) {
    throw new Error("当前没有可用的向用户提问的界面（askUser 未启用）。请直接基于现有信息继续，或列出假设。");
  }
  return askUserHandler(questions, context);
};
