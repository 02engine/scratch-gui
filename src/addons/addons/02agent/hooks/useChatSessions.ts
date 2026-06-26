import { useState, useMemo, useEffect, useRef, useCallback, type MouseEvent } from "react";
import { Attachment, ChatMessage, ChatSession, SessionSnapshot } from "../types";
import { useStoredState } from "./useStoredState";

const getSessionTitle = (messages: ChatMessage[]) => {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const rawTitle =
    firstUserMessage?.content ||
    firstUserMessage?.attachments?.map((attachment) => attachment.name).join(", ") ||
    "新对话";
  return rawTitle.length > 20 ? `${rawTitle.substring(0, 20)}...` : rawTitle;
};

export function useChatSessions(shouldAutoCollapseHistory: boolean) {
  const [sessions, setSessions] = useStoredState<ChatSession[]>("AI_ASSISTANT_SESSIONS", []);
  const [currentSessionId, setCurrentSessionId] = useStoredState<string>("AI_ASSISTANT_CURRENT_SESSION_ID", "");
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const currentSessionIdRef = useRef(currentSessionId);
  const snapshotsRef = useRef<Record<string, SessionSnapshot[]>>({});

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const setActiveSessionId = useCallback(
    (id: string) => {
      currentSessionIdRef.current = id;
      setCurrentSessionId(id);
    },
    [setCurrentSessionId],
  );

  useEffect(() => {
    if (shouldAutoCollapseHistory) {
      setIsLeftPanelOpen(false);
      setShowHistoryModal(false);
    }
  }, [shouldAutoCollapseHistory]);

  const currentSession = useMemo(() => {
    return sessions.find((s) => s.id === currentSessionId);
  }, [sessions, currentSessionId]);

  const messages = currentSession?.messages || [];

  useEffect(() => {
    if (!currentSessionId) return;
    if (!sessions.some((session) => session.id === currentSessionId)) {
      setActiveSessionId("");
    }
  }, [currentSessionId, sessions, setActiveSessionId]);

  const handleNewChat = () => {
    setActiveSessionId("");
    if (shouldAutoCollapseHistory) setShowHistoryModal(false);
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    if (shouldAutoCollapseHistory) setShowHistoryModal(false);
  };

  const handleDeleteSession = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setSessions((previousSessions) => previousSessions.filter((session) => session.id !== id));
    delete snapshotsRef.current[id];
    if (currentSessionId === id) {
      setActiveSessionId("");
    }
  };

  const updateSessionMessages = useCallback(
    (newMessages: ChatMessage[], targetSessionId?: string) => {
      let sessionId = targetSessionId || currentSessionIdRef.current;
      const updatedAt = Date.now();
      const title = getSessionTitle(newMessages);

      if (!sessionId) {
        sessionId = updatedAt.toString();
        setActiveSessionId(sessionId);
      }

      setSessions((previousSessions) => {
        const nextSessions = [...previousSessions];
        const sessionIndex = nextSessions.findIndex((session) => session.id === sessionId);

        if (sessionIndex > -1) {
          nextSessions[sessionIndex] = {
            ...nextSessions[sessionIndex],
            title,
            messages: newMessages,
            updatedAt,
          };

          const session = nextSessions.splice(sessionIndex, 1)[0];
          nextSessions.unshift(session);
          return nextSessions;
        }

        nextSessions.unshift({
          id: sessionId,
          title,
          messages: newMessages,
          updatedAt,
        });

        return nextSessions;
      });

      return sessionId;
    },
    [setActiveSessionId, setSessions],
  );

  const appendSessionSnapshot = useCallback((snapshot: SessionSnapshot, targetSessionId?: string) => {
    const sessionId = targetSessionId || currentSessionIdRef.current;
    if (!sessionId) return;

    const existingSnapshots = snapshotsRef.current[sessionId] || [];
    snapshotsRef.current[sessionId] = [
      ...existingSnapshots.filter((item) => item.messageId !== snapshot.messageId),
      snapshot,
    ];
  }, []);

  const hasSnapshot = useCallback((messageId: string) => {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId) return false;
    return Boolean((snapshotsRef.current[sessionId] || []).some((item) => item.messageId === messageId));
  }, []);

  const rollbackToMessage = useCallback(
    (messageId: string, nextInputText: string, nextAttachments: Attachment[]) => {
      const session = sessions.find((item) => item.id === currentSessionIdRef.current);
      const sessionId = currentSessionIdRef.current;
      if (!session) {
        return null;
      }

      const messageIndex = session.messages.findIndex((message) => message.id === messageId);
      if (messageIndex === -1) {
        return null;
      }

      const snapshot = [...(snapshotsRef.current[sessionId] || [])]
        .reverse()
        .find((item) => item.messageId === messageId);
      const keptMessages = session.messages.slice(0, messageIndex);
      const updatedAt = Date.now();

      setSessions((previousSessions) =>
        previousSessions.map((item) =>
          item.id === session.id
            ? {
                ...item,
                title: getSessionTitle(keptMessages),
                messages: keptMessages,
                updatedAt,
              }
            : item,
        ),
      );

      if (sessionId) {
        snapshotsRef.current[sessionId] = (snapshotsRef.current[sessionId] || []).filter((entry) =>
          keptMessages.some((message) => message.id === entry.messageId),
        );
      }

      return {
        snapshot,
        inputText: nextInputText,
        attachments: nextAttachments,
      };
    },
    [sessions, setSessions],
  );

  return {
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
  };
}
