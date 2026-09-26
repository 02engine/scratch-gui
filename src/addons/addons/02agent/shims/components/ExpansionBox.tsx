import * as React from "react";
import Draggable from "react-draggable";
import style from "../../ui/ExpansionBox.module.less"

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
    onMinimize?: () => void;
    onSizeChange?: (rect: ExpansionRect) => void;
}

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface WindowRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

const RESIZE_DIRECTIONS: ResizeDirection[] = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];

const RESIZE_CURSORS: Record<ResizeDirection, string> = {
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    nw: "nwse-resize",
    se: "nwse-resize",
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const toWindowRect = (info: ExpansionRect): WindowRect => ({
    x: Math.max(info.translateX || 0, 0),
    y: Math.max(info.translateY || 0, 0),
    width: info.width,
    height: info.height
});

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
    onMinimize,
    onSizeChange
}: ExpansionBoxProps) => {
    const isDark = themeMode === "dark";
    const windowRef = React.useRef<HTMLDivElement | null>(null);
    const endResizeRef = React.useRef<(() => void) | null>(null);
    const [rect, setRect] = React.useState<WindowRect>(() => toWindowRect(containerInfo));

    const handleOnMinimize = React.useCallback(async () => {
        if (!windowRef.current) return;
        windowRef.current.style.scale = "0";
        windowRef.current.style.opacity = "0";
        await new Promise(resolve => setTimeout(resolve, 200));
        onMinimize?.();
    }, [onMinimize])

    React.useEffect(() => {
        if (!windowRef.current) return;
        windowRef.current.style.scale = "1";
        windowRef.current.style.opacity = "1";
    }, []);

    React.useEffect(() => {
        setRect(toWindowRect(containerInfo));
    }, [containerInfo.translateX, containerInfo.translateY, containerInfo.width, containerInfo.height]);

    React.useEffect(() => () => {
        endResizeRef.current?.();
    }, []);

    const startResize = React.useCallback((direction: ResizeDirection) =>
        (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
            if (!("touches" in event) && event.button !== 0) return;
            const startPointer = getPointer(event);
            if (!startPointer) return;
            // React 16 pools synthetic events: this event's fields are nullified as soon
            // as this handler returns. Copy the coordinates now, otherwise every later
            // mousemove/touchmove computes dx/dy from a null clientX/clientY and drags
            // the wrong edge or clamps the window to the viewport origin.
            const startClientX = startPointer.clientX;
            const startClientY = startPointer.clientY;
            event.preventDefault();
            event.stopPropagation();

            const startRect = rect;
            const startRight = startRect.x + startRect.width;
            const startBottom = startRect.y + startRect.height;
            const movesLeft = direction.includes("w");
            const movesRight = direction.includes("e");
            const movesTop = direction.includes("n");
            const movesBottom = direction.includes("s");
            const nextRect: WindowRect = { ...startRect };
            let dirty = false;

            document.body.style.cursor = RESIZE_CURSORS[direction];
            document.body.style.userSelect = "none";

            const teardown = () => {
                document.removeEventListener("mousemove", onPointerMove);
                document.removeEventListener("mouseup", onPointerUp);
                document.removeEventListener("touchmove", onPointerMove);
                document.removeEventListener("touchend", onPointerUp);
                document.removeEventListener("touchcancel", onPointerUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
                endResizeRef.current = null;
            };

            const onPointerMove = (moveEvent: MouseEvent | TouchEvent) => {
                moveEvent.preventDefault();
                const point = getPointer(moveEvent);
                if (!point) return;
                const dx = point.clientX - startClientX;
                const dy = point.clientY - startClientY;
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const maxRight = Math.max(viewportWidth, startRight);
                const maxBottom = Math.max(viewportHeight, startBottom);
                const maxX = Math.max(0, maxRight - minWidth);
                const maxY = Math.max(0, maxBottom - minHeight);

                let left = startRect.x;
                let top = startRect.y;
                let right = startRight;
                let bottom = startBottom;

                if (movesLeft) left = clamp(startRect.x + dx, 0, startRight - minWidth);
                if (movesRight) right = clamp(startRight + dx, left + minWidth, maxRight);
                if (movesTop) top = clamp(startRect.y + dy, 0, startBottom - minHeight);
                if (movesBottom) bottom = clamp(startBottom + dy, top + minHeight, maxBottom);

                const x = Math.round(clamp(left, 0, maxX));
                const y = Math.round(clamp(top, 0, maxY));
                const width = Math.round(clamp(right - x, minWidth, Math.max(minWidth, maxRight - x)));
                const height = Math.round(clamp(bottom - y, minHeight, Math.max(minHeight, maxBottom - y)));

                if (x === nextRect.x && y === nextRect.y && width === nextRect.width && height === nextRect.height) return;
                nextRect.x = x;
                nextRect.y = y;
                nextRect.width = width;
                nextRect.height = height;
                dirty = true;
                setRect({ x, y, width, height });
            };

            const finish = () => {
                const committed = { ...nextRect };
                teardown();
                if (dirty) {
                    onSizeChange?.({
                        width: committed.width,
                        height: committed.height,
                        translateX: committed.x,
                        translateY: committed.y
                    });
                }
            };

            const onPointerUp = (endEvent: MouseEvent | TouchEvent) => {
                endEvent.preventDefault();
                finish();
            };

            document.addEventListener("mousemove", onPointerMove);
            document.addEventListener("mouseup", onPointerUp);
            document.addEventListener("touchmove", onPointerMove, { passive: false });
            document.addEventListener("touchend", onPointerUp, { passive: false });
            document.addEventListener("touchcancel", onPointerUp, { passive: false });
            endResizeRef.current = teardown;
        }, [minHeight, minWidth, onSizeChange, rect]);

    const handleDragStop = React.useCallback((_: unknown, data: { x: number; y: number }) => {
        const nextX = Math.max(Math.round(data.x), 0);
        const nextY = Math.max(Math.round(data.y), 0);
        setRect(previous => ({ ...previous, x: nextX, y: nextY }));
        onSizeChange?.({
            width: rect.width,
            height: rect.height,
            translateX: nextX,
            translateY: nextY
        });
    }, [onSizeChange, rect.height, rect.width]);

    return (
        <Draggable
            handle={`.${style['drag-handle']}`}
            cancel="input, textarea, button, select, option, [contenteditable=true], .tw-02agent-resize-handle"
            position={{ x: rect.x, y: rect.y }}
            onStop={handleDragStop}
        >
            <div
                ref={windowRef}
                style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    zIndex: 2147483647,
                    width: rect.width,
                    height: rect.height,
                    minWidth,
                    minHeight,
                    borderRadius,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    background: isDark ? "#152223" : "#f4fbfa",
                    boxShadow: isDark ? "0 18px 46px rgba(0, 0, 0, 0.38)" : "0 18px 46px rgba(16, 72, 68, 0.24)",
                    scale: 0,
                    opacity: 0,
                    transition: "scale 0.2s ease-in-out, opacity 0.2s ease-in-out"
                }}
            >
                <div
                    className={`${style['drag-handle']} ${isDark ? style.dark : ""}`}
                    data-expansion-id={id}
                >

                    <button
                        type="button"
                        onClick={handleOnMinimize}
                        title="最小化到后台"
                        style={{ position: "absolute", right: 34, zIndex: 40, background: "transparent", border: 0, color: "inherit" }}
                    >
                        −
                    </button>


                    <button
                        type="button"
                        onClick={onClose}
                        title="Close"
                        style={{ position: "absolute", right: 8, zIndex: 40, background: "transparent", border: 0, color: "inherit" }}
                    >
                        ×
                    </button>
                    <strong>{title}</strong>
                </div>
                {children}
                {RESIZE_DIRECTIONS.map((direction) => (
                    <div
                        key={direction}
                        className={`tw-02agent-resize-handle ${style["resize-handle"]} ${style[`edge-${direction}`]}`}
                        aria-hidden="true"
                        onMouseDown={startResize(direction)}
                        onTouchStart={startResize(direction)}
                    />
                ))}
            </div>
        </Draggable>
    );
};

export default ExpansionBox;
