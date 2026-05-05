import * as React from "react";
import shell from "../ui/Shell.module.less";
import { ChatSession } from "../types";

interface HistoryPanelProps {
  sessions: ChatSession[];
  currentSessionId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  sessions,
  currentSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
}) => {
  return (
    <div className={shell.sidebar}>
      <div className={shell.sidebarHeader}>
        <div className={shell.sidebarBrand}>
          <span className={shell.sidebarBrandMark}>02</span>
          <div>
            <span className={shell.sidebarBrandTitle}>02Agent</span>
            <div className={shell.sidebarBrandSubtitle}>项目会话</div>
          </div>
        </div>
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
