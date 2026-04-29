/**
 * Simple notification manager for collaboration components
 * Provides static methods to show notifications
 */

class NotificationSystem {
    static notifications = [];
    static timeouts = [];

    /**
     * Create and show a notification
     * @param {string} type - Type of notification (info, warning, error, success)
     * @param {string} message - Message to display
     * @param {number} duration - Duration in milliseconds (0 for no auto-dismiss)
     * @returns {HTMLElement} The notification element
     */
    static show (type, message, duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${this.getColor(type)};
            color: white;
            padding: 15px 20px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            z-index: 9999;
            max-width: 400px;
            animation: slideIn 0.3s ease-out;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            font-size: 14px;
        `;

        notification.textContent = message;

        // Add animation styles if not already added
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
            margin-left: 10px;
            padding: 0;
            width: 20px;
            height: 20px;
            line-height: 20px;
        `;
        closeBtn.onclick = () => this.dismiss(notification);
        notification.appendChild(closeBtn);

        document.body.appendChild(notification);
        this.notifications.push(notification);

        // Auto dismiss after duration
        if (duration > 0) {
            const timeout = setTimeout(() => {
                this.dismiss(notification);
            }, duration);
            this.timeouts.push(timeout);
        }

        return notification;
    }

    /**
     * Get color for notification type
     */
    static getColor (type) {
        const colors = {
            info: '#2196F3',
            warning: '#FF9800',
            error: '#F44336',
            success: '#4CAF50'
        };
        return colors[type] || colors.info;
    }

    /**
     * Dismiss a notification
     */
    static dismiss (notification) {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            const index = this.notifications.indexOf(notification);
            if (index > -1) {
                this.notifications.splice(index, 1);
            }
        }, 300);
    }

    /**
     * Show info notification
     */
    static info (message, duration = 5000) {
        return this.show('info', message, duration);
    }

    /**
     * Show warning notification
     */
    static warning (message, duration = 5000) {
        return this.show('warning', message, duration);
    }

    /**
     * Show error notification
     */
    static error (message, duration = 5000) {
        return this.show('error', message, duration);
    }

    /**
     * Show success notification
     */
    static success (message, duration = 5000) {
        return this.show('success', message, duration);
    }

    /**
     * Clear all notifications
     */
    static clearAll () {
        this.notifications.forEach(notification => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
        this.notifications = [];
    }

    /**
     * Clean up all timeouts and notifications
     */
    static cleanup () {
        // Clear all pending timeouts
        this.timeouts.forEach(timeout => {
            clearTimeout(timeout);
        });
        this.timeouts = [];

        // Remove all notifications
        this.clearAll();
    }
}

export default NotificationSystem;