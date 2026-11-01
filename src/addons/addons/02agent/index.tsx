import * as React from "react";
import ReactDOM from "react-dom";
import themeStyles from "./ui/Theme.module.less";
import shell from "./ui/Shell.module.less";
import ExpansionBox, { ExpansionRect } from "./shims/components/ExpansionBox.tsx";
import { useStoredState } from "./hooks/useStoredState";
import { registerContextMenu } from "./contextMenu";
import Launcher from "./components/Launcher";
import { HistoryPanel } from "./components/HistoryPanel";
import { SettingsModal } from "./components/SettingsModal";
import { DebugPanel } from "./components/DebugPanel";
import { ChatArea } from "./components/ChatArea";
import { InputArea } from "./components/InputArea";
import { AttachmentInteractionLayer } from "./components/AttachmentInteractionLayer";
import { JsApprovalDialog, JsApprovalRequest } from "./components/JsApprovalDialog";
import { QuestionsDialog } from "./components/QuestionsDialog";
import { CompactionPreview } from "./components/CompactionPreview";
import { TodoPanel } from "./components/TodoPanel";
import { AskUserAnswered, AskUserRequest, bindAskUserHandler } from "./agentStores";
import {
    JsPermissionMode,
    getJsPermissionMode,
    setJsPermissionMode,
    bindJsApprovalHandler,
} from "./jsPermission";
import { SelectionHint } from "./components/SelectionHint";
import { useAgents } from "./hooks/useAgents";
import { useAttachmentInteraction } from "./hooks/useAttachmentInteraction";
import { useBlockRangeSelection } from "./hooks/useBlockRangeSelection";
import { useChatSessions } from "./hooks/useChatSessions";
import { useChat } from "./hooks/useChat";
import { useBridgeClient } from "./hooks/useBridgeClient";
import { Attachment, MCPServerConfig, SkillConfig, PromptConfig, SubagentDef } from "./types";
import { bindSkillsWriter } from "./agentStores";
import { toolConfigStore } from "./toolConfigStore";
import { getAttachmentDisplayName } from "./attachmentUtils";
import { callGetBlockInfo, setRuntime } from "./converter";
import { exportConversationText } from "./conversationExport";
// import { ConverterDebugger } from "./components/ConverterDebugger";

const DEFAULT_CONTAINER_INFO = {
    width: 800,
    height: 600,
    translateX: 100,
    translateY: 50,
};

type ThemeMode = "dark" | "light";
type AgentProps = PluginContext & { editorThemeMode?: ThemeMode };

const IconMenu = () => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
);

const IconArrowLeft = () => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
    </svg>
);

const Agent: React.FC<AgentProps> = ({ vm, workspace, editorThemeMode = "light" }) => {
    console.log(`[02Agent] Rendering\n vm:`, vm)
    const [visible, setVisible] = React.useState(false);

    const [isAgentMenuOpen, setIsAgentMenuOpen] = React.useState(false);
    const [isComposerExpanded, setIsComposerExpanded] = React.useState(false);
    const [themeMode, setThemeMode] = React.useState<ThemeMode>(editorThemeMode);
    const agentMenuRef = React.useRef<HTMLDivElement | null>(null);
    const [enableReasoning, setEnableReasoning] = useStoredState<boolean>("02AGENT_ENABLE_REASONING", false);
    const [planMode, setPlanMode] = useStoredState<boolean>("02AGENT_PLAN_MODE", false);
    const [debugMode, setDebugMode] = useStoredState<boolean>("02AGENT_DEBUG_MODE", false);
    const [mcpServers, setMCPServers] = useStoredState<MCPServerConfig[]>("02AGENT_MCP_SERVERS", []);
    const [disabledTools, setDisabledTools] = useStoredState<string[]>("02AGENT_DISABLED_TOOLS", []);
    const [skills, setSkills] = useStoredState<SkillConfig[]>("02AGENT_SKILLS", []);
    const [subagents, setSubagents] = useStoredState<SubagentDef[]>("02AGENT_SUBAGENTS", []);
    const [promptConfig, setPromptConfig] = useStoredState<PromptConfig>("02AGENT_SYSTEM_PROMPT", { mode: "append", text: "", includeBase: true });
    const [jsPermission, setJsPermissionState] = React.useState<JsPermissionMode>(() => getJsPermissionMode());
    const [jsApprovalRequest, setJsApprovalRequest] = React.useState<JsApprovalRequest | null>(null);
    const [askUserRequest, setAskUserRequest] = React.useState<AskUserRequest | null>(null);
    const askUserResolverRef = React.useRef<((answers: AskUserAnswered[]) => void) | null>(null);

    const setAskUser = React.useCallback((request: AskUserRequest | null) => {
        setAskUserRequest(request);
    }, []);

    const resolveAskUser = React.useCallback((answers: AskUserAnswered[]) => {
        const resolve = askUserResolverRef.current;
        askUserResolverRef.current = null;
        setAskUserRequest(null);
        resolve?.(answers);
    }, []);

    // Bridge the askUser tool request into React state (fail closed when unmounted).
    React.useEffect(() => {
        const unbind = bindAskUserHandler(
            (questions, context) =>
                new Promise((resolve) => {
                    askUserResolverRef.current = resolve;
                    setAskUserRequest({ questions, context });
                }),
        );
        return () => {
            unbind();
            askUserResolverRef.current?.([]);
            askUserResolverRef.current = null;
        };
    }, []);
    const jsApprovalResolverRef = React.useRef<((approved: boolean) => void) | null>(null);

    const setJsPermission = React.useCallback((mode: JsPermissionMode) => {
        setJsPermissionMode(mode);
        setJsPermissionState(mode);
    }, []);

    // Bridge the framework-free toolRuntime approval request into React state (审核 mode).
    React.useEffect(() => {
        const unbind = bindJsApprovalHandler(
            (code: string) =>
                new Promise<boolean>((resolve) => {
                    jsApprovalResolverRef.current = resolve;
                    setJsApprovalRequest({ id: Date.now(), code });
                }),
        );
        return () => {
            unbind();
            jsApprovalResolverRef.current?.(false);
            jsApprovalResolverRef.current = null;
        };
    }, []);

    const resolveJsApproval = React.useCallback((approved: boolean) => {
        const resolve = jsApprovalResolverRef.current;
        jsApprovalResolverRef.current = null;
        setJsApprovalRequest(null);
        resolve?.(approved);
    }, []);
    // Bridge the AI built-in management tools (manageMCPServers / manageSkills) to
    // this live state — done in an effect instead of during render.
    React.useEffect(() => {
        toolConfigStore.bind({ mcpServers, setMCPServers, skills, setSkills });
    }, [mcpServers, setMCPServers, skills, setSkills]);
    const [showDebugPanel, setShowDebugPanel] = React.useState(false);

    const [containerInfo, setContainerInfo] = useStoredState<ExpansionRect>(
        "02AGENT_CONTAINER_INFO",
        DEFAULT_CONTAINER_INFO,
    );

    const containerInfoRef = React.useRef(containerInfo);
    const useDrawerHistory = containerInfo.width < 760;

    React.useEffect(() => {
        setThemeMode(editorThemeMode);
    }, [editorThemeMode]);

    React.useEffect(() => {
        containerInfoRef.current = containerInfo;
    }, [containerInfo]);

    // Use custom hooks for complex logic
    const {
        agents,
        flattenedModels,
        currentModelId,
        setCurrentModelId,
        currentAgent,
        showSettings,
        setShowSettings,
        editingAgent,
        setEditingAgent,
        handleSaveAgent,
        handleDeleteAgent,
        handleExportAgent,
        handleImportAgents,
    } = useAgents();

    const {
        sessions,
        currentSessionId,
        currentSession,
        messages,
        isLeftPanelOpen,
        setIsLeftPanelOpen,
        showHistoryModal,
        setShowHistoryModal,
        handleNewChat,
        handleSelectSession,
        handleDeleteSession,
        updateSessionMessages,
        updateSessionCompacted,
        appendSessionSnapshot,
        hasSnapshot,
        rollbackToMessage,
    } = useChatSessions(useDrawerHistory);

    const {
        inputText,
        setInputText,
        isGenerating,
        chatStats,
        systemPrompt,
        attachments,
        setAttachments,
        handleSend,
        handleStopGenerating,
        isPlanReady,
        isCompacting,
        todos,
        clearTodos,
        compactionPreview,
        setCompactionPreview,
        statusNotice,
        clearStatusNotice,
        handleCompactNow,
        handleClearMemory,
    } = useChat({
            messages,
            currentSessionId,
            currentAgent,
            updateSessionMessages,
            appendSessionSnapshot,
            enableReasoning,
            planMode,
            vm,
            mcpServers,
            disabledTools,
            skills,
            subagents,
            promptConfig,
            compacted: currentSession?.compacted,
            updateSessionCompacted,
        });

    // Opening a new conversation or switching to a different one hides the task panel:
    // the checklist belongs to the conversation where the model created it.
    const hideTodosOnLeave = React.useCallback(
        (targetSessionId: string) => {
            if (targetSessionId && targetSessionId === currentSessionId) return;
            clearTodos();
        },
        [clearTodos, currentSessionId],
    );

    // "/" prefix sends the whole turn with the selected skill injected in full.
    const handleSkillAwareSend = React.useCallback(() => {
        const match = /^\s*\/([^\s]+)/.exec(inputText);
        if (match) {
            const token = match[1];
            const skill = skills.find(
                (item) =>
                    item.enabled &&
                    (item.name?.trim() === token || (item.id || `skill-${item.name}`) === token),
            );
            if (skill) {
                const rest = inputText.slice(match[0].length);
                const finalText =
                    rest.trim() || `请先完整读取并遵循技能《${skill.name}》，然后继续对话目标。`;
                void handleSend({ text: finalText, selectedSkillId: skill.id || `skill-${skill.name}` });
                return;
            }
        }
        void handleSend();
    }, [inputText, skills, handleSend]);

    const handleSaveMCPServer = React.useCallback(
        (server: MCPServerConfig) => {
            setMCPServers((previous) =>
                previous.some((item) => item.id === server.id)
                    ? previous.map((item) => (item.id === server.id ? server : item))
                    : [...previous, server],
            );
        },
        [setMCPServers],
    );

    const handleDeleteMCPServer = React.useCallback(
        (id: string) => setMCPServers((previous) => previous.filter((item) => item.id !== id)),
        [setMCPServers],
    );

    const handleSaveSkill = React.useCallback(
        (skill: SkillConfig) => {
            setSkills((previous) =>
                previous.some((item) => item.id === skill.id)
                    ? previous.map((item) => (item.id === skill.id ? skill : item))
                    : [...previous, skill],
            );
        },
        [setSkills],
    );

    // AI-created/updated skills are stored review-gated (enabled=false) until the user enables them.
    const skillsWriterRef = React.useRef<SkillConfig[]>([]);
    React.useEffect(() => {
        skillsWriterRef.current = skills;
    }, [skills]);
    React.useEffect(() => {
        const unbind = bindSkillsWriter((input) => {
            const list = skillsWriterRef.current;
            const existing = list.find((item) => item.id === input.id);
            if (!existing && list.some((item) => item.name?.trim() === input.name.trim())) {
                // Same-name collision: treat as update to that skill.
                const sameName = list.find((item) => item.name?.trim() === input.name.trim())! as SkillConfig;
                const entry: SkillConfig = {
                    ...sameName,
                    name: input.name.trim(),
                    description: input.description?.trim() || sameName.description,
                    content: input.content,
                    enabled: false,
                };
                handleSaveSkill(entry);
                return { status: "updated", id: entry.id, enabled: false };
            }
            const entry: SkillConfig = {
                id: input.id?.trim() || `skill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                name: input.name.trim(),
                description: input.description?.trim() || "由 AI 沉淀（待审核）",
                content: input.content,
                enabled: false,
            };
            handleSaveSkill(entry);
            return { status: "created", id: entry.id, enabled: false };
        });
        return () => {
            unbind();
        };
    }, [handleSaveSkill]);

    const handleDeleteSkill = React.useCallback(
        (id: string) => setSkills((previous) => previous.filter((item) => item.id !== id)),
        [setSkills],
    );

    const handleApprovePlan = () => {
        setPlanMode(false);
        void handleSend({ text: "计划已确认，请按上面的计划开始执行。", planMode: false });
    };

    const { previewAttachment, setPreviewAttachment, handleOpenAttachment } = useAttachmentInteraction(vm, workspace);
    const { bridgeConfig, bridgeStatus, bridgeLastError, toggleBridge } = useBridgeClient(vm);
    const { isSelecting, startSelecting, cancelSelecting } = useBlockRangeSelection({
        workspace,
        vm,
        onRangeSelected: (attachment) => setAttachments((prev) => [...prev, attachment]),
        onSelectionError: (message) => window.alert(message),
    });

    const getContainerPosition = React.useCallback(() => {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const x = (windowWidth - containerInfoRef.current.width) / 2;
        const y = (windowHeight - containerInfoRef.current.height) / 2;
        return {
            translateX: x,
            translateY: y,
        };
    }, []);

    const handleToggle = React.useCallback(() => {
        setContainerInfo({
            ...containerInfoRef.current,
            ...getContainerPosition(),
        });
        setVisible(!visible);
    }, [getContainerPosition, setContainerInfo, visible]);

    const handleClose = React.useCallback(() => {
        setVisible(false);
    }, []);
    const handleMinimize = () => {
        setVisible(false);
    };


    const handleRestoreToUserMessage = React.useCallback(
        async (messageId: string, message: { content: string; attachments?: Attachment[] }) => {
            const result = rollbackToMessage(messageId, message.content, message.attachments || []);
            if (!result) {
                return;
            }

            setInputText(result.inputText);
            setAttachments(result.attachments);

            if (result.snapshot?.projectJson) {
                try {
                    const projectData = JSON.parse(result.snapshot.projectJson);
                    if (typeof vm?.loadProject === "function") {
                        await vm.loadProject(projectData);
                    }
                } catch (error) {
                    console.error("[02Agent] Failed to restore snapshot", error);
                }
            }
        },
        [rollbackToMessage, setAttachments, setInputText, vm],
    );

    const handleExportConversation = React.useCallback(async () => {
        if (messages.length === 0) {
            window.alert("当前会话为空，没有可导出的内容。");
            return;
        }

        const exportText = exportConversationText(currentSession, messages);

        try {
            await navigator.clipboard.writeText(exportText);
            window.alert(`会话文本已复制，共 ${exportText.length.toLocaleString()} 字符。`);
            return;
        } catch (error) {
            console.warn("[02Agent] Failed to copy conversation export, falling back to download", error);
        }

        const safeTitle = (currentSession?.title || "02agent-session")
            .replace(/[\\/:*?"<>|]+/g, "_")
            .slice(0, 48);
        const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeTitle || "02agent-session"}.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        window.alert(`剪贴板不可用，已导出为文本文件，共 ${exportText.length.toLocaleString()} 字符。`);
    }, [currentSession, messages]);

    const handleSizeChange = React.useCallback(
        (value: ExpansionRect) => {
            containerInfoRef.current = value;
            setContainerInfo(value);
        },
        [setContainerInfo],
    );

    // Portal host is looked up ONCE per mount in an effect (rendering-side
    // document.querySelector ran on every render and shot createPortal(null)
    // when the wrapper was not yet in the DOM). A short retry covers the case
    // where this addon mounts before .plugins-wrapper itself.
    const [pluginsWrapper, setPluginsWrapper] = React.useState<HTMLElement | null>(null);
    const warnedNoPortalRef = React.useRef(false);
    React.useEffect(() => {
        let cancelled = false;
        const lookup = () =>
            document.querySelector(".plugins-wrapper") ||
            document.querySelector("#gandi-plugins-wrapper");
        const found = lookup() as HTMLElement | null;
        if (found) {
            setPluginsWrapper(found);
            return;
        }
        const retry = window.setTimeout(() => {
            if (cancelled) return;
            const late = lookup() as HTMLElement | null;
            if (late) setPluginsWrapper(late);
        }, 200);
        return () => {
            cancelled = true;
            window.clearTimeout(retry);
        };
    }, []);

    React.useEffect(() => {
        if (!isAgentMenuOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (agentMenuRef.current?.contains(event.target as Node)) return;
            setIsAgentMenuOpen(false);
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsAgentMenuOpen(false);
            }
        };

        window.addEventListener("mousedown", handlePointerDown);
        window.addEventListener("keydown", handleEscape);

        return () => {
            window.removeEventListener("mousedown", handlePointerDown);
            window.removeEventListener("keydown", handleEscape);
        };
    }, [isAgentMenuOpen]);

    React.useEffect(() => {
        if (!window.Blockly?.ContextMenu) return;

        const contextMenuRegistration = registerContextMenu(vm);

        const handleAddContext = (e: Event) => {
            const customEvent = e as CustomEvent<{
                content: string;
                targetId?: string;
                blockId?: string;
                name?: string;
            }>;
            if (customEvent.detail?.content) {
                const attachment: Attachment = {
                    id: `${Date.now()}-${customEvent.detail.blockId || "workspace"}`,
                    name: customEvent.detail.name || "workspace-ucf",
                    kind: "workspace-ucf",
                    mimeType: "text/plain",
                    content: customEvent.detail.content,
                    preview: customEvent.detail.content,
                    meta: {
                        source: "workspace",
                        targetId: customEvent.detail.targetId,
                        blockId: customEvent.detail.blockId,
                    },
                };
                attachment.name = getAttachmentDisplayName(attachment, vm);
                console.log("[02Agent Jump][index] attachment added to chat", attachment);
                setAttachments((prev) => [...prev, attachment]);
                handleShow();
            }
        };

        window.addEventListener("02agent-add-context", handleAddContext);

        return () => {
            contextMenuRegistration.dispose();
            window.removeEventListener("02agent-add-context", handleAddContext);
        };
    }, [vm, workspace, handleToggle, setAttachments]);

    if (!pluginsWrapper) {
        if (!warnedNoPortalRef.current) {
            warnedNoPortalRef.current = true;
            console.warn("[02Agent] No portal target found (.plugins-wrapper or #gandi-plugins-wrapper)");
        }
        return null;
    }

    return ReactDOM.createPortal(
        <>
            <Launcher themeMode={themeMode} onToggle={handleToggle} isGenerating={isGenerating} />
            {visible &&
                ReactDOM.createPortal(
                    <ExpansionBox
                        id="02agent"
                        title={"02Agent"}
                        themeMode={themeMode}
                        containerInfo={containerInfo}
                        onClose={handleClose}
                        onMinimize={handleMinimize}
                        onSizeChange={handleSizeChange}
                        minWidth={400}
                        minHeight={300}
                        borderRadius={2}
                    >
                        <div
                            className={`${shell.appShell} ${themeStyles.themeRoot} ${themeMode === "dark" ? themeStyles.themeDark : themeStyles.themeLight
                                }`}
                        >
                            {/* Left Panel */}
                            {!useDrawerHistory && isLeftPanelOpen && (
                                <HistoryPanel
                                    sessions={sessions}
                                    currentSessionId={currentSessionId}
                                    onNewChat={() => {
                                        handleNewChat();
                                        hideTodosOnLeave();
                                    }}
                                    onSelectSession={(id) => {
                                        handleSelectSession(id);
                                        hideTodosOnLeave(id);
                                    }}
                                    onDeleteSession={handleDeleteSession}
                                    bridgeStatus={bridgeStatus}
                                    bridgeEnabled={bridgeConfig.enabled}
                                    bridgePort={bridgeConfig.port}
                                    bridgeLastError={bridgeLastError}
                                    onToggleBridge={toggleBridge}
                                />
                            )}

                            {/* Right Panel */}
                            <div className={shell.mainPanel}>
                                <div className={shell.topBar}>
                                    <div className={shell.topBarMain}>
                                        <div className={shell.topBarLeft}>
                                            <div
                                                className={shell.toggleExpandButton}
                                                onClick={() => setIsLeftPanelOpen((previous) => !previous)}
                                                title={isLeftPanelOpen ? "收起历史记录" : "展开历史记录"}
                                            >
                                                {useDrawerHistory ? <IconMenu /> : isLeftPanelOpen ? <IconArrowLeft /> : <IconMenu />}
                                            </div>
                                            {  /* <div className={shell.workspaceTitle}>
                                                <span>02Agent</span>
                                                <small>Scratch code · live blocks</small>
                                            </div> */}
                                        </div>
                                        <div className={shell.topBarCenter}>
                                            <div className={shell.modelSelector} ref={agentMenuRef}>
                                                <button
                                                    type="button"
                                                    className={`${shell.modelSelectorTrigger} ${isAgentMenuOpen ? shell.modelSelectorTriggerActive : ""}`}
                                                    onClick={() => setIsAgentMenuOpen((open) => !open)}
                                                    aria-haspopup="listbox"
                                                    aria-expanded={isAgentMenuOpen}
                                                    title={currentAgent?.displayName || "选择模型"}
                                                >
                                                    <span className={shell.modelSelectorText}>{currentAgent?.displayName || "未选择模型"}</span>
                                                    <span className={shell.modelSelectorChevron}>{isAgentMenuOpen ? "▴" : "▾"}</span>
                                                </button>
                                                {isAgentMenuOpen ? (
                                                    <div className={shell.modelMenu} role="listbox" aria-label="选择模型">
                                                        {flattenedModels.map((model) => (
                                                            <button
                                                                key={model.id}
                                                                type="button"
                                                                className={`${shell.modelMenuItem} ${model.id === currentAgent?.id ? shell.modelMenuItemActive : ""
                                                                    }`}
                                                                onClick={() => {
                                                                    setCurrentModelId(model.id);
                                                                    setIsAgentMenuOpen(false);
                                                                }}
                                                                role="option"
                                                                aria-selected={model.id === currentAgent?.id}
                                                                title={`${model.displayName} (${model.modelName})`}
                                                            >
                                                                <span>{model.displayName}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={shell.topBarActions}>
                                        <button
                                            type="button"
                                            className={shell.secondaryButton}
                                            onClick={() => void handleCompactNow()}
                                            disabled={isGenerating || isCompacting || messages.length === 0}
                                            title="把较早的对话压缩成结构化摘要，保留结论、去掉冗余，长会话不再失忆"
                                        >
                                            {isCompacting ? "压缩中…" : "压缩"}
                                        </button>
                                        <button
                                            type="button"
                                            className={shell.secondaryButton}
                                            onClick={handleClearMemory}
                                            disabled={isGenerating}
                                            title="清空已生成的上下文摘要（不影响聊天记录本身）"
                                        >
                                            清空记忆
                                        </button>
                                        <button
                                            type="button"
                                            className={shell.secondaryButton}
                                            onClick={() => void handleExportConversation()}
                                            title="复制精简会话文本，包含工具调用参数和返回结果"
                                        >
                                            导出
                                        </button>
                                        <button type="button" className={shell.secondaryButton} onClick={() => setShowSettings(true)}>
                                            设置
                                        </button>
                                    </div>
                                </div>

                                <TodoPanel todos={todos} />

                                <ChatArea
                                    messages={messages}
                                    isGenerating={isGenerating}
                                    vm={vm}
                                    onOpenWorkspaceAttachment={handleOpenAttachment}
                                    onRestoreToUserMessage={handleRestoreToUserMessage}
                                    hasSnapshot={hasSnapshot}
                                    statusNotice={statusNotice}
                                />

                                <SelectionHint visible={isSelecting} />

                                <InputArea
                                    inputText={inputText}
                                    setInputText={setInputText}
                                    attachments={attachments}
                                    setAttachments={setAttachments}
                                    onSend={handleSkillAwareSend}
                                    onStopGenerating={handleStopGenerating}
                                    onStartBlockSelection={startSelecting}
                                    onCancelBlockSelection={cancelSelecting}
                                    isSelectingBlocks={isSelecting}
                                    skills={skills.filter((skill) => skill.enabled && skill.name?.trim() && skill.content?.trim()).map((skill) => ({ id: skill.id || `skill-${skill.name}`, name: skill.name, description: skill.description }))}
                                    enableReasoning={enableReasoning}
                                    onToggleReasoning={() => setEnableReasoning((previous) => !previous)}
                                    planMode={planMode}
                                    onTogglePlanMode={() => setPlanMode((previous) => !previous)}
                                    isPlanReady={isPlanReady}
                                    onApprovePlan={handleApprovePlan}
                                    onOpenAttachment={handleOpenAttachment}
                                    isGenerating={isGenerating}
                                    isExpanded={isComposerExpanded}
                                    onToggleExpanded={() => setIsComposerExpanded((previous) => !previous)}
                                    stats={chatStats}
                                    vm={vm}
                                />

                                {/* Settings Modal */}
                                {showSettings && (
                                    <SettingsModal
                                        agents={agents}
                                        editingAgent={editingAgent}
                                        onSaveAgent={handleSaveAgent}
                                        onDeleteAgent={handleDeleteAgent}
                                        onExportAgent={handleExportAgent}
                                        onImportAgent={handleImportAgents}
                                        onEditAgent={setEditingAgent}
                                        themeMode={themeMode}
                                        onThemeModeChange={setThemeMode}
                                        debugMode={debugMode}
                                        onToggleDebugMode={(next) => setDebugMode(next)}
                                        onOpenBenchmark={() => setShowDebugPanel(true)}
                                        jsPermission={jsPermission}
                                        onSetJsPermission={setJsPermission}
                                        mcpServers={mcpServers}
                                        onSaveMCPServer={handleSaveMCPServer}
                                        onDeleteMCPServer={handleDeleteMCPServer}
                                        disabledTools={disabledTools}
                                        onSetDisabledTools={(next) => setDisabledTools(next)}
                                        skills={skills}
                                        onSaveSkill={handleSaveSkill}
                                        onDeleteSkill={handleDeleteSkill}
                                        subagents={subagents}
                                        onSaveSubagents={setSubagents}
                                        promptConfig={promptConfig}
                                        onSavePromptConfig={(next) => setPromptConfig(next)}
                                        systemPrompt={systemPrompt}
                                        onClose={() => {
                                            setShowSettings(false);
                                            setEditingAgent(null);
                                        }}
                                        isCompact={containerInfo.width < 760 || containerInfo.height < 560}
                                    />
                                )}

                                {showDebugPanel && (
                                    <DebugPanel
                                        vm={vm}
                                        themeMode={themeMode}
                                        onClose={() => setShowDebugPanel(false)}
                                    />
                                )}

                                <AttachmentInteractionLayer
                                    previewAttachment={previewAttachment}
                                    onClosePreview={() => setPreviewAttachment(null)}
                                />

                                <JsApprovalDialog request={jsApprovalRequest} onResolve={resolveJsApproval} />
                                <QuestionsDialog request={askUserRequest} onResolve={resolveAskUser} />
                                <CompactionPreview
                                    summary={compactionPreview}
                                    onClose={() => setCompactionPreview(null)}
                                />

                                {/* History Modal for Narrow Screen */}
                                {useDrawerHistory && isLeftPanelOpen && (
                                    <div className={shell.drawerOverlay} onClick={() => setIsLeftPanelOpen(false)}>
                                        <div className={shell.historyDrawer} onClick={(e) => e.stopPropagation()}>
                                            <HistoryPanel
                                                sessions={sessions}
                                                currentSessionId={currentSessionId}
                                                onNewChat={() => {
                                                    handleNewChat();
                                                    hideTodosOnLeave();
                                                }}
                                                onSelectSession={(id) => {
                                                    handleSelectSession(id);
                                                    hideTodosOnLeave(id);
                                                    setIsLeftPanelOpen(false);
                                                }}
                                                onDeleteSession={handleDeleteSession}
                                                bridgeStatus={bridgeStatus}
                                                bridgeEnabled={bridgeConfig.enabled}
                                                bridgePort={bridgeConfig.port}
                                                bridgeLastError={bridgeLastError}
                                                onToggleBridge={toggleBridge}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </ExpansionBox>,
                    document.body,
                )}
            {/*<ConverterDebugger vm={vm} workspace={workspace} />*/}
        </>,
        pluginsWrapper,
    );
};

Agent.displayName = "02Agent";

export default Agent;
