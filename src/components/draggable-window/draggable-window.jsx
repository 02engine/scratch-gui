import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import styles from './draggable-window.css';
import windowStateStorage from '../../lib/window-state-storage';

const DraggableWindow = props => {
    const {
        children,
        className,
        defaultPosition = {x: 100, y: 100},
        defaultSize = {width: 400, height: 300},
        isDraggable = true,
        isResizable = true,
        minSize = {width: 200, height: 150},
        maxSize = {width: 800, height: 600},
        onDragStart,
        onDrag,
        onDragStop,
        onResizeStart,
        onResize,
        onResizeStop,
        onMinimizeToggle,
        title,
        windowId,
        zIndex = 1,
        enableStatePersistence = true,
        ...componentProps
    } = props;

    // 从本地存储恢复窗口状态
    const getInitialState = () => {
        if (enableStatePersistence && windowId) {
            const savedState = windowStateStorage.getValidWindowState(windowId, {
                position: defaultPosition,
                size: defaultSize,
                isMinimized: false
            });
            return savedState;
        }
        return {
            position: defaultPosition,
            size: defaultSize,
            isMinimized: false
        };
    };

    const initialState = getInitialState();
    const [position, setPosition] = React.useState(initialState.position);
    const [size, setSize] = React.useState(initialState.size);
    const [isDragging, setIsDragging] = React.useState(false);
    const [isResizing, setIsResizing] = React.useState(false);
    const [dragOffset, setDragOffset] = React.useState({x: 0, y: 0});
    const [resizeHandle, setResizeHandle] = React.useState(null);
    const [isMinimized, setIsMinimized] = React.useState(initialState.isMinimized);
    const [isFullScreen, setIsFullScreen] = React.useState(false);
    const [originalPosition, setOriginalPosition] = React.useState(initialState.position);
    const [originalSize, setOriginalSize] = React.useState(initialState.size);
    const [isDraggingMinimized, setIsDraggingMinimized] = React.useState(false);
    const [dragStartPosition, setDragStartPosition] = React.useState({x: 0, y: 0});

    const windowRef = React.useRef();
    const headerRef = React.useRef();

    // 保存窗口状态到本地存储
    const saveWindowState = React.useCallback(() => {
        if (enableStatePersistence && windowId) {
            windowStateStorage.saveWindowState(windowId, {
                position,
                size,
                isMinimized
            });
        }
    }, [enableStatePersistence, windowId, position, size, isMinimized]);

    // 当状态变化时自动保存
    React.useEffect(() => {
        saveWindowState();
    }, [position, size, isMinimized, saveWindowState]);

    const handleMouseDown = React.useCallback(e => {
        if (!isDraggable) return;
        if (!e.touches && e.button !== 0) return; // 只在非触摸事件时检查鼠标按钮
        
        // 检查是否是触摸事件
        const touch = e.touches ? e.touches[0] : null;
        const clientX = touch ? touch.clientX : e.clientX;
        const clientY = touch ? touch.clientY : e.clientY;
        
        const rect = windowRef.current.getBoundingClientRect();
        const offset = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
        setDragOffset(offset);
        setIsDragging(true);
        onDragStart && onDragStart(windowId, position);

        const handleGlobalMove = (moveEvent) => {
            moveEvent.preventDefault(); // 阻止默认滚动行为
            
            const moveTouch = moveEvent.touches ? moveEvent.touches[0] : null;
            const moveClientX = moveTouch ? moveTouch.clientX : moveEvent.clientX;
            const moveClientY = moveTouch ? moveTouch.clientY : moveEvent.clientY;
            
            const newX = moveClientX - offset.x;
            const newY = moveClientY - offset.y;
            
            const targetX = Math.max(0, Math.min(window.innerWidth - size.width, newX));
            const targetY = Math.max(0, Math.min(window.innerHeight - size.height, newY));
            
            const newPosition = {
                x: targetX,
                y: targetY
            };
            
            setPosition(newPosition);
            onDrag && onDrag(windowId, newPosition);
        };

        const handleGlobalEnd = (endEvent) => {
            endEvent.preventDefault();
            setIsDragging(false);
            setIsDraggingMinimized(false);
            
            // 清理所有事件监听
            document.removeEventListener('mousemove', handleGlobalMove);
            document.removeEventListener('mouseup', handleGlobalEnd);
            document.removeEventListener('touchmove', handleGlobalMove);
            document.removeEventListener('touchend', handleGlobalEnd);
            document.removeEventListener('touchcancel', handleGlobalEnd);
            
            onDragStop && onDragStop(windowId, position);
        };

        if (touch) {
            // 触摸事件
            document.addEventListener('touchmove', handleGlobalMove, { passive: false });
            document.addEventListener('touchend', handleGlobalEnd, { passive: false });
            document.addEventListener('touchcancel', handleGlobalEnd, { passive: false });
        } else {
            // 鼠标事件
            document.addEventListener('mousemove', handleGlobalMove);
            document.addEventListener('mouseup', handleGlobalEnd);
        }

        e.preventDefault();
        e.stopPropagation();
    }, [isDraggable, onDragStart, onDrag, onDragStop, windowId, position, size]);

    const handleResizeMove = React.useCallback(e => {
        if (isResizing && resizeHandle) {
            const touch = e.touches ? e.touches[0] : null;
            const clientX = touch ? touch.clientX : e.clientX;
            const clientY = touch ? touch.clientY : e.clientY;
            
            const rect = windowRef.current.getBoundingClientRect();
            let newWidth = size.width;
            let newHeight = size.height;
            
            switch (resizeHandle) {
            case 'e':
                newWidth = Math.max(minSize.width, Math.min(maxSize.width, e.clientX - rect.left));
                break;
            case 's':
                newHeight = Math.max(minSize.height, Math.min(maxSize.height, e.clientY - rect.top));
                break;
            case 'se':
                newWidth = Math.max(minSize.width, Math.min(maxSize.width, e.clientX - rect.left));
                newHeight = Math.max(minSize.height, Math.min(maxSize.height, e.clientY - rect.top));
                break;
            default:
                break;
            }
            
            const newSize = {width: newWidth, height: newHeight};
            setSize(newSize);
            onResize && onResize(windowId, newSize);
        }
    }, [isDragging, isResizing, resizeHandle, dragOffset, size, minSize, maxSize, onDrag, onResize, windowId]);

    const handleResizeUp = React.useCallback(() => {
        if (isResizing) {
            setIsResizing(false);
            setResizeHandle(null);
            onResizeStop && onResizeStop(windowId, size);
            // 清除resize相关的事件监听器
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeUp);
            document.removeEventListener('touchmove', handleResizeMove);
            document.removeEventListener('touchend', handleResizeUp);
        }
    }, [isResizing, onResizeStop, windowId, size, handleResizeMove]);

    const handleResizeMouseDown = React.useCallback((handle, e) => {
        if (!isResizable || isMinimized) return;
        if (!e.touches && e.button !== 0) return; // 只在非触摸事件时检查鼠标按钮
        
        const touch = e.touches ? e.touches[0] : null;
        setIsResizing(true);
        setResizeHandle(handle);
        onResizeStart && onResizeStart(windowId, size);

        const handleResizeGlobalMove = (moveEvent) => {
            moveEvent.preventDefault();
            const moveTouch = moveEvent.touches ? moveEvent.touches[0] : null;
            const moveClientX = moveTouch ? moveTouch.clientX : moveEvent.clientX;
            const moveClientY = moveTouch ? moveTouch.clientY : moveEvent.clientY;

            const rect = windowRef.current.getBoundingClientRect();
            let newWidth = size.width;
            let newHeight = size.height;
            
            switch (handle) {
                case 'e':
                    newWidth = Math.max(minSize.width, Math.min(maxSize.width, moveClientX - rect.left));
                    break;
                case 's':
                    newHeight = Math.max(minSize.height, Math.min(maxSize.height, moveClientY - rect.top));
                    break;
                case 'se':
                    newWidth = Math.max(minSize.width, Math.min(maxSize.width, moveClientX - rect.left));
                    newHeight = Math.max(minSize.height, Math.min(maxSize.height, moveClientY - rect.top));
                    break;
                default:
                    break;
            }
            
            const newSize = {width: newWidth, height: newHeight};
            setSize(newSize);
            onResize && onResize(windowId, newSize);
        };

        const handleResizeGlobalEnd = (endEvent) => {
            endEvent.preventDefault();
            setIsResizing(false);
            setResizeHandle(null);
            
            // 清理所有事件监听
            document.removeEventListener('mousemove', handleResizeGlobalMove);
            document.removeEventListener('mouseup', handleResizeGlobalEnd);
            document.removeEventListener('touchmove', handleResizeGlobalMove);
            document.removeEventListener('touchend', handleResizeGlobalEnd);
            document.removeEventListener('touchcancel', handleResizeGlobalEnd);
            
            onResizeStop && onResizeStop(windowId, size);
        };

        if (touch) {
            // 触摸事件
            document.addEventListener('touchmove', handleResizeGlobalMove, { passive: false });
            document.addEventListener('touchend', handleResizeGlobalEnd, { passive: false });
            document.addEventListener('touchcancel', handleResizeGlobalEnd, { passive: false });
        } else {
            // 鼠标事件
            document.addEventListener('mousemove', handleResizeGlobalMove);
            document.addEventListener('mouseup', handleResizeGlobalEnd);
        }

        e.preventDefault();
        e.stopPropagation();
    }, [isResizable, isMinimized, onResizeStart, onResize, onResizeStop, windowId, size, minSize, maxSize]);

    const handleToggleMinimize = React.useCallback(() => {
        if (!isDraggingMinimized) {
            if (isMinimized) {
                // 恢复时回到原始位置和尺寸，避免重叠
                setIsMinimized(false);
                setPosition(originalPosition);
                setSize(originalSize);
                onMinimizeToggle && onMinimizeToggle(windowId, false);
            } else {
                // 最小化时记录当前位置和尺寸
                setOriginalPosition(position);
                setOriginalSize(size);
                setIsMinimized(true);
                setIsFullScreen(false);
                onMinimizeToggle && onMinimizeToggle(windowId, true);
            }
        }
        setIsDraggingMinimized(false);
    }, [isMinimized, isDraggingMinimized, originalPosition, originalSize, position, size, onMinimizeToggle, windowId]);

    const handleToggleFullScreen = React.useCallback(() => {
        if (isFullScreen) {
            // Restore window
            setPosition(originalPosition);
            setSize(originalSize);
            setIsFullScreen(false);
        } else {
            // Full screen
            setOriginalPosition(position);
            setOriginalSize(size);
            setPosition({x: 50, y: 50});
            setSize({width: window.innerWidth - 100, height: window.innerHeight - 100});
            setIsFullScreen(true);
            setIsMinimized(false);
        }
    }, [isFullScreen, originalPosition, originalSize, position, size]);

    const handleClose = React.useCallback(() => {
        // Hide the window
        setPosition({x: -1000, y: -1000});
        setIsMinimized(false);
        setIsFullScreen(false);
    }, []);

    // 由父组件统一渲染最小化栏，最小化时本窗口不渲染内容
    if (isMinimized) return null;

    // 正常窗口
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
            {...componentProps}
        >
            <div
                ref={headerRef}
                className={styles.windowHeader}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
                onDoubleClick={handleToggleMinimize}
            >
                <span className={styles.windowTitle}>{title}</span>
                <div className={styles.windowControls}>
                    <button
                        className={styles.controlButton}
                        onClick={handleToggleMinimize}
                        title="最小化"
                    >
                        −
                    </button>
                    <button
                        className={styles.controlButton}
                        onClick={handleToggleFullScreen}
                        title="全屏"
                    >
                        □
                    </button>
                </div>
            </div>
            <div className={styles.windowContent}>
                {children}
            </div>
            {isResizable && (
                <>
                    <div
                        className={styles.resizeHandleE}
                        onMouseDown={e => handleResizeMouseDown('e', e)}
                        onTouchStart={e => handleResizeMouseDown('e', e)}
                    />
                    <div
                        className={styles.resizeHandleS}
                        onMouseDown={e => handleResizeMouseDown('s', e)}
                        onTouchStart={e => handleResizeMouseDown('s', e)}
                    />
                    <div
                        className={styles.resizeHandleSE}
                        onMouseDown={e => handleResizeMouseDown('se', e)}
                        onTouchStart={e => handleResizeMouseDown('se', e)}
                    />
                </>
            )}
        </div>
    );
};

DraggableWindow.propTypes = {
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
    isDraggable: PropTypes.bool,
    isResizable: PropTypes.bool,
    minSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    maxSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    onDragStart: PropTypes.func,
    onDrag: PropTypes.func,
    onDragStop: PropTypes.func,
    onResizeStart: PropTypes.func,
    onResize: PropTypes.func,
    onResizeStop: PropTypes.func,
    onMinimizeToggle: PropTypes.func,
    title: PropTypes.string.isRequired,
    windowId: PropTypes.string.isRequired,
    zIndex: PropTypes.number,
    enableStatePersistence: PropTypes.bool
};

export default DraggableWindow;
