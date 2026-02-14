// Extension Debug Service - 用于调试扩展的WebSocket服务
(function() {
    'use strict';

    const DEBUG_SERVER_URL = 'ws://localhost:1101';
    const HEARTBEAT_INTERVAL = 30000; // 30秒心跳间隔

    let ws = null;
    let vm = null;
    let heartbeatInterval = null;
    let connectionFailed = false; // 连接失败标记

    /**
     * 从扩展代码中提取extensionId
     */
    function extractExtensionId(extensionCode) {
        try {
            // 使用正则表达式提取getInfo()方法中的id
            const getInfoMatch = extensionCode.match(/getInfo\s*\(\)\s*\{[\s\S]*?id:\s*['"`]([^'"`]+)['"`]/);
            if (getInfoMatch) {
                return getInfoMatch[1];
            }

            // 尝试另一种模式
            const idMatch = extensionCode.match(/id:\s*['"`]([^'"`]+)['"`]/);
            if (idMatch) {
                return idMatch[1];
            }

            return null;
        } catch (error) {
            console.error('Failed to extract extension ID:', error);
            return null;
        }
    }

    /**
     * 卸载扩展
     */
    function unloadExtension(extensionId) {
        if (!vm || !vm.extensionManager) {
            console.warn('VM or extensionManager not available');
            return;
        }

        // 从_loadedExtensions中移除
        vm.extensionManager._loadedExtensions.delete(extensionId);

        console.log('Extension unloaded:', extensionId);
    }

    /**
     * 加载扩展
     */
    async function loadExtension(extensionCode) {
        if (!vm || !vm.extensionManager) {
            throw new Error('VM or extensionManager not available');
        }

        // 提取extensionId
        const extensionId = extractExtensionId(extensionCode);
        if (!extensionId) {
            throw new Error('Could not extract extension ID from code');
        }

        console.log('Loading extension:', extensionId);

        // 检查扩展是否已存在
        if (vm.extensionManager.isExtensionLoaded(extensionId)) {
            console.log('Extension already loaded, unloading first:', extensionId);
            unloadExtension(extensionId);
        }

        // 转换为Data URL
        const dataURL = `data:application/javascript,${encodeURIComponent(extensionCode)}`;

        // 加载扩展
        await vm.extensionManager.loadExtensionURL(dataURL);

        console.log('Extension loaded successfully:', extensionId);
        return extensionId;
    }

    /**
     * 发送消息到服务器
     */
    function sendMessage(message) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    /**
     * 发送心跳
     */
    function sendHeartbeat() {
        sendMessage({ type: 'ping' });
    }

    /**
     * 开始心跳
     */
    function startHeartbeat() {
        stopHeartbeat();
        heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    }

    /**
     * 停止心跳
     */
    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
    }

    /**
     * 处理WebSocket消息
     */
    async function handleWebSocketMessage(event) {
        try {
            const message = JSON.parse(event.data);

            switch (message.type) {
                case 'extension':
                    if (message.code) {
                        try {
                            const extensionId = await loadExtension(message.code);

                            // 发送成功消息
                            sendMessage({
                                type: 'loadResult',
                                success: true,
                                extensionId: extensionId,
                                message: 'Extension loaded successfully'
                            });

                            // 更新状态
                            sendMessage({
                                type: 'status',
                                connected: true,
                                extensionId: extensionId
                            });
                        } catch (error) {
                            console.error('Failed to load extension:', error);

                            // 发送失败消息
                            sendMessage({
                                type: 'loadResult',
                                success: false,
                                error: error.message || 'Unknown error'
                            });
                        }
                    }
                    break;

                case 'pong':
                    // 心跳响应，不需要处理
                    break;

                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Failed to handle WebSocket message:', error);
        }
    }

    /**
     * 处理WebSocket打开
     */
    function handleWebSocketOpen() {
        console.log('Extension debugging server connected');
        connectionFailed = false;

        // 发送连接状态
        sendMessage({
            type: 'status',
            connected: true
        });

        // 开始心跳
        startHeartbeat();

        // 通知外部（如果有的话）
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('extensionDebugStatus', {
                detail: { connected: true }
            }));
        }
    }

    /**
     * 处理WebSocket关闭
     */
    function handleWebSocketClose() {
        console.log('Extension debugging server disconnected');
        stopHeartbeat();

        // 通知外部（如果有的话）
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('extensionDebugStatus', {
                detail: { connected: false }
            }));
        }
    }

    /**
     * 处理WebSocket错误
     */
    function handleWebSocketError(event) {
        const error = event.message || 'Connection failed';
        console.error('Extension debugging server error:', error);
        connectionFailed = true;

        // 通知外部（如果有的话）
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('extensionDebugStatus', {
                detail: { connected: false, error: error }
            }));
        }
    }

    /**
     * 连接到调试服务器
     */
    function connect() {
        if (ws) {
            disconnect();
        }

        try {
            ws = new WebSocket(DEBUG_SERVER_URL);
            ws.onopen = handleWebSocketOpen;
            ws.onclose = handleWebSocketClose;
            ws.onerror = handleWebSocketError;
            ws.onmessage = handleWebSocketMessage;
        } catch (error) {
            handleWebSocketError({ message: error.message });
        }
    }

    /**
     * 断开连接
     */
    function disconnect() {
        stopHeartbeat();

        if (ws) {
            ws.close();
            ws = null;
        }
    }

    /**
     * 获取连接状态
     */
    function isConnected() {
        return ws !== null && ws.readyState === WebSocket.OPEN;
    }

    /**
     * 是否连接失败
     */
    function isConnectionFailed() {
        return connectionFailed;
    }

    /**
     * 初始化服务
     */
    function init(vmInstance) {
        vm = vmInstance;
        console.log('Extension debug service initialized');

        // 立即尝试连接
        connect();
    }

    // 导出到全局对象，方便外部调用
    if (typeof window !== 'undefined') {
        window.ScratchExtensionDebug = {
            init: init,
            connect: connect,
            disconnect: disconnect,
            isConnected: isConnected,
            isConnectionFailed: isConnectionFailed
        };
        console.log('Extension debug service loaded');
    }
})();