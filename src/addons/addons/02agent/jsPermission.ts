/**
 * Permission policy for the `runJavaScript` built-in tool.
 *
 * The tool executes model-written JavaScript. Because that code can touch page
 * globals (localStorage credentials, the Scratch VM, network), the user picks how
 * much freedom it gets:
 *
 *  - `readonly` (仅查看): mutations are denied — every nested `sdk.call` runs with
 *    `denyMutations`, and `sdk.vm` is not provided. The code can read and compute,
 *    but cannot change the project or call mutating tools.
 *  - `review` (审核): the code is shown to the user and must be approved before it
 *    runs. Denial is a normal result, not an exception. This is the default.
 *  - `open` (开放): runs immediately with full page access.
 *
 * Approval is bridged from this plain module to React state via `bindApproval`, so
 * `toolRuntime` (framework-free) can await a user decision without importing React.
 */

export type JsPermissionMode = "readonly" | "review" | "open";

export const JS_PERMISSION_STORAGE_KEY = "02AGENT_JS_PERMISSION";

export const JS_PERMISSION_MODES: JsPermissionMode[] = ["readonly", "review", "open"];

export const DEFAULT_JS_PERMISSION: JsPermissionMode = "review";

export const JS_PERMISSION_LABELS: Record<JsPermissionMode, string> = {
  readonly: "仅查看",
  review: "审核",
  open: "开放",
};

export const JS_PERMISSION_DESCRIPTIONS: Record<JsPermissionMode, string> = {
  readonly: "代码可以读取和计算，但所有修改类操作会被拒绝，也无法直接操作编辑器 VM。",
  review: "执行前先把代码展示给你，你点「允许」才运行。默认选项。",
  open: "直接执行，拥有页面全部权限（可读写项目、访问网络与 localStorage）。",
};

export function getJsPermissionMode(): JsPermissionMode {
  try {
    const raw = localStorage.getItem(JS_PERMISSION_STORAGE_KEY);
    if (raw === "readonly" || raw === "review" || raw === "open") return raw;
  } catch {
    /* ignore storage errors */
  }
  return DEFAULT_JS_PERMISSION;
}

export function setJsPermissionMode(mode: JsPermissionMode): void {
  try {
    localStorage.setItem(JS_PERMISSION_STORAGE_KEY, mode);
  } catch {
    /* ignore storage errors */
  }
}

type ApprovalHandler = (code: string) => Promise<boolean>;

let approvalHandler: ApprovalHandler | null = null;

/** Wire the UI's approval dialog. Returns an unbind function. */
export function bindJsApprovalHandler(handler: ApprovalHandler | null): () => void {
  approvalHandler = handler;
  return () => {
    if (approvalHandler === handler) approvalHandler = null;
  };
}

/**
 * Ask the user to approve `code`. Fails closed: with no bound handler the request
 * is denied rather than silently executed.
 */
export async function requestJsApproval(code: string): Promise<boolean> {
  if (!approvalHandler) {
    return false;
  }
  try {
    return (await approvalHandler(code)) === true;
  } catch {
    return false;
  }
}
