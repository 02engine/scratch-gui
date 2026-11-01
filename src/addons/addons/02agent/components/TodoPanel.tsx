import * as React from "react";
import chat from "../ui/Chat.module.less";
import { TodoItem, TodoStatus } from "../agentStores";

const STATUS_LABEL: Record<TodoStatus, string> = {
    pending: "待做",
    in_progress: "进行中",
    completed: "已完成",
    cancelled: "已取消",
};

const STATUS_COLOR: Record<TodoStatus, string> = {
    pending: "#9e9e9e",
    in_progress: "#f5ad35",
    completed: "#46c485",
    cancelled: "#8a8a8a",
};

const STATUS_MARK: Record<TodoStatus, string> = {
    pending: "○",
    in_progress: "◐",
    completed: "✓",
    cancelled: "✕",
};

/**
 * Floating task list driven by the updateTodoList tool. Collapsed shows a compact
 * progress chip; expanded lists every todo with its status.
 */
export const TodoPanel: React.FC<{ todos: TodoItem[] }> = ({ todos }) => {
    const [expanded, setExpanded] = React.useState(false);

    if (todos.length === 0) return null;

    const active = todos.filter((todo) => todo.status === "in_progress").length;
    const done = todos.filter((todo) => todo.status === "completed").length;
    const progressLabel = done < todos.length ? `${done}/${todos.length}` : "全部完成";

    return (
        <div className={`${chat.todoPanel}${expanded ? ` ${chat.todoPanelExpanded}` : ""}`}>
            <button type="button" className={chat.todoChip} onClick={() => setExpanded((value) => !value)}>
                <span className={chat.todoChipLabel}>任务</span>
                <span className={chat.todoChipProgress}>{progressLabel}</span>
                {active > 0 ? <span className={chat.todoChipActive}>{active} 进行中</span> : null}
                <span className={chat.todoChipToggle} aria-hidden="true">
                    {expanded ? "▾" : "▸"}
                </span>
            </button>
            {expanded ? (
                <ul className={chat.todoList}>
                    {todos.map((todo) => (
                        <li key={todo.id || todo.title} className={chat.todoListItem}>
                            <span
                                className={chat.todoStatus}
                                style={{ color: STATUS_COLOR[todo.status] || STATUS_COLOR.pending }}
                            >
                                {STATUS_MARK[todo.status]} {STATUS_LABEL[todo.status]}
                            </span>
                            <span className={chat.todoTitle}>{todo.title}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
};
