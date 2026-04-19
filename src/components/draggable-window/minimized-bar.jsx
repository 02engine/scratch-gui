import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import windowStateStorage from '../../lib/window-state-storage';
import styles from '../draggable-window/draggable-window.css';

const BUTTON_SIZE = 32;
const BUTTON_GAP = 8;
const EDGE_PADDING = 18;
const DEFAULT_TOP = 60;
const DRAG_THRESHOLD = 4;

const getPoint = event => (event.touches ? event.touches[0] : event);

const clampPositionToViewport = position => {
    if (typeof window === 'undefined') {
        return position;
    }
    return {
        x: Math.max(EDGE_PADDING, Math.min(window.innerWidth - BUTTON_SIZE - EDGE_PADDING, position.x)),
        y: Math.max(EDGE_PADDING, Math.min(window.innerHeight - BUTTON_SIZE - EDGE_PADDING, position.y))
    };
};

const getDefaultPosition = index => {
    if (typeof window === 'undefined') {
        return {
            x: EDGE_PADDING + (index * (BUTTON_SIZE + BUTTON_GAP)),
            y: DEFAULT_TOP
        };
    }
    return {
        x: Math.max(
            EDGE_PADDING,
            window.innerWidth - EDGE_PADDING - BUTTON_SIZE - (index * (BUTTON_SIZE + BUTTON_GAP))
        ),
        y: DEFAULT_TOP
    };
};

const getStoredPosition = windowId => {
    const savedState = windowStateStorage.getWindowState(`minimized-${windowId}`);
    if (!savedState || !savedState.position) {
        return null;
    }
    return clampPositionToViewport(savedState.position);
};

const MinimizedWindowButton = ({handleRestore, icon, index, title, windowId}) => {
    const [position, setPosition] = React.useState(() => (
        getStoredPosition(windowId) || getDefaultPosition(index)
    ));
    const [isDragging, setIsDragging] = React.useState(false);
    const positionRef = React.useRef(position);
    const dragStateRef = React.useRef(null);
    const cleanupRef = React.useRef(null);
    const suppressClickRef = React.useRef(false);

    React.useEffect(() => {
        positionRef.current = position;
    }, [position]);

    React.useEffect(() => () => {
        if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
        }
    }, []);

    const handlePointerStart = React.useCallback(event => {
        if (!event.touches && event.button !== 0) {
            return;
        }

        const point = getPoint(event);
        dragStateRef.current = {
            startX: point.clientX,
            startY: point.clientY,
            offsetX: point.clientX - positionRef.current.x,
            offsetY: point.clientY - positionRef.current.y,
            didDrag: false
        };

        if (cleanupRef.current) {
            cleanupRef.current();
        }

        const handlePointerMove = moveEvent => {
            const movePoint = getPoint(moveEvent);
            const dragState = dragStateRef.current;
            if (!dragState) {
                return;
            }

            const distanceX = movePoint.clientX - dragState.startX;
            const distanceY = movePoint.clientY - dragState.startY;
            if (!dragState.didDrag &&
                Math.sqrt((distanceX * distanceX) + (distanceY * distanceY)) < DRAG_THRESHOLD) {
                return;
            }

            dragState.didDrag = true;
            setIsDragging(true);
            moveEvent.preventDefault();

            const nextPosition = clampPositionToViewport({
                x: movePoint.clientX - dragState.offsetX,
                y: movePoint.clientY - dragState.offsetY
            });
            positionRef.current = nextPosition;
            setPosition(nextPosition);
        };

        let cleanup = null;
        const handlePointerEnd = () => {
            const dragState = dragStateRef.current;
            if (cleanup) {
                cleanup();
            }
            cleanupRef.current = null;
            setIsDragging(false);
            dragStateRef.current = null;

            if (dragState && dragState.didDrag) {
                suppressClickRef.current = true;
                windowStateStorage.saveWindowState(`minimized-${windowId}`, {
                    position: positionRef.current
                });
            }
        };
        cleanup = () => {
            document.removeEventListener('mousemove', handlePointerMove);
            document.removeEventListener('mouseup', handlePointerEnd);
            document.removeEventListener('touchmove', handlePointerMove);
            document.removeEventListener('touchend', handlePointerEnd);
            document.removeEventListener('touchcancel', handlePointerEnd);
        };

        cleanupRef.current = cleanup;

        if (event.touches) {
            document.addEventListener('touchmove', handlePointerMove, {passive: false});
            document.addEventListener('touchend', handlePointerEnd, {passive: false});
            document.addEventListener('touchcancel', handlePointerEnd, {passive: false});
        } else {
            document.addEventListener('mousemove', handlePointerMove);
            document.addEventListener('mouseup', handlePointerEnd);
        }

        event.stopPropagation();
    }, [windowId]);

    const handleClick = React.useCallback(event => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        handleRestore();
    }, [handleRestore]);

    return (
        <div
            className={classNames(styles.minimizedWindow, {
                [styles.minimizedWindowDragging]: isDragging
            })}
            style={{
                left: position.x,
                top: position.y
            }}
            title={`Restore ${title}`}
            onClick={handleClick}
            onMouseDown={handlePointerStart}
            onTouchStart={handlePointerStart}
        >
            <span className={styles.minimizedWindowIcon}>
                {icon}
            </span>
            <span className={styles.minimizedWindowTitle}>{title}</span>
        </div>
    );
};

MinimizedWindowButton.propTypes = {
    handleRestore: PropTypes.func.isRequired,
    icon: PropTypes.node,
    index: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    windowId: PropTypes.string.isRequired
};

const MinimizedBar = ({windows}) => {
    if (!windows || windows.length === 0) return null;
    return (
        <div className={styles.minimizedBar}>
            {windows.map((win, index) => (
                <MinimizedWindowButton
                    key={win.windowId}
                    icon={win.icon}
                    index={index}
                    title={win.title}
                    windowId={win.windowId}
                    handleRestore={win.onRestore}
                />
            ))}
        </div>
    );
};

MinimizedBar.propTypes = {
    windows: PropTypes.arrayOf(PropTypes.shape({
        icon: PropTypes.node,
        onRestore: PropTypes.func.isRequired,
        title: PropTypes.string.isRequired,
        windowId: PropTypes.string.isRequired
    }))
};

export default MinimizedBar;
