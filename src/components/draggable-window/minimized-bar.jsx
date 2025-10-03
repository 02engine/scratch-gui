import React from 'react';
import styles from '../draggable-window/draggable-window.css';

/**
 * 全局最小化窗口栏组件
 * @param {Object[]} windows - [{windowId, title, icon, onRestore}]
 */
const MinimizedBar = ({windows}) => {
    if (!windows || windows.length === 0) return null;
    return (
        <div className={styles.minimizedBar}>
            {windows.map(win => (
                <div
                    key={win.windowId}
                    className={styles.minimizedWindow}
                    onClick={win.onRestore}
                    title={`还原${win.title}`}
                >
                    <span className={styles.minimizedWindowIcon}>
                        {win.icon}
                    </span>
                    <span className={styles.minimizedWindowTitle}>{win.title}</span>
                </div>
            ))}
        </div>
    );
};

export default MinimizedBar;
