import * as React from "react";
import Draggable from "react-draggable";

export interface ExpansionRect {
  width: number;
  height: number;
  translateX: number;
  translateY: number;
}

interface ExpansionBoxProps {
  id: string;
  title: string;
  minWidth: number;
  minHeight: number;
  borderRadius: number;
  themeMode?: "dark" | "light";
  children: React.ReactNode;
  containerInfo: ExpansionRect;
  onClose?: () => void;
  onSizeChange?: (rect: ExpansionRect) => void;
}

const resizeHandleStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: 0,
  width: 24,
  height: 24,
  zIndex: 20,
  cursor: "nwse-resize",
  pointerEvents: "auto",
  background: "linear-gradient(135deg, transparent 0 52%, rgba(45, 115, 110, 0.45) 52% 58%, transparent 58% 68%, rgba(45, 115, 110, 0.45) 68% 74%, transparent 74%)",
};

const getPointer = (event: MouseEvent | TouchEvent | React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) =>
  "touches" in event ? event.touches[0] || event.changedTouches[0] : event;

const ExpansionBox = ({
  id,
  title,
  minWidth,
  minHeight,
  borderRadius,
  themeMode = "light",
  children,
  containerInfo,
  onClose,
  onSizeChange
}: ExpansionBoxProps) => {
  const isDark = themeMode === "dark";
  const windowRef = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState({
    x: Math.max(containerInfo.translateX || 0, 0),
    y: Math.max(containerInfo.translateY || 0, 0)
  });

  React.useEffect(() => {
    setPosition({
      x: Math.max(containerInfo.translateX || 0, 0),
      y: Math.max(containerInfo.translateY || 0, 0)
    });
  }, [containerInfo.translateX, containerInfo.translateY]);

  const startResize = React.useCallback((event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!("touches" in event) && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";

    const onPointerMove = (moveEvent: MouseEvent | TouchEvent) => {
      moveEvent.preventDefault();
      const point = getPointer(moveEvent);
      const rect = windowRef.current?.getBoundingClientRect();
      if (!point || !rect) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      let nextX = position.x;
      let nextY = position.y;
      let nextWidth = Math.max(minWidth, Math.min(point.clientX - rect.left, viewportWidth - rect.left));
      let nextHeight = Math.max(minHeight, Math.min(point.clientY - rect.top, viewportHeight - rect.top));

      nextX = Math.max(0, Math.min(nextX, Math.max(0, viewportWidth - minWidth)));
      nextY = Math.max(0, Math.min(nextY, Math.max(0, viewportHeight - minHeight)));
      nextWidth = Math.max(minWidth, Math.min(nextWidth, viewportWidth - nextX));
      nextHeight = Math.max(minHeight, Math.min(nextHeight, viewportHeight - nextY));

      const nextPosition = { x: nextX, y: nextY };
      setPosition(nextPosition);
      onSizeChange?.({ width: nextWidth, height: nextHeight, translateX: nextX, translateY: nextY });
    };

    const onPointerUp = (endEvent: MouseEvent | TouchEvent) => {
      endEvent.preventDefault();
      document.removeEventListener("mousemove", onPointerMove);
      document.removeEventListener("mouseup", onPointerUp);
      document.removeEventListener("touchmove", onPointerMove);
      document.removeEventListener("touchend", onPointerUp);
      document.removeEventListener("touchcancel", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("mouseup", onPointerUp);
    document.addEventListener("touchmove", onPointerMove, { passive: false });
    document.addEventListener("touchend", onPointerUp, { passive: false });
    document.addEventListener("touchcancel", onPointerUp, { passive: false });
  }, [containerInfo.height, containerInfo.width, minHeight, minWidth, onSizeChange, position.x, position.y]);

  return (
    <Draggable
      handle=".tw-02agent-drag-handle"
      cancel="input, textarea, button, select, option, [contenteditable=true], .tw-02agent-resize-handle"
      position={position}
      onStop={(_, data) => {
        const next = { x: Math.max(data.x, 0), y: Math.max(data.y, 0) };
        setPosition(next);
        onSizeChange?.({ ...containerInfo, translateX: next.x, translateY: next.y });
      }}
    >
      <div
        ref={windowRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 2147483647,
          width: containerInfo.width,
          height: containerInfo.height,
          minWidth,
          minHeight,
          borderRadius,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: isDark ? "#152223" : "#f4fbfa",
          boxShadow: isDark ? "0 18px 46px rgba(0, 0, 0, 0.38)" : "0 18px 46px rgba(16, 72, 68, 0.24)"
        }}
      >
        <div
          className="tw-02agent-drag-handle"
          data-expansion-id={id}
          style={{
            height: 28,
            cursor: "move",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderBottom: isDark ? "1px solid #314749" : "1px solid #add7d2",
            background: isDark ? "#203436" : "#dff3f1",
            color: isDark ? "#e7fffb" : "#123434",
            userSelect: "none"
          }}
        >
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              style={{ position: "absolute", right: 8, background: "transparent", border: 0, color: "inherit" }}
            >
              ×
            </button>
          ) : null}
          <strong>{title}</strong>
        </div>
        {children}
        <div
          className="tw-02agent-resize-handle"
          aria-hidden="true"
          onMouseDown={startResize}
          onTouchStart={startResize}
          style={resizeHandleStyle}
        />
      </div>
    </Draggable>
  );
};

export default ExpansionBox;
