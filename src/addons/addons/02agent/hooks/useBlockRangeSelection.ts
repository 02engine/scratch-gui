import * as React from "react";
import { createRangeAttachment } from "../blockRangeUtils";
import { Attachment } from "../types";

interface UseBlockRangeSelectionOptions {
  workspace: Blockly.WorkspaceSvg;
  vm: PluginContext["vm"];
  onRangeSelected: (attachment: Attachment) => void;
  onSelectionError: (message: string) => void;
}

const getActiveWorkspace = (fallback?: Blockly.WorkspaceSvg | null) => {
  const mainWorkspace = window.Blockly?.getMainWorkspace?.() as Blockly.WorkspaceSvg | null;
  return mainWorkspace || fallback || null;
};

const getWorkspaceSvgNode = (workspace?: Blockly.WorkspaceSvg | null) => {
  const workspaceSvg = workspace && typeof (workspace as any).getParentSvg === "function"
    ? ((workspace as any).getParentSvg() as Element | null)
    : null;
  if (workspaceSvg?.getBoundingClientRect().width && workspaceSvg.getBoundingClientRect().height) {
    return workspaceSvg;
  }

  const visibleSvg = Array.from(document.querySelectorAll(".blocklySvg")).find((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  return visibleSvg || workspaceSvg || null;
};

export const useBlockRangeSelection = ({
  workspace,
  vm,
  onRangeSelected,
  onSelectionError,
}: UseBlockRangeSelectionOptions) => {
  const [isSelecting, setIsSelecting] = React.useState(false);
  const rectNodeRef = React.useRef<SVGRectElement | null>(null);
  const startPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const svgNodeRef = React.useRef<Element | null>(null);
  const moveCountRef = React.useRef(0);

  const clearRect = React.useCallback(() => {
    if (rectNodeRef.current?.parentNode) {
      rectNodeRef.current.parentNode.removeChild(rectNodeRef.current);
    }
    rectNodeRef.current = null;
  }, []);

  const cancelSelecting = React.useCallback(() => {
    clearRect();
    startPointRef.current = null;
    moveCountRef.current = 0;
    setIsSelecting(false);
  }, [clearRect]);

  const startSelecting = React.useCallback(() => {
    const activeWorkspace = getActiveWorkspace(workspace);
    const nextSvgNode = getWorkspaceSvgNode(activeWorkspace);
    if (nextSvgNode) {
      svgNodeRef.current = nextSvgNode;
    }
    if (!activeWorkspace || !svgNodeRef.current) {
      onSelectionError("02Agent 正在等待积木区初始化，请切到代码标签页后再试。");
      return;
    }
    setIsSelecting(true);
  }, [onSelectionError, workspace]);

  React.useEffect(() => {
    svgNodeRef.current = getWorkspaceSvgNode(getActiveWorkspace(workspace));
  }, [workspace]);

  React.useEffect(() => {
    if (!isSelecting || !svgNodeRef.current) return;

    const mousedown = (event: MouseEvent) => {
      const targetClassName = (event.target as SVGElement)?.className?.baseVal || "";
      if (
        !["blocklyMainBackground", "blocklyBubbleCanvas"].includes(targetClassName) &&
        !targetClassName.includes("blockly")
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      document.body.style.cursor = "crosshair";

      const activeWorkspace = getActiveWorkspace(workspace);
      const activeSvgNode = getWorkspaceSvgNode(activeWorkspace);
      if (activeSvgNode) {
        svgNodeRef.current = activeSvgNode;
      }

      const workspaceRect = svgNodeRef.current?.getBoundingClientRect();
      if (!workspaceRect) return;

      moveCountRef.current = 0;
      startPointRef.current = {
        x: event.clientX - workspaceRect.left,
        y: event.clientY - workspaceRect.top,
      };
      console.log("[AI Assistant Range] selection start:", startPointRef.current);

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(startPointRef.current.x));
      rect.setAttribute("y", String(startPointRef.current.y));
      rect.setAttribute("width", "0");
      rect.setAttribute("height", "0");
      rect.setAttribute("fill", "rgba(76, 151, 255, 0.15)");
      rect.setAttribute("stroke", "#4c97ff");
      rect.setAttribute("stroke-width", "2");
      rectNodeRef.current = rect;
      svgNodeRef.current?.appendChild(rect);
    };

    const mousemove = (event: MouseEvent) => {
      if (!rectNodeRef.current || !startPointRef.current || !svgNodeRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      moveCountRef.current += 1;

      const workspaceRect = svgNodeRef.current.getBoundingClientRect();
      const offsetX = event.clientX - workspaceRect.left;
      const offsetY = event.clientY - workspaceRect.top;

      const width = offsetX - startPointRef.current.x;
      const height = offsetY - startPointRef.current.y;

      rectNodeRef.current.setAttribute("width", `${Math.abs(width)}`);
      rectNodeRef.current.setAttribute("height", `${Math.abs(height)}`);
      rectNodeRef.current.setAttribute("x", `${width < 0 ? offsetX : startPointRef.current.x}`);
      rectNodeRef.current.setAttribute("y", `${height < 0 ? offsetY : startPointRef.current.y}`);
    };

    const mouseup = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      document.body.style.cursor = "";

      if (!rectNodeRef.current || !svgNodeRef.current || moveCountRef.current <= 1) {
        console.log("[AI Assistant Range] selection cancelled or too small", {
          hasRect: Boolean(rectNodeRef.current),
          moveCount: moveCountRef.current,
        });
        clearRect();
        startPointRef.current = null;
        moveCountRef.current = 0;
        return;
      }

      const rectBounds = rectNodeRef.current.getBoundingClientRect();
      console.log("[AI Assistant Range] selection end rect:", {
        left: rectBounds.left,
        top: rectBounds.top,
        right: rectBounds.right,
        bottom: rectBounds.bottom,
        width: rectBounds.width,
        height: rectBounds.height,
      });
      const activeWorkspace = getActiveWorkspace(workspace);
      const activeSvgNode = getWorkspaceSvgNode(activeWorkspace);
      if (activeSvgNode) {
        svgNodeRef.current = activeSvgNode;
      }
      if (!activeWorkspace) {
        clearRect();
        startPointRef.current = null;
        moveCountRef.current = 0;
        onSelectionError("02Agent 未找到当前积木工作区，请切到代码标签页后再试。");
        return;
      }

      const { attachment, reason } = createRangeAttachment(vm, activeWorkspace, rectBounds);
      clearRect();
      startPointRef.current = null;
      moveCountRef.current = 0;

      if (attachment) {
        onRangeSelected(attachment);
        setIsSelecting(false);
        return;
      }

      if (reason) {
        onSelectionError(reason);
      }
    };

    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelSelecting();
      }
    };

    document.addEventListener("mousedown", mousedown, { capture: true });
    document.addEventListener("mousemove", mousemove, { capture: true });
    document.addEventListener("mouseup", mouseup, { capture: true });
    document.addEventListener("keydown", keydown);

    return () => {
      document.removeEventListener("mousedown", mousedown, { capture: true });
      document.removeEventListener("mousemove", mousemove, { capture: true });
      document.removeEventListener("mouseup", mouseup, { capture: true });
      document.removeEventListener("keydown", keydown);
      document.body.style.cursor = "";
      clearRect();
    };
  }, [cancelSelecting, clearRect, isSelecting, onRangeSelected, onSelectionError, vm, workspace]);

  return {
    isSelecting,
    startSelecting,
    cancelSelecting,
  };
};
