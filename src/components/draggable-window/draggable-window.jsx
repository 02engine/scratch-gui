import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import styles from './draggable-window.css';

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
        ...componentProps
    } = props;

    const [position, setPosition] = React.useState(defaultPosition);
    const [size, setSize] = React.useState(defaultSize);
    const [isDragging, setIsDragging] = React.useState(false);
    const [isResizing, setIsResizing] = React.useState(false);
    const [dragOffset, setDragOffset] = React.useState({x: 0, y: 0});
    const [resizeHandle, setResizeHandle] = React.useState(null);
    const [isMinimized, setIsMinimized] = React.useState(false);
    const [isFullScreen, setIsFullScreen] = React.useState(false);
    const [originalPosition, setOriginalPosition] = React.useState(defaultPosition);
    const [originalSize, setOriginalSize] = React.useState(defaultSize);
    const [isDraggingMinimized, setIsDraggingMinimized] = React.useState(false);
    const [dragStartPosition, setDragStartPosition] = React.useState({x: 0, y: 0});

    const windowRef = React.useRef();
    const headerRef = React.useRef();

    const handleMouseDown = React.useCallback(e => {
        if (!isDraggable) return;
        
        const rect = windowRef.current.getBoundingClientRect();
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
        setIsDragging(true);
        onDragStart && onDragStart(windowId, position);
        e.preventDefault();
        e.stopPropagation();
    }, [isDraggable, onDragStart, windowId, position]);

    const handleMouseMove = React.useCallback(e => {
        if (isDragging) {
            const newX = e.clientX - dragOffset.x;
            const newY = e.clientY - dragOffset.y;
            
            // Constrain to viewport
            const constrainedX = Math.max(0, Math.min(window.innerWidth - size.width, newX));
            const constrainedY = Math.max(0, Math.min(window.innerHeight - size.height, newY));
            
            const newPosition = {x: constrainedX, y: constrainedY};
            setPosition(newPosition);
            onDrag && onDrag(windowId, newPosition);
        } else if (isResizing && resizeHandle) {
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

    const handleMouseUp = React.useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
            onDragStop && onDragStop(windowId, position);
        }
        if (isResizing) {
            setIsResizing(false);
            setResizeHandle(null);
            onResizeStop && onResizeStop(windowId, size);
        }
    }, [isDragging, isResizing, onDragStop, onResizeStop, windowId, position, size]);

    const handleResizeMouseDown = React.useCallback((handle, e) => {
        if (!isResizable || isMinimized) return;
        
        setIsResizing(true);
        setResizeHandle(handle);
        onResizeStart && onResizeStart(windowId, size);
        e.preventDefault();
        e.stopPropagation();
    }, [isResizable, isMinimized, onResizeStart, windowId, size]);

    const handleToggleMinimize = React.useCallback(() => {
        if (!isDraggingMinimized) {
            if (isMinimized) {
                // Restore window
                setPosition(originalPosition);
                setSize(originalSize);
                setIsMinimized(false);
                onMinimizeToggle && onMinimizeToggle(windowId, false);
            } else {
                // Minimize window
                setOriginalPosition(position);
                setOriginalSize(size);
                setPosition({x: window.innerWidth - 60, y: window.innerHeight - 60});
                setSize({width: 40, height: 40});
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

    React.useEffect(() => {
        if (isDragging || isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

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
            {isMinimized ? (
                <div
                    className={styles.minimizedWindow}
                    onClick={handleToggleMinimize}
                    onMouseDown={e => {
                        setDragStartPosition({x: e.clientX, y: e.clientY});
                        handleMouseDown(e);
                    }}
                    onMouseMove={e => {
                        if (isDragging) {
                            const dx = Math.abs(e.clientX - dragStartPosition.x);
                            const dy = Math.abs(e.clientY - dragStartPosition.y);
                            if (dx > 5 || dy > 5) {
                                setIsDraggingMinimized(true);
                            }
                        }
                    }}
                    title={`Restore ${title}`}
                >
                    {title === 'Stage' ? (
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                            <rect x="2" y="2" width="16" height="16" rx="2" stroke="white" strokeWidth="1" fill="none"/>
                            <rect x="6" y="6" width="8" height="8" fill="white"/>
                        </svg>
                    ) : title === 'Sprites' ? (
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                            <circle cx="10" cy="6" r="3" fill="white"/>
                            <circle cx="5" cy="12" r="2.5" fill="white"/>
                            <circle cx="15" cy="12" r="2.5" fill="white"/>
                        </svg>
                    ) : (
                        title.charAt(0)
                    )}
                </div>
            ) : (
                <React.Fragment>
                    <div
                        ref={headerRef}
                        className={styles.windowHeader}
                        onMouseDown={handleMouseDown}
                        onDoubleClick={handleToggleMinimize}
                    >
                        <span className={styles.windowTitle}>{title}</span>
                        <div className={styles.windowControls}>
                            <button
                                className={styles.controlButton}
                                onClick={handleToggleMinimize}
                                title="Minimize"
                            >
                                −
                            </button>
                            <button
                                className={styles.controlButton}
                                onClick={handleToggleFullScreen}
                                title="Full Screen"
                            >
                                □
                            </button>
                            {/*<button
                                className={styles.controlButton}
                                onClick={handleClose}
                                title="Close"
                            >
                                ×
                            </button>*/}
                        </div>
                    </div>
            
                    <div className={styles.windowContent}>
                        {children}
                    </div>
                </React.Fragment>
            )}
            
            {isResizable && (
                <>
                    <div
                        className={styles.resizeHandleE}
                        onMouseDown={e => handleResizeMouseDown('e', e)}
                    />
                    <div
                        className={styles.resizeHandleS}
                        onMouseDown={e => handleResizeMouseDown('s', e)}
                    />
                    <div
                        className={styles.resizeHandleSE}
                        onMouseDown={e => handleResizeMouseDown('se', e)}
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
    zIndex: PropTypes.number
};

export default DraggableWindow;
