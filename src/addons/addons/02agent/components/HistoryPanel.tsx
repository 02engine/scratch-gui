import * as React from "react";
import shell from "../ui/Shell.module.less";
import { BridgeStatus, ChatSession } from "../types";

interface HistoryPanelProps {
  sessions: ChatSession[];
  currentSessionId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  bridgeStatus?: BridgeStatus;
  bridgeEnabled?: boolean;
  bridgePort?: number;
  bridgeLastError?: string;
  onToggleBridge?: () => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  sessions,
  currentSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  bridgeStatus = "disabled",
  bridgeEnabled = false,
  bridgePort = 40202,
  bridgeLastError = "",
  onToggleBridge,
}) => {
  const [showSkillHelp, setShowSkillHelp] = React.useState(false);
  const bridgeTitle = bridgeEnabled
    ? bridgeStatus === "connected"
      ? `02Agent bridge 已连接到 127.0.0.1:${bridgePort}。外部 OpenCode/Codex/Claude skill 可以动态读取 tools/prompt 并代理调用当前项目。`
      : bridgeLastError || `等待 AI/Skill 启动 127.0.0.1:${bridgePort} 桥接服务。启动后会自动连接。`
    : `连接本机 02Agent Skill。点击后插件会等待 OpenCode/AI 自动启动 bridge，并在启动后同步 tools/prompt。`;

  return (
    <div className={shell.sidebar}>
      <div className={shell.sidebarHeader}>
        <div className={shell.sidebarBrand}>
          <span className={shell.sidebarBrandMark}>02</span>
          <div className={shell.sidebarBrandText}>
            <span className={shell.sidebarBrandTitle}>02Agent</span>
            <div className={shell.sidebarBrandSubtitle}>项目会话</div>
          </div>
          <button
            type="button"
            className={`${shell.bridgeButton} ${bridgeEnabled ? shell.bridgeButtonEnabled : ""} ${
              bridgeStatus === "connected" ? shell.bridgeButtonConnected : ""
            }`}
            onClick={onToggleBridge}
            title={bridgeTitle}
            aria-label="连接 02Agent 本机 bridge"
          >
            连接Skill
          </button>
          <button
            type="button"
            className={shell.skillHelpButton}
            onClick={() => setShowSkillHelp((current) => !current)}
            title="查看 02Agent Skill 安装和能力说明"
            aria-label="查看 02Agent Skill 安装和能力说明"
            aria-expanded={showSkillHelp}
          >
            ...
          </button>
        </div>
        {showSkillHelp ? (
          <div className={shell.skillHelpCard} role="note">
            <div className={shell.skillHelpTitle}>安装 02Agent Skill</div>
            <div className={shell.skillHelpText}>
              请前往{" "}
              <a href="https://github.com/02engine/02engine-02agent-skill" target="_blank" rel="noreferrer">
                github.com/02engine/02engine-02agent-skill
              </a>{" "}
              获取安装说明。
            </div>
            <div className={shell.skillHelpText}>
              使用 Skill 后，OpenCode/AI 可以读取当前 Scratch 项目的角色、造型、积木脚本和项目概览，并通过本机 bridge 调用 02Agent 工具来创建角色、修改脚本、管理造型、检查项目结构和协助调试。
            </div>
          </div>
        ) : null}
      </div>
      <button onClick={onNewChat} className={shell.sidebarNewChat} title="新对话">
        <span className={shell.navIcon}>＋</span>
        <span>新对话</span>
      </button>
      <div className={shell.sidebarSectionLabel}>最近</div>
      <div className={shell.historyList}>
        {sessions.length === 0 ? <div className={shell.historyEmpty}>还没有会话，开始一个新的提问吧。</div> : null}
        {sessions.map((s) => (
          <button
            type="button"
            key={s.id}
            className={`${shell.historyItem} ${currentSessionId === s.id ? shell.historyItemActive : ""}`}
            onClick={() => onSelectSession(s.id)}
          >
            <span className={shell.historyItemMain}>
              <span className={shell.historyTitle}>{s.title}</span>
            </span>
            <span
              role="button"
              tabIndex={0}
              className={shell.deleteSessionButton}
              onClick={(e) => onDeleteSession(s.id, e)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onDeleteSession(s.id, e as unknown as React.MouseEvent);
                }
              }}
              title="删除对话"
            >
              ×
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
