import * as React from "react";
import Draggable from "react-draggable";
import styles from "../styles.less";
import Tooltip from "../shims/components/Tooltip";
import { useStoredState } from "../hooks/useStoredState";
import { AIAssistantIcon } from "./AIAssistantIcon";

interface LauncherProps {
  themeMode: "dark" | "light";
  onToggle: () => void;
}

const clampRectToViewport = (rect: DOMRect) => ({
  x: Math.max(0, Math.min(rect.left, window.innerWidth - rect.width)),
  y: Math.max(0, Math.min(rect.top, window.innerHeight - rect.height)),
});

const Launcher: React.FC<LauncherProps> = ({ themeMode, onToggle }) => {
  const [launcherPosition, setLauncherPosition] = useStoredState("02AGENT_LAUNCHER_POSITION", { x: 0, y: 0 });
  const containerRef = React.useRef<HTMLElement | null>(null);
  const launcherDraggedRef = React.useRef(false);

  React.useEffect(() => {
    const keepInViewport = () => {
      if (!containerRef.current) return;
      const next = clampRectToViewport(containerRef.current.getBoundingClientRect());
      setLauncherPosition((prev) => {
        if (prev.x === next.x && prev.y === next.y) return prev;
        return next;
      });
    };

    keepInViewport();
    window.addEventListener("resize", keepInViewport);
    return () => window.removeEventListener("resize", keepInViewport);
  }, []);

  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        position: "fixed",
        left: 0,
        top: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 99999999,
      }}
      className="tw-02agent-launcher-container"
    >
      {/** @ts-expect-error */}
      <Draggable
        handle=".tw-02agent-launcher-handle"
        cancel="input, textarea, select, option, [contenteditable=true]"
        position={launcherPosition}
        bounds=".tw-02agent-launcher-container"
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
            icon={
              <>
                <AIAssistantIcon />
                <span>02Agent</span>
              </>
            }
            onClick={() => {
              if (!launcherDraggedRef.current) onToggle();
            }}
            tipText={"02Agent"}
          />
        </section>
      </Draggable>
    </div>
  );
};

export default Launcher;
