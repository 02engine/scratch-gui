import cursorIcon from '../assets/icon--cursor.svg';

const setupCursorLayer = service => {
    if (!service.workspace) return;
    const svg = service.workspace.getParentSvg && service.workspace.getParentSvg();
    if (!svg) return;
    const container = svg.parentNode;
    if (!container) return;
    const layer = document.createElement('div');
    layer.style.position = 'absolute';
    layer.style.left = '0';
    layer.style.top = '0';
    layer.style.right = '0';
    layer.style.bottom = '0';
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = '999';
    container.style.position = container.style.position || 'relative';
    container.appendChild(layer);
    service.cursorLayer = layer;

    const chatInput = document.createElement('input');
    chatInput.type = 'text';
    chatInput.className = 'collaboration-chat-input';
    chatInput.placeholder = 'Say something... (max 500 chars)';
    chatInput.maxLength = 500;
    chatInput.style.position = 'absolute';
    chatInput.style.display = 'none';
    chatInput.style.zIndex = '1000';
    chatInput.style.padding = '8px 12px';
    chatInput.style.borderRadius = '20px';
    chatInput.style.border = '1px solid var(--ui-modal-overlay)';
    chatInput.style.background = 'var(--ui-white, white)';
    chatInput.style.color = 'var(--text-primary, #575E75)';
    chatInput.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    chatInput.style.fontFamily = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    chatInput.style.fontSize = '13px';
    chatInput.style.outline = 'none';
    chatInput.style.minWidth = '120px';
    chatInput.style.transform = 'translate(15px, -15px)';

    chatInput.addEventListener('mousedown', e => e.stopPropagation());

    chatInput.addEventListener('input', e => {
        if (e.target.value.length > 500) {
            e.target.value = e.target.value.substring(0, 500);
        }
        service.sendMessage('cursor-chat', {text: e.target.value});

    });

    chatInput.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') {
            chatInput.blur();
        }
    });

    chatInput.addEventListener('blur', () => {
        chatInput.style.display = 'none';
        chatInput.value = '';
        service.isChatting = false;
        service.sendMessage('cursor-chat', {text: null});
    });

    layer.appendChild(chatInput);
    service.localChatInput = chatInput;
};

const destroyCursorLayer = service => {
    if (service.cursorLayer && service.cursorLayer.parentNode) {
        service.cursorLayer.parentNode.removeChild(service.cursorLayer);
    }
    service.cursorLayer = null;
    service.remoteCursors.forEach(el => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    service.remoteCursors.clear();
};

const bindCursorEvents = service => {
    if (!service.workspace) return;
    const svg = service.workspace.getParentSvg && service.workspace.getParentSvg();
    if (!svg) return;
    const container = svg.parentNode;
    if (!container) return;
    service._onMouseMove = e => {
        const rect = container.getBoundingClientRect();
        const x = (e.clientX - rect.left);
        const y = (e.clientY - rect.top);
        if (!service.workspace) return;
        const metrics = service.workspace.getMetrics && service.workspace.getMetrics();
        const scale = service.workspace.scale || 1;
        const wX = metrics ? (metrics.viewLeft + x) / scale : x;
        const wY = metrics ? (metrics.viewTop + y) / scale : y;

        service._lastCursorOverlay = {x, y};

        const localTarget = service.vm && service.vm.editingTarget ? service.vm.editingTarget : null;
        const targetName = localTarget ? localTarget.getName() : null;
        const isStage = localTarget ? localTarget.isStage : false;

        service.sendMessage('cursor-move', {x: wX, y: wY, targetName, isStage});

        if (service.isChatting && service.localChatInput) {
            service.localChatInput.style.left = `${x}px`;
            service.localChatInput.style.top = `${y}px`;
        }
    };
    service._onMouseLeave = () => {
        service.sendMessage('cursor-leave', {});
    };
    container.addEventListener('mousemove', service._onMouseMove);
    container.addEventListener('mouseleave', service._onMouseLeave);

    service._onKeyDown = e => {
        if (e.key === '/' && !service.isChatting) {
            const activeTag = document.activeElement ? document.activeElement.tagName : '';
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement.isContentEditable) {
                return;
            }

            e.preventDefault();
            service.isChatting = true;

            if (service.localChatInput && service._lastCursorOverlay) {
                const {x, y} = service._lastCursorOverlay;

                service.localChatInput.style.left = `${x}px`;
                service.localChatInput.style.top = `${y}px`;
                service.localChatInput.style.display = 'block';
                service.localChatInput.focus();
            }
        }
    };
    window.addEventListener('keydown', service._onKeyDown);
};

const unbindCursorEvents = service => {
    if (!service.workspace) return;
    const svg = service.workspace.getParentSvg && service.workspace.getParentSvg();
    if (!svg) return;
    const container = svg.parentNode;
    if (!container) return;
    if (service._onMouseMove) container.removeEventListener('mousemove', service._onMouseMove);
    if (service._onMouseLeave) container.removeEventListener('mouseleave', service._onMouseLeave);
    if (service._onKeyDown) window.removeEventListener('keydown', service._onKeyDown);
    service._onMouseMove = null;
    service._onMouseLeave = null;
    service._onKeyDown = null;
};

const handleCursorMove = (service, payload, conn) => {
    if (!service.cursorLayer || !service.workspace) {
        return;
    }

    const id = payload.sender;
    if (!id) return;
    let el = service.remoteCursors.get(id);
    if (!el) {
        el = document.createElement('div');
        el.className = 'collaboration-remote-cursor';
        el.style.position = 'absolute';
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.transform = 'translate(0, 0)';
        el.style.pointerEvents = 'none';

        const cursorImg = document.createElement('img');
        cursorImg.src = cursorIcon;
        cursorImg.className = 'collaboration-cursor-icon';
        cursorImg.style.width = '24px';
        cursorImg.style.height = '24px';
        cursorImg.style.filter = 'brightness(0) invert(1) drop-shadow(0 1px 2px rgba(0,0,0,0.4))';
        cursorImg.draggable = false;
        el.appendChild(cursorImg);

        const label = document.createElement('div');
        label.className = 'collaboration-cursor-label';
        label.style.position = 'absolute';
        label.style.top = '26px';
        label.style.left = '0';
        label.style.padding = '3px 7px';
        label.style.background = 'var(--looks-secondary)';
        label.style.color = 'var(--ui-white, white)';
        label.style.fontSize = '11px';
        label.style.fontWeight = '600';
        label.style.borderRadius = '4px';
        label.style.whiteSpace = 'nowrap';
        label.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        el.appendChild(label);

        const chat = document.createElement('div');
        chat.className = 'collaboration-cursor-chat';
        chat.style.position = 'absolute';
        chat.style.bottom = '100%';
        chat.style.left = '10px';
        chat.style.marginBottom = '8px';
        chat.style.padding = '8px 12px';
        chat.style.borderRadius = '16px';
        chat.style.borderBottomLeftRadius = '4px';
        chat.style.background = 'var(--ui-white, white)';
        chat.style.color = 'var(--text-primary, #575E75)';
        chat.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        chat.style.fontSize = '13px';
        chat.style.whiteSpace = 'normal';
        chat.style.wordWrap = 'break-word';
        chat.style.wordBreak = 'break-word';
        chat.style.display = 'none';
        chat.style.maxWidth = '400px';
        chat.style.minWidth = '200px';
        chat.style.overflow = 'hidden';
        chat.style.maxHeight = 'none';
        el.appendChild(chat);

        service.cursorLayer.appendChild(el);
        service.remoteCursors.set(id, el);
    }
    const metrics = service.workspace.getMetrics && service.workspace.getMetrics();
    const scale = service.workspace.scale || 1;

    const currentTarget = service.vm && service.vm.editingTarget ? service.vm.editingTarget : null;
    const currentTargetName = currentTarget ? currentTarget.getName() : null;

    const remoteTargetName = payload.targetName;
    const remoteIsStage = payload.isStage || false;

    if (remoteTargetName && currentTargetName && remoteTargetName !== currentTargetName) {
        el.style.display = 'none';
    } else {
        const x = (payload.x * scale) - (metrics ? metrics.viewLeft : 0);
        const y = (payload.y * scale) - (metrics ? metrics.viewTop : 0);
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.display = 'block';
    }

    service.remoteCursorPositions.set(id, {
        x: payload.x,
        y: payload.y,
        targetName: remoteTargetName,
        isStage: remoteIsStage
    });
    const labelEl = el.children[1];
    const user = service.users.get(id);
    const name = user && user.username ? user.username : '';
    if (labelEl) labelEl.textContent = name;

    if (service.isHost && payload.sender !== service.peer.id) {
        service.connections.forEach(connection => {
            if (connection !== conn && connection.open) {
                connection.send({type: 'cursor-move', payload, sender: payload.sender, timestamp: Date.now()});
            }
        });
    }
};

const handleCursorLeave = (service, payload, conn) => {
    if (!service.cursorLayer) return;
    const id = payload.sender;
    if (!id) return;
    const el = service.remoteCursors.get(id);
    if (el) el.style.display = 'none';
    service.remoteCursorPositions.delete(id);
    if (service.isHost && payload.sender !== service.peer.id) {
        service.connections.forEach(connection => {
            if (connection !== conn && connection.open) {
                connection.send({type: 'cursor-leave', payload, sender: payload.sender, timestamp: Date.now()});
            }
        });
    }
};

const handleCursorChat = (service, payload, conn) => {
    if (!service.cursorLayer) return;
    const id = payload.sender;
    if (!id) return;
    const el = service.remoteCursors.get(id);
    if (!el) return;

    const chat = el.children[2];
    if (chat) {
        if (payload.text) {
            chat.textContent = payload.text;
            chat.style.display = 'block';
        } else {
            chat.style.display = 'none';
        }
    }

    if (service.isHost && payload.sender !== service.peer.id) {
        service.connections.forEach(connection => {
            if (connection !== conn && connection.open) {
                connection.send({
                    type: 'cursor-chat',
                    payload,
                    sender: payload.sender,
                    timestamp: Date.now()
                });
            }
        });
    }
};

const updateAllRemoteCursorPositions = service => {
    if (!service.workspace || !service.cursorLayer) return;
    const metrics = service.workspace.getMetrics && service.workspace.getMetrics();
    const scale = service.workspace.scale || 1;

    const currentTarget = service.vm && service.vm.editingTarget ? service.vm.editingTarget : null;
    const currentTargetName = currentTarget ? currentTarget.getName() : null;

    service.remoteCursors.forEach((el, id) => {
        const pos = service.remoteCursorPositions.get(id);
        if (!pos) return;

        const remoteTargetName = pos.targetName;

        if (remoteTargetName && currentTargetName && remoteTargetName !== currentTargetName) {
            el.style.display = 'none';
            return;
        }

        const x = (pos.x * scale) - (metrics ? metrics.viewLeft : 0);
        const y = (pos.y * scale) - (metrics ? metrics.viewTop : 0);
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.display = 'block';
    });
};

const bindViewportSyncListeners = service => {
    if (!service.workspace) return;
    const svg = service.workspace.getParentSvg && service.workspace.getParentSvg();
    if (!svg) return;
    const container = svg.parentNode;
    if (!container) return;

    const sendLocalCursorPosition = () => {
        if (!service._lastCursorOverlay || !service.workspace) return;
        const metrics = service.workspace.getMetrics();
        const scale = service.workspace.scale || 1;
        const {x, y} = service._lastCursorOverlay;
        const wX = metrics ? (metrics.viewLeft + x) / scale : x;
        const wY = metrics ? (metrics.viewTop + y) / scale : y;

        const localTarget = service.vm && service.vm.editingTarget ? service.vm.editingTarget : null;
        const targetName = localTarget ? localTarget.getName() : null;
        const isStage = localTarget ? localTarget.isStage : false;

        service.sendMessage('cursor-move', {x: wX, y: wY, targetName, isStage});
    };

    service._onViewportWheel = () => {
        updateAllRemoteCursorPositions(service);
        sendLocalCursorPosition();
    };
    service._onWorkspaceChangeForCursor = () => {
        updateAllRemoteCursorPositions(service);
        sendLocalCursorPosition();
    };
    container.addEventListener('wheel', service._onViewportWheel, {passive: true});
    service.workspace.addChangeListener(service._onWorkspaceChangeForCursor);
};

const unbindViewportSyncListeners = service => {
    if (!service.workspace) return;
    const svg = service.workspace.getParentSvg && service.workspace.getParentSvg();
    if (!svg) return;
    const container = svg.parentNode;
    if (!container) return;
    if (service._onViewportWheel) container.removeEventListener('wheel', service._onViewportWheel);
    if (service._onWorkspaceChangeForCursor) {
        service.workspace.removeChangeListener(service._onWorkspaceChangeForCursor);
    }
    service._onViewportWheel = null;
    service._onWorkspaceChangeForCursor = null;
};

export {
    setupCursorLayer,
    destroyCursorLayer,
    bindCursorEvents,
    unbindCursorEvents,
    handleCursorMove,
    handleCursorLeave,
    updateAllRemoteCursorPositions,
    handleCursorChat,
    bindViewportSyncListeners,
    unbindViewportSyncListeners
};
