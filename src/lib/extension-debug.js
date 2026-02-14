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
     * 卸载扩展
     */
    function unloadExtension(extensionId) {
        if (!vm || !vm.extensionManager) {
            console.warn('VM or extensionManager not available');
            return;
        }

        const runtime = vm.runtime;
        const extensionManager = vm.extensionManager;

        // 获取 serviceName 并从中提取 workerId
        const serviceName = extensionManager._loadedExtensions.get(extensionId);
        if (serviceName) {
            // Service names for extension workers are in the format "extension.WORKER_ID.EXTENSION_ID" or "unsandboxed.WORKER_ID.EXTENSION_ID"
            const serviceNameParts = serviceName.split('.');
            if (serviceNameParts.length >= 2) {
                const workerId = +serviceNameParts[1]; // 第二个部分是 workerId
                // 从 workerURLs 中删除 URL，这样相同的 URL 可以被重新加载
                delete extensionManager.workerURLs[workerId];
            }
        }

        // 从_loadedExtensions中移除
        extensionManager._loadedExtensions.delete(extensionId);

        // 从runtime._blockInfo中移除扩展分类
        if (runtime && runtime._blockInfo) {
            runtime._blockInfo = runtime._blockInfo.filter(
                categoryInfo => categoryInfo.id !== extensionId
            );
        }

        // 从ScratchBlocks中移除扩展积木定义
        if (typeof window !== 'undefined' && window.ScratchBlocks && window.ScratchBlocks.Blocks) {
            const extensionPrefix = `${extensionId}_`;
            for (const blockName in window.ScratchBlocks.Blocks) {
                if (blockName.startsWith(extensionPrefix)) {
                    delete window.ScratchBlocks.Blocks[blockName];
                }
            }
        }

        // 触发积木分类更新事件
        if (runtime && runtime.emit) {
            runtime.emit('toolboxUpdate');
        }

        // 触发workspace更新，刷新积木列表
        if (vm.emitWorkspaceUpdate) {
            vm.emitWorkspaceUpdate();
        }

        // 尝试从 toolbox 中移除分类（如果可访问）
        if (typeof window !== 'undefined' && window.ScratchBlocks && window.ScratchBlocks.Workspace) {
            try {
                const workspaces = window.ScratchBlocks.Workspace.getAll();
                workspaces.forEach(workspace => {
                    const toolbox = workspace.getToolbox();
                    if (toolbox && toolbox.removeCategory) {
                        toolbox.removeCategory(extensionId);
                    }
                });
            } catch (e) {
                // 忽略错误，可能无法访问
                console.debug('Could not remove category from toolbox:', e);
            }
        }

        console.log('Extension unloaded:', extensionId);
    }

    /**
     * 加载扩展
     */
async function loadExtension(extensionCode) {
        if (!vm || !vm.extensionManager) {
            throw new Error('VM or extensionManager not available');
        }

        const dataURL = `data:application/javascript,${encodeURIComponent(extensionCode)}`;

        // 清除 workerURLs 中的记录，确保可以重新加载
        for (const [workerId, url] of Object.entries(vm.extensionManager.workerURLs)) {
            if (url === dataURL) {
                delete vm.extensionManager.workerURLs[workerId];
                console.log('Removed dataURL from workerURLs:', workerId);
            }
        }

        console.log('=== Starting load process ===');

        // 记录加载前的所有扩展ID和serviceName
        const originalExtensionIds = new Set(
            Array.from(vm.extensionManager._loadedExtensions.keys())
        );
        const originalServiceNames = new Set(
            Array.from(vm.extensionManager._loadedExtensions.values())
        );

        console.log('Original extensions:', Array.from(originalExtensionIds));
        console.log('Original service names:', Array.from(originalServiceNames));

        // 第一步：加载扩展
        await vm.extensionManager.loadExtensionURL(dataURL);

        console.log('After load, extensions:', Array.from(vm.extensionManager._loadedExtensions.keys()));

        // 第二步：找出要删除的扩展ID
        let extensionId = null;

        // 方法1：查找新加载的扩展（通过比较extensionId）
        for (const [id, serviceName] of vm.extensionManager._loadedExtensions) {
            if (!originalExtensionIds.has(id)) {
                // 这是新加载的扩展
                extensionId = id;
                console.log('Found new extension by ID:', extensionId);
                break;
            }
        }

        // 方法2：如果没找到新扩展，说明是重新加载已存在的扩展，通过比较serviceName找出
        if (!extensionId) {
            for (const [id, serviceName] of vm.extensionManager._loadedExtensions) {
                if (!originalServiceNames.has(serviceName)) {
                    // 这是被重新加载的扩展
                    extensionId = id;
                    console.log('Found reloaded extension by serviceName:', extensionId);
                    break;
                }
            }
        }

        if (!extensionId) {
            throw new Error('Could not determine extension ID');
        }

        console.log('Extension to delete:', extensionId);

        // 第三步：删除该扩展（不检测积木使用情况）
        console.log('Unloading extension:', extensionId);
        unloadExtension(extensionId);

        // 第四步：重新加载扩展
        console.log('Reloading extension...');
        await vm.extensionManager.loadExtensionURL(dataURL);

        console.log('After reload, extensions:', Array.from(vm.extensionManager._loadedExtensions.keys()));

        // 第五步：刷新积木栏
        if (vm.emitWorkspaceUpdate) {
            vm.emitWorkspaceUpdate();
        }

        // 第六步：刷新工具箱选择
        if (typeof window !== 'undefined' && window.ScratchBlocks && window.ScratchBlocks.Workspace) {
            try {
                const workspaces = window.ScratchBlocks.Workspace.getAll();
                workspaces.forEach(workspace => {
                    if (workspace && workspace.toolbox_) {
                        const toolbox = workspace.toolbox_;
                        if (toolbox.refreshSelection) {
                            toolbox.refreshSelection();
                        }
                    }
                });
            } catch (e) {
                // 忽略错误
            }
        }

        console.log('=== Load completed successfully ===');
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