/**
 * 窗口状态存储工具类
 * 用于保存和恢复拖动窗口的位置、大小和状态
 */
class WindowStateStorage {
    constructor() {
        this.storageKey = 'scratch-gui-window-states';
    }

    /**
     * 保存窗口状态到本地存储
     * @param {string} windowId - 窗口ID
     * @param {Object} state - 窗口状态
     */
    saveWindowState(windowId, state) {
        try {
            const allStates = this.getAllWindowStates();
            allStates[windowId] = {
                ...state,
                lastUpdated: Date.now()
            };
            localStorage.setItem(this.storageKey, JSON.stringify(allStates));
        } catch (error) {
            console.warn('Failed to save window state:', error);
        }
    }

    /**
     * 获取特定窗口的状态
     * @param {string} windowId - 窗口ID
     * @returns {Object|null} 窗口状态，如果不存在则返回null
     */
    getWindowState(windowId) {
        try {
            const allStates = this.getAllWindowStates();
            return allStates[windowId] || null;
        } catch (error) {
            console.warn('Failed to get window state:', error);
            return null;
        }
    }

    /**
     * 获取所有窗口状态
     * @returns {Object} 所有窗口状态
     */
    getAllWindowStates() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.warn('Failed to parse window states:', error);
            return {};
        }
    }

    /**
     * 清除特定窗口的状态
     * @param {string} windowId - 窗口ID
     */
    clearWindowState(windowId) {
        try {
            const allStates = this.getAllWindowStates();
            delete allStates[windowId];
            localStorage.setItem(this.storageKey, JSON.stringify(allStates));
        } catch (error) {
            console.warn('Failed to clear window state:', error);
        }
    }

    /**
     * 清除所有窗口状态
     */
    clearAllWindowStates() {
        try {
            localStorage.removeItem(this.storageKey);
        } catch (error) {
            console.warn('Failed to clear all window states:', error);
        }
    }

    /**
     * 检查窗口状态是否过期（超过7天）
     * @param {Object} state - 窗口状态
     * @returns {boolean} 是否过期
     */
    isStateExpired(state) {
        if (!state || !state.lastUpdated) {
            return true;
        }
        const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
        return Date.now() - state.lastUpdated > sevenDaysInMs;
    }

    /**
     * 获取有效的窗口状态（未过期的）
     * @param {string} windowId - 窗口ID
     * @param {Object} defaultState - 默认状态
     * @returns {Object} 有效的窗口状态
     */
    getValidWindowState(windowId, defaultState) {
        const state = this.getWindowState(windowId);
        if (!state || this.isStateExpired(state)) {
            return defaultState;
        }
        return {
            position: state.position || defaultState.position,
            size: state.size || defaultState.size,
            isMinimized: state.isMinimized || false
        };
    }
}

// 导出单例实例
export default new WindowStateStorage();