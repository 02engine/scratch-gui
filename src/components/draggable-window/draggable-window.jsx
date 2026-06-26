import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import styles from './draggable-window.css';
import windowStateStorage from '../../lib/window-state-storage';

const MinimizeIcon = () => (
    <svg aria-hidden="true" height="12" viewBox="0 0 16 16" width="12">
        <path
            d="M4 8.75h8"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
        />
    </svg>
);

const FullscreenIcon = () => (
    <svg aria-hidden="true" height="12" viewBox="0 0 16 16" width="12">
        <path
            d="M5 3.5H3.5V5M11 3.5h1.5V5M3.5 11V12.5H5M12.5 11V12.5H11"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
        />
    </svg>
);

const RestoreIcon = () => (
    <svg aria-hidden="true" height="12" viewBox="0 0 16 16" width="12">
        <path
            d="M5 4.5h6.5v6.5H5zM3.5 6V12.5H10"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.3"
        />
    </svg>
);

const CloseIcon = () => (
    <svg aria-hidden="true" height="12" viewBox="0 0 16 16" width="12">
        <path
            d="M4.5 4.5l7 7m0-7l-7 7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
        />
    </svg>
);

const DraggableWindow = props => {
    const {
        allowMaximize = true,
        allowMinimize = true,
        allowResize = true,
        children,
        className,
        defaultPosition = {x: 100, y: 100},
        defaultSize = {width: 400, height: 300},
        enableStatePersistence = true,
        headerActions,
        isDraggable = true,
        isFullScreen: controlledFullScreen,
        isMinimized: controlledMinimized,
        isResizable = true,
        maxSize = {width: 800, height: 600},
        minSize = {width: 200, height: 150},
        onActivate,
        onClose,
        onContentResize,
        onDrag,
        onDragStart,
        onDragStop,
        onFullScreenToggle,
        onMinimizeToggle,
        onResize,
        onResizeStart,
        onResizeStop,
        position: controlledPosition,
        size: controlledSize,
        title,
        windowId,
        zIndex = 1,
        ...componentProps
    } = props;

    const getInitialState = React.useCallback(() => {
        if (enableStatePersistence && windowId) {
            return windowStateStorage.getValidWindowState(windowId, {
                position: defaultPosition,
                size: defaultSize,
                isMinimized: false,
                isFullScreen: false,
                originalPosition: defaultPosition,
                originalSize: defaultSize
            });
        }
        return {
            position: defaultPosition,
            size: defaultSize,
            isMinimized: false,
            isFullScreen: false,
            originalPosition: defaultPosition,
            originalSize: defaultSize
        };
    }, [defaultPosition, defaultSize, enableStatePersistence, windowId]);

    const initialState = React.useMemo(() => getInitialState(), [getInitialState]);
    const [position, setPosition] = React.useState(initialState.position);
    const [size, setSize] = React.useState(initialState.size);
    const [isDragging, setIsDragging] = React.useState(false);
    const [isResizing, setIsResizing] = React.useState(false);
    const [isMinimized, setIsMinimized] = React.useState(initialState.isMinimized);
    const [isFullScreen, setIsFullScreen] = React.useState(initialState.isFullScreen);
    const [originalPosition, setOriginalPosition] = React.useState(initialState.originalPosition);
    const [originalSize, setOriginalSize] = React.useState(initialState.originalSize);
    const [isDraggingMinimized, setIsDraggingMinimized] = React.useState(false);

    const windowRef = React.useRef(null);
    const contentRef = React.useRef(null);
    const contentResizeFrameRef = React.useRef(null);
    const latestPositionRef = React.useRef(position);
    const latestSizeRef = React.useRef(size);
    const dragCleanupRef = React.useRef(null);
    const resizeCleanupRef = React.useRef(null);

    React.useEffect(() => {
        latestPositionRef.current = position;
    }, [position]);

    React.useEffect(() => {
        latestSizeRef.current = size;
    }, [size]);

    const saveWindowState = React.useCallback(() => {
        if (!enableStatePersistence || !windowId) {
            return;
        }
        const nextState = {
            position,
            size,
            isMinimized,
            isFullScreen
        };
        if (isFullScreen) {
            nextState.originalPosition = originalPosition;
            nextState.originalSize = originalSize;
        }
        windowStateStorage.saveWindowState(windowId, nextState);
    }, [
        enableStatePersistence,
        windowId,
        position,
        size,
        isMinimized,
        isFullScreen,
        originalPosition,
        originalSize
    ]);

    React.useEffect(() => {
        saveWindowState();
    }, [saveWindowState]);

    React.useEffect(() => {
        if (controlledPosition) {
            setPosition(controlledPosition);
        }
    }, [controlledPosition]);

    React.useEffect(() => {
        if (controlledSize) {
            setSize(controlledSize);
        }
    }, [controlledSize]);

    React.useEffect(() => {
        if (typeof controlledMinimized === 'boolean') {
            setIsMinimized(controlledMinimized);
        }
    }, [controlledMinimized]);

    React.useEffect(() => {
        if (typeof controlledFullScreen === 'boolean') {
            setIsFullScreen(controlledFullScreen);
        }
    }, [controlledFullScreen]);

    React.useEffect(() => {
        if (!onContentResize || !contentRef.current) {
            return undefined;
        }

        const emitSize = () => {
            if (!contentRef.current) {
                return;
            }
            onContentResize(windowId, {
                width: contentRef.current.clientWidth,
                height: contentRef.current.clientHeight
            });
        };

        const scheduleEmitSize = () => {
            if (contentResizeFrameRef.current !== null) {
                cancelAnimationFrame(contentResizeFrameRef.current);
            }
            contentResizeFrameRef.current = requestAnimationFrame(() => {
                contentResizeFrameRef.current = null;
                emitSize();
            });
        };

        emitSize();

        let resizeObserver;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(scheduleEmitSize);
            resizeObserver.observe(contentRef.current);
        } else {
            window.addEventListener('resize', scheduleEmitSize);
        }

        return () => {
            if (contentResizeFrameRef.current !== null) {
                cancelAnimationFrame(contentResizeFrameRef.current);
                contentResizeFrameRef.current = null;
            }
            if (resizeObserver) {
                resizeObserver.disconnect();
            } else {
                window.removeEventListener('resize', scheduleEmitSize);
            }
        };
    }, [onContentResize, windowId]);

    React.useEffect(() => {
        if (isMinimized) {
            setIsDragging(false);
            setIsResizing(false);
        }
    }, [isMinimized]);

    React.useEffect(() => () => {
        if (dragCleanupRef.current) {
            dragCleanupRef.current();
            dragCleanupRef.current = null;
        }
        if (resizeCleanupRef.current) {
            resizeCleanupRef.current();
            resizeCleanupRef.current = null;
        }
    }, []);

    const emitActivate = React.useCallback(() => {
        if (onActivate) {
            onActivate(windowId);
        }
    }, [onActivate, windowId]);

    const stopControlPropagation = React.useCallback(event => {
        event.stopPropagation();
    }, []);

    const handleMouseDown = React.useCallback(event => {
        if (!isDraggable || isMinimized) {
            return;
        }
        if (!event.touches && event.button !== 0) {
            return;
        }

        const point = event.touches ? event.touches[0] : event;
        const rect = windowRef.current.getBoundingClientRect();
        const positioningParent = windowRef.current.offsetParent;
        const parentRect = positioningParent ? positioningParent.getBoundingClientRect() : {
            left: 0,
            top: 0
        };
        const offset = {
            x: point.clientX - rect.left,
            y: point.clientY - rect.top
        };

        setIsDragging(true);
        if (onDragStart) {
            onDragStart(windowId, latestPositionRef.current);
        }

        if (dragCleanupRef.current) {
            dragCleanupRef.current();
        }

        const handleGlobalMove = moveEvent => {
            moveEvent.preventDefault();
            const movePoint = moveEvent.touches ? moveEvent.touches[0] : moveEvent;
            const nextX = movePoint.clientX - parentRect.left - offset.x;
            const nextY = movePoint.clientY - parentRect.top - offset.y;
            const nextPosition = {
                x: nextX,
                y: nextY
            };
            latestPositionRef.current = nextPosition;
            setPosition(nextPosition);
            if (onDrag) {
                onDrag(windowId, nextPosition);
            }
        };

        const cleanupDragListeners = () => {
            document.removeEventListener('mousemove', handleGlobalMove);
            document.removeEventListener('mouseup', handleGlobalEnd);
            document.removeEventListener('touchmove', handleGlobalMove);
            document.removeEventListener('touchend', handleGlobalEnd);
            document.removeEventListener('touchcancel', handleGlobalEnd);
        };

        const handleGlobalEnd = endEvent => {
            endEvent.preventDefault();
            setIsDragging(false);
            setIsDraggingMinimized(false);
            cleanupDragListeners();
            dragCleanupRef.current = null;
            if (onDragStop) {
                onDragStop(windowId, latestPositionRef.current);
            }
        };

        dragCleanupRef.current = cleanupDragListeners;

        if (event.touches) {
            document.addEventListener('touchmove', handleGlobalMove, {passive: false});
            document.addEventListener('touchend', handleGlobalEnd, {passive: false});
            document.addEventListener('touchcancel', handleGlobalEnd, {passive: false});
        } else {
            document.addEventListener('mousemove', handleGlobalMove);
            document.addEventListener('mouseup', handleGlobalEnd);
        }

        event.preventDefault();
        event.stopPropagation();
    }, [isDraggable, isMinimized, onDrag, onDragStart, onDragStop, windowId]);

    const handleResizeMouseDown = React.useCallback((handle, event) => {
        if (!isResizable || !allowResize || isMinimized) {
            return;
        }
        if (!event.touches && event.button !== 0) {
            return;
        }

        const startSize = latestSizeRef.current;
        setIsResizing(true);
        if (onResizeStart) {
            onResizeStart(windowId, startSize);
        }

        if (resizeCleanupRef.current) {
            resizeCleanupRef.current();
        }

        const handleResizeMove = moveEvent => {
            moveEvent.preventDefault();
            const movePoint = moveEvent.touches ? moveEvent.touches[0] : moveEvent;
            const rect = windowRef.current.getBoundingClientRect();
            let newWidth = startSize.width;
            let newHeight = startSize.height;

            if (handle === 'e' || handle === 'se') {
                newWidth = Math.max(minSize.width, Math.min(maxSize.width, movePoint.clientX - rect.left));
            }
            if (handle === 's' || handle === 'se') {
                newHeight = Math.max(minSize.height, Math.min(maxSize.height, movePoint.clientY - rect.top));
            }

            const nextSize = {
                width: newWidth,
                height: newHeight
            };
            latestSizeRef.current = nextSize;
            setSize(nextSize);
            if (onResize) {
                onResize(windowId, nextSize);
            }
        };

        const cleanupResizeListeners = () => {
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
            document.removeEventListener('touchmove', handleResizeMove);
            document.removeEventListener('touchend', handleResizeEnd);
            document.removeEventListener('touchcancel', handleResizeEnd);
        };

        const handleResizeEnd = endEvent => {
            endEvent.preventDefault();
            setIsResizing(false);
            cleanupResizeListeners();
            resizeCleanupRef.current = null;
            if (onResizeStop) {
                onResizeStop(windowId, latestSizeRef.current);
            }
        };

        resizeCleanupRef.current = cleanupResizeListeners;

        if (event.touches) {
            document.addEventListener('touchmove', handleResizeMove, {passive: false});
            document.addEventListener('touchend', handleResizeEnd, {passive: false});
            document.addEventListener('touchcancel', handleResizeEnd, {passive: false});
        } else {
            document.addEventListener('mousemove', handleResizeMove);
            document.addEventListener('mouseup', handleResizeEnd);
        }

        event.preventDefault();
        event.stopPropagation();
    }, [
        allowResize,
        isMinimized,
        isResizable,
        maxSize.height,
        maxSize.width,
        minSize.height,
        minSize.width,
        onResize,
        onResizeStart,
        onResizeStop,
        windowId
    ]);

    const handleToggleMinimize = React.useCallback(() => {
        if (!allowMinimize) {
            return;
        }
        if (isDraggingMinimized) {
            setIsDraggingMinimized(false);
            return;
        }

        if (isMinimized) {
            setIsMinimized(false);
            setPosition(originalPosition);
            setSize(originalSize);
            latestPositionRef.current = originalPosition;
            latestSizeRef.current = originalSize;
            if (onMinimizeToggle) {
                onMinimizeToggle(windowId, false);
            }
            return;
        }

        setOriginalPosition(latestPositionRef.current);
        setOriginalSize(latestSizeRef.current);
        setIsDragging(false);
        setIsResizing(false);
        setIsMinimized(true);
        setIsFullScreen(false);
        if (onMinimizeToggle) {
            onMinimizeToggle(windowId, true);
        }
    }, [
        allowMinimize,
        isDraggingMinimized,
        isMinimized,
        onMinimizeToggle,
        originalPosition,
        originalSize,
        windowId
    ]);

    const handleToggleFullScreen = React.useCallback(() => {
        if (onFullScreenToggle) {
            onFullScreenToggle(windowId, isFullScreen, latestPositionRef.current, latestSizeRef.current);
            return;
        }
        if (isFullScreen) {
            setPosition(originalPosition);
            setSize(originalSize);
            latestPositionRef.current = originalPosition;
            latestSizeRef.current = originalSize;
            setIsFullScreen(false);
            return;
        }

        setOriginalPosition(latestPositionRef.current);
        setOriginalSize(latestSizeRef.current);
        const fullScreenPosition = {x: 50, y: 50};
        const fullScreenSize = {
            width: window.innerWidth - 100,
            height: window.innerHeight - 100
        };
        setPosition(fullScreenPosition);
        setSize(fullScreenSize);
        latestPositionRef.current = fullScreenPosition;
        latestSizeRef.current = fullScreenSize;
        setIsFullScreen(true);
        setIsMinimized(false);
    }, [isFullScreen, onFullScreenToggle, originalPosition, originalSize, windowId]);

    const handleClose = React.useCallback(() => {
        if (onClose) {
            onClose(windowId);
            return;
        }
        const hiddenPosition = {x: -1000, y: -1000};
        setPosition(hiddenPosition);
        latestPositionRef.current = hiddenPosition;
        setIsMinimized(false);
        setIsFullScreen(false);
    }, [onClose, windowId]);

    if (isMinimized) {
        return null;
    }

    return (
        <div
            ref={windowRef}
            className={classNames(styles.draggableWindow, className)}
            style={{
                left: position.x,
                top: position.y,
                width: size.width,
                height: size.height,
                zIndex
            }}
            onMouseDownCapture={emitActivate}
            onTouchStartCapture={emitActivate}
            {...componentProps}
        >
            <div
                className={styles.windowHeader}
                onDoubleClick={allowMinimize ? handleToggleMinimize : undefined}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
            >
                <span className={styles.windowTitle}>{title}</span>
                {headerActions ? (
                    <div className={styles.headerActions}>
                        {headerActions}
                    </div>
                ) : null}
                <div className={styles.windowControls}>
                    {allowMinimize ? (
                        <button
                            className={styles.controlButton}
                            onClick={handleToggleMinimize}
                            onMouseDown={stopControlPropagation}
                            onTouchStart={stopControlPropagation}
                            title="Minimize"
                            type="button"
                        >
                            <span className={styles.controlGlyph}><MinimizeIcon /></span>
                        </button>
                    ) : null}
                    {allowMaximize ? (
                        <button
                            className={styles.controlButton}
                            onClick={handleToggleFullScreen}
                            onMouseDown={stopControlPropagation}
                            onTouchStart={stopControlPropagation}
                            title="Fullscreen"
                            type="button"
                        >
                            <span className={styles.controlGlyph}>
                                {isFullScreen ? <RestoreIcon /> : <FullscreenIcon />}
                            </span>
                        </button>
                    ) : null}
                    {onClose ? (
                        <button
                            className={styles.controlButton}
                            onClick={handleClose}
                            onMouseDown={stopControlPropagation}
                            onTouchStart={stopControlPropagation}
                            title="Close"
                            type="button"
                        >
                            <span className={styles.controlGlyph}><CloseIcon /></span>
                        </button>
                    ) : null}
                </div>
            </div>
            <div
                ref={contentRef}
                className={styles.windowContent}
            >
                {children}
            </div>
            {isResizable && allowResize ? (
                <React.Fragment>
                    <div
                        className={styles.resizeHandleE}
                        onMouseDown={event => handleResizeMouseDown('e', event)}
                        onTouchStart={event => handleResizeMouseDown('e', event)}
                    />
                    <div
                        className={styles.resizeHandleS}
                        onMouseDown={event => handleResizeMouseDown('s', event)}
                        onTouchStart={event => handleResizeMouseDown('s', event)}
                    />
                    <div
                        className={styles.resizeHandleSE}
                        onMouseDown={event => handleResizeMouseDown('se', event)}
                        onTouchStart={event => handleResizeMouseDown('se', event)}
                    />
                </React.Fragment>
            ) : null}
        </div>
    );
};

DraggableWindow.propTypes = {
    allowMaximize: PropTypes.bool,
    allowMinimize: PropTypes.bool,
    allowResize: PropTypes.bool,
    children: PropTypes.node,
    className: PropTypes.string,
    defaultPosition: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    }),
    defaultSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    enableStatePersistence: PropTypes.bool,
    headerActions: PropTypes.node,
    isDraggable: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isMinimized: PropTypes.bool,
    isResizable: PropTypes.bool,
    maxSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    minSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    onActivate: PropTypes.func,
    onClose: PropTypes.func,
    onContentResize: PropTypes.func,
    onDrag: PropTypes.func,
    onDragStart: PropTypes.func,
    onDragStop: PropTypes.func,
    onFullScreenToggle: PropTypes.func,
    onMinimizeToggle: PropTypes.func,
    onResize: PropTypes.func,
    onResizeStart: PropTypes.func,
    onResizeStop: PropTypes.func,
    position: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    }),
    size: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
    windowId: PropTypes.string.isRequired,
    zIndex: PropTypes.number
};

export default DraggableWindow;
