import * as React from "react";
import ReactDOM from "react-dom";
import Draggable from "react-draggable";
import styles from "./styles.less";
import themeStyles from "./ui/Theme.module.less";
import shell from "./ui/Shell.module.less";
import Tooltip from "components/Tooltip";
import ExpansionBox, { ExpansionRect } from "components/ExpansionBox";
import { useStoredState } from "./hooks/useStoredState";
import { registerContextMenu } from "./contextMenu";
import { AIAssistantIcon } from "./components/AIAssistantIcon";
import { HistoryPanel } from "./components/HistoryPanel";
import { SettingsModal } from "./components/SettingsModal";
import { ChatArea } from "./components/ChatArea";
import { InputArea } from "./components/InputArea";
import { AttachmentInteractionLayer } from "./components/AttachmentInteractionLayer";
import { SelectionHint } from "./components/SelectionHint";
import { useAgents } from "./hooks/useAgents";
import { useAttachmentInteraction } from "./hooks/useAttachmentInteraction";
import { useBlockRangeSelection } from "./hooks/useBlockRangeSelection";
import { useChatSessions } from "./hooks/useChatSessions";
import { useChat } from "./hooks/useChat";
import { Attachment } from "./types";
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

const Agent: React.FC<AgentProps> = ({ vm, workspace, editorThemeMode = "light" }) => {
  console.log(`[02Agent] Rendering\n vm:`, vm)
  const [visible, setVisible] = React.useState(false);
  const [launcherPosition, setLauncherPosition] = useStoredState("02AGENT_LAUNCHER_POSITION", { x: 0, y: 0 });
  const [isAgentMenuOpen, setIsAgentMenuOpen] = React.useState(false);
  const [isComposerExpanded, setIsComposerExpanded] = React.useState(false);
  const [themeMode, setThemeMode] = React.useState<ThemeMode>(editorThemeMode);
  const containerRef = React.useRef(null);
  const launcherDraggedRef = React.useRef(false);
  const agentMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [enableReasoning, setEnableReasoning] = useStoredState<boolean>("02AGENT_ENABLE_REASONING", false);

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
    appendSessionSnapshot,
    hasSnapshot,
    rollbackToMessage,
  } = useChatSessions(useDrawerHistory);

  const { inputText, setInputText, isGenerating, attachments, setAttachments, handleSend, handleStopGenerating } =
    useChat({
      messages,
      currentAgent,
      updateSessionMessages,
      appendSessionSnapshot,
      enableReasoning,
      vm,
    });

  const { previewAttachment, setPreviewAttachment, handleOpenAttachment } = useAttachmentInteraction(vm, workspace);
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

  const handleShow = React.useCallback(() => {
    setContainerInfo({
      ...containerInfoRef.current,
      ...getContainerPosition(),
    });
    setVisible(true);
  }, [getContainerPosition, setContainerInfo]);

  const handleClose = () => {
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

  const pluginsWrapper = document.querySelector(".plugins-wrapper") || document.querySelector("#gandi-plugins-wrapper");

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
  }, [vm, workspace, handleShow, setAttachments]);

  if (!pluginsWrapper) {
    console.warn("[02Agent] No portal target found (.plugins-wrapper or #gandi-plugins-wrapper)");
  }

  return ReactDOM.createPortal(
    <>
      <Draggable
        handle=".tw-02agent-launcher-handle"
        cancel="input, textarea, select, option, [contenteditable=true]"
        position={launcherPosition}
        onStart={() => {
          launcherDraggedRef.current = false;
        }}
        onDrag={() => {
          launcherDraggedRef.current = true;
        }}
        onStop={(_, data) => {
          setLauncherPosition({ x: data.x, y: data.y });
          window.setTimeout(() => {
            launcherDraggedRef.current = false;
          }, 0);
        }}
      >
      <section className={styles.aiAssistantRoot} ref={containerRef}>
        <Tooltip
          className={`tw-02agent-launcher-handle ${styles.icon} ${themeMode === "dark" ? styles.iconDark : styles.iconLight}`}
          icon={<><AIAssistantIcon /><span>02Agent</span></>}
          onClick={() => {
            if (!launcherDraggedRef.current) handleShow();
          }}
          tipText={"02Agent"}
        />
        {visible &&
          ReactDOM.createPortal(
            <ExpansionBox
            id="02agent"
            title={"02Agent"}
            themeMode={themeMode}
            containerInfo={containerInfo}
            onClose={handleClose}
            onSizeChange={handleSizeChange}
            minWidth={400}
            minHeight={300}
            borderRadius={8}
          >
            <div
              className={`${styles.container} ${shell.appShell} ${themeStyles.themeRoot} ${
                themeMode === "dark" ? themeStyles.themeDark : themeStyles.themeLight
              }`}
            >
              {/* Left Panel */}
              {!useDrawerHistory && isLeftPanelOpen && (
                <HistoryPanel
                  sessions={sessions}
                  currentSessionId={currentSessionId}
                  onNewChat={handleNewChat}
                  onSelectSession={handleSelectSession}
                  onDeleteSession={handleDeleteSession}
                />
              )}

              {/* Right Panel */}
              <div className={shell.mainPanel}>
                <div className={shell.topBar}>
                  <div className={shell.topBarMain}>
                    <div className={shell.topBarLeft}>
                      <button
                        type="button"
                        className={shell.iconButton}
                        onClick={() => setIsLeftPanelOpen((previous) => !previous)}
                        title={isLeftPanelOpen ? "收起历史记录" : "展开历史记录"}
                      >
                        {useDrawerHistory ? "☰" : isLeftPanelOpen ? "←" : "☰"}
                      </button>
                      <div className={shell.workspaceTitle}>
                        <span>02Agent</span>
                        <small>Scratch code · live blocks</small>
                      </div>
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
                                className={`${shell.modelMenuItem} ${
                                  model.id === currentAgent?.id ? shell.modelMenuItemActive : ""
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
                      onClick={() => void handleExportConversation()}
                      title="复制精简会话文本，包含工具调用参数和返回结果"
                    >
                      导出会话
                    </button>
                    <button type="button" className={shell.secondaryButton} onClick={() => setShowSettings(true)}>
                      设置
                    </button>
                  </div>
                </div>

                <ChatArea
                  messages={messages}
                  isGenerating={isGenerating}
                  vm={vm}
                  onOpenWorkspaceAttachment={handleOpenAttachment}
                  onRestoreToUserMessage={handleRestoreToUserMessage}
                  hasSnapshot={hasSnapshot}
                />

                <SelectionHint visible={isSelecting} />

                <InputArea
                  inputText={inputText}
                  setInputText={setInputText}
                  attachments={attachments}
                  setAttachments={setAttachments}
                  onSend={handleSend}
                  onStopGenerating={handleStopGenerating}
                  onStartBlockSelection={startSelecting}
                  onCancelBlockSelection={cancelSelecting}
                  isSelectingBlocks={isSelecting}
                  enableReasoning={enableReasoning}
                  onToggleReasoning={() => setEnableReasoning((previous) => !previous)}
                  onOpenAttachment={handleOpenAttachment}
                  isGenerating={isGenerating}
                  isExpanded={isComposerExpanded}
                  onToggleExpanded={() => setIsComposerExpanded((previous) => !previous)}
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
                    onClose={() => {
                      setShowSettings(false);
                      setEditingAgent(null);
                    }}
                    isCompact={containerInfo.width < 760 || containerInfo.height < 560}
                  />
                )}

                <AttachmentInteractionLayer
                  previewAttachment={previewAttachment}
                  onClosePreview={() => setPreviewAttachment(null)}
                />

                {/* History Modal for Narrow Screen */}
                {useDrawerHistory && isLeftPanelOpen && (
                  <div className={styles.drawerOverlay} onClick={() => setIsLeftPanelOpen(false)}>
                    <div className={styles.historyDrawer} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.modalHeader}>
                        <div>
                          <h3>历史对话</h3>
                          <p>继续之前的上下文，或快速开始一个新会话。</p>
                        </div>
                        <button onClick={handleNewChat} className={styles.newChatBtn} title="新对话">
                          +
                        </button>
                      </div>
                      <div className={styles.modalHistoryList}>
                        {sessions.length === 0 && <div className={styles.emptyTip}>暂无历史对话</div>}
                        {sessions.map((s) => (
                          <div
                            key={s.id}
                            className={`${styles.historyItem} ${currentSessionId === s.id ? styles.active : ""}`}
                            onClick={() => handleSelectSession(s.id)}
                          >
                            <span className={styles.historyTitle}>{s.title}</span>
                            <button
                              className={styles.deleteSessionBtn}
                              onClick={(e) => handleDeleteSession(s.id, e)}
                              title="删除对话"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <button className={styles.closeBtn} onClick={() => setIsLeftPanelOpen(false)}>
                        关闭
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ExpansionBox>,
          document.body,
        )}
      </section>
      </Draggable>
      {/*<ConverterDebugger vm={vm} workspace={workspace} />*/}
    </>,
    pluginsWrapper,
  );
};

Agent.displayName = "02Agent";

export default Agent;
