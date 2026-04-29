import {serializeEvent, reconstructEvent, shouldSyncEvent} from './event-serialization.js';

const pendingMoveEvents = new Map();
const pendingCreateEvents = new Map();
const MOVE_DEBOUNCE_MS = 50;
const CREATE_DELAY_MS = 150;

let isShuttingDown = false;

const recentlyCreatedProcedureBlocks = new Map();
const currentlyCreatingBlocks = new Set();

let procedureBlockCreationWindowStart = 0;
const PROCEDURE_WINDOW_DURATION = 5000;

const isInProcedureCreationWindow = function () {
    if (procedureBlockCreationWindowStart === 0) return false;
    const age = Date.now() - procedureBlockCreationWindowStart;
    if (age < PROCEDURE_WINDOW_DURATION) {
        return true;
    }
    procedureBlockCreationWindowStart = 0;
    window._procedureCreationWindowActive = false;
    return false;
};

const startProcedureCreationWindow = function () {
    if (procedureBlockCreationWindowStart === 0) {
        procedureBlockCreationWindowStart = Date.now();
        window._procedureCreationWindowActive = true;
    }
};

const isRecentlyCreatedProcedureBlock = function (blockId) {
    if (!blockId) return false;
    const timestamp = recentlyCreatedProcedureBlocks.get(blockId);
    if (!timestamp) return false;
    const age = Date.now() - timestamp;
    if (age < 5000) {
        return true;
    }
    recentlyCreatedProcedureBlocks.delete(blockId);
    return false;
};

const isCurrentlyCreatingBlock = function (blockId) {
    if (!blockId) return false;
    return currentlyCreatingBlocks.has(blockId);
};

const isCurrentlyCreatingProcedureBlock = function (blockId) {
    if (!blockId) return false;
    return isCurrentlyCreatingBlock(blockId);
};

const validateBlockEvent = function (event) {
    if (!event || typeof event !== 'object') {
        return false;
    }

    const validTypes = [
        'create', 'move', 'delete', 'change', 'ui', 'click',
        'selected', 'comment_create', 'comment_delete', 'comment_move',
        'comment_change', 'var_create', 'var_delete', 'var_rename'
    ];

    return !(!event.type || !validTypes.includes(event.type));
};

const applyCreateEventUI = (service, event, ScratchBlocks) => {
    if (!event.xml || !ScratchBlocks || !ScratchBlocks.Xml) return;

    const wasEnabled = ScratchBlocks.Events.isEnabled();
    ScratchBlocks.Events.disable();

    let block = null;
    let createdBlockId = null;
    
    let xml;
    if (typeof event.xml === 'string') {
        xml = ScratchBlocks.Xml.textToDom(`<xml>${event.xml}</xml>`);
        xml = xml ? xml.firstChild : null;
    } else {
        xml = event.xml;
    }
    
    if (!xml) return;
    
    const tempWorkspaceId = xml.getAttribute('id');
    if (tempWorkspaceId) {
        currentlyCreatingBlocks.add(tempWorkspaceId);
        createdBlockId = tempWorkspaceId;
    }

    block = ScratchBlocks.Xml.domToBlock(xml, service.workspace);
    
    if (block) {
        createdBlockId = block.id;
        currentlyCreatingBlocks.add(block.id);
    }

    const isProcedureBlock = block && (
        block.type === 'procedures_definition' ||
        block.type === 'procedures_prototype'
    );

    if (isProcedureBlock) {
        recentlyCreatedProcedureBlocks.set(block.id, Date.now());
        
        startProcedureCreationWindow();

        if (service.vm && service.vm.emitWorkspaceUpdate) {
            service.vm.emitWorkspaceUpdate();
        }

        if (service.workspace && service.workspace.toolbox_ && service.workspace.toolbox_.refreshSelection) {
            service.workspace.toolbox_.refreshSelection();
        }
    }
    if (createdBlockId) {
        setTimeout(() => {
            currentlyCreatingBlocks.delete(createdBlockId);
        }, 1000);
    }
    
    if (wasEnabled) ScratchBlocks.Events.enable();
};

const applyDeleteEventUI = (service, event, ScratchBlocks) => {
    const blockId = event.blockId || event.id;
    const block = service.workspace.getBlockById(blockId);

    if (!block) return;

    const isProcedureBlock = block.type === 'procedures_definition' ||
        block.type === 'procedures_prototype';

    const wasRecentlyCreated = isRecentlyCreatedProcedureBlock(blockId);

    if (isProcedureBlock && wasRecentlyCreated) {
        return;
    }

    const wasEnabled = ScratchBlocks.Events.isEnabled();
    ScratchBlocks.Events.disable();
    try {
        block.dispose(false, true);
    } finally {
        if (wasEnabled) ScratchBlocks.Events.enable();
    }
};

const applyMoveEventUI = (service, event, ScratchBlocks) => {
    const blockId = event.blockId || event.id;
    const block = service.workspace.getBlockById(blockId);

    if (!block) return;

    const wasEnabled = ScratchBlocks.Events.isEnabled();
    ScratchBlocks.Events.disable();

    try {
        if (block.getParent()) {
            block.unplug(false);
        }

        if (event.newCoordinate) {
            const newCoord = event.newCoordinate;
            const currentPos = block.getRelativeToSurfaceXY();
            block.moveBy(newCoord.x - currentPos.x, newCoord.y - currentPos.y);
        } else if (event.newParentId) {
            const parentBlock = service.workspace.getBlockById(event.newParentId);
            if (parentBlock) {
                const blockConnection = block.outputConnection || block.previousConnection;
                let parentConnection = null;

                if (event.newInputName) {
                    const input = parentBlock.getInput(event.newInputName);
                    if (input) parentConnection = input.connection;
                } else if (blockConnection && parentBlock.nextConnection) {
                    parentConnection = parentBlock.nextConnection;
                }

                if (parentConnection && blockConnection) {
                    parentConnection.connect(blockConnection);
                }
            }
        }
    } finally {
        if (wasEnabled) ScratchBlocks.Events.enable();
    }
};

const applyChangeEventUI = (service, event, ScratchBlocks) => {
    if (!event.blockId || !event.name || event.element !== 'field') return;

    const block = service.workspace.getBlockById(event.blockId);
    if (!block) return;

    const field = block.getField(event.name);
    if (!field) return;

    if ('newValue' in event) {
        const wasEnabled = ScratchBlocks.Events.isEnabled();
        ScratchBlocks.Events.disable();
        try {
            field.setValue(event.newValue);
        } finally {
            if (wasEnabled) ScratchBlocks.Events.enable();
        }
    }
};

const applyMutationChangeEventUI = (service, event, ScratchBlocks) => {
    if (!event.blockId) return;
    if (event.element !== 'mutation') return;

    const block = service.workspace.getBlockById(event.blockId);
    if (!block) return;

    if (typeof block.domToMutation !== 'function') return;

    if (typeof event.newValue !== 'undefined') {
        const wasEnabled = ScratchBlocks.Events.isEnabled();
        ScratchBlocks.Events.disable();

        const mutationXml = ScratchBlocks.Xml.textToDom(`<xml>${event.newValue}</xml>`);

        if (mutationXml && mutationXml.firstChild) {
            block.domToMutation(mutationXml.firstChild);

            if (block.rendered && block.initSvg && !block.isInsertionMarker()) {
                block.initSvg();
                block.render();
            }

            if (service.vm && service.vm.editingTarget && service.vm.editingTarget.blocks) {
                service.vm.editingTarget.blocks.populateProcedureCache();
            }

            if (service.workspace && service.workspace.toolbox_) {
                service.workspace.toolbox_.refreshSelection();
            }
        }
        if (wasEnabled) ScratchBlocks.Events.enable();
    }
};

const applyCommentCreateEventUI = (service, event, ScratchBlocks) => {
    if (!ScratchBlocks || !ScratchBlocks.Xml) return;

    const wasEnabled = ScratchBlocks.Events.isEnabled();
    ScratchBlocks.Events.disable();

    try {
        if (event.xml) {
            let xmlText;
            if (typeof event.xml === 'string') {
                xmlText = event.xml;
            } else if (ScratchBlocks.Xml.domToText) {
                xmlText = ScratchBlocks.Xml.domToText(event.xml);
            } else if (event.xml.outerHTML) {
                xmlText = event.xml.outerHTML;
            }

            if (xmlText) {
                const xml = ScratchBlocks.Xml.textToDom(`<xml>${xmlText}</xml>`);
                ScratchBlocks.Xml.domToWorkspace(xml, service.workspace);
                return;
            }
        }

        if (event.blockId) {
            const block = service.workspace.getBlockById(event.blockId);
            if (block && block.setCommentText) {
                const x = event.xy ? event.xy.x : 0;
                const y = event.xy ? event.xy.y : 0;
                block.setCommentText(event.text || '', event.commentId, x, y, event.minimized || false);
                if (block.comment && event.width && event.height) {
                    block.comment.setSize(event.width, event.height);
                }
            }
        } else if (ScratchBlocks.WorkspaceComment) {
            const comment = new ScratchBlocks.WorkspaceComment(
                service.workspace,
                event.text || '',
                event.height || 100,
                event.width || 200,
                event.minimized || false,
                event.commentId
            );
            if (event.xy) {
                comment.moveTo(event.xy.x, event.xy.y);
            }
        }
    } catch (e) {
        // Comment creation failed
    } finally {
        if (wasEnabled) ScratchBlocks.Events.enable();
    }
};

const applyCommentDeleteEventUI = (service, event, ScratchBlocks) => {
    const commentId = event.commentId;
    const comment = service.workspace.getCommentById(commentId);

    if (!comment) return;

    const wasEnabled = ScratchBlocks.Events.isEnabled();
    ScratchBlocks.Events.disable();
    try {
        comment.dispose(false, false);
    } catch (e) {
        // Comment deletion failed
    } finally {
        if (wasEnabled) ScratchBlocks.Events.enable();
    }
};

const applyCommentMoveEventUI = (service, event, ScratchBlocks) => {
    const commentId = event.commentId;
    const comment = service.workspace.getCommentById(commentId);

    if (!comment) return;

    const wasEnabled = ScratchBlocks.Events.isEnabled();
    ScratchBlocks.Events.disable();

    try {
        if (event.newCoordinate_) {
            comment.moveTo(event.newCoordinate_.x, event.newCoordinate_.y);
        } else if (event.newCoordinate) {
            const coord = typeof event.newCoordinate === 'string' ?
                event.newCoordinate.split(',').map(parseFloat) :
                [event.newCoordinate.x, event.newCoordinate.y];
            comment.moveTo(coord[0], coord[1]);
        }
    } catch (e) {
        // Comment move failed
    } finally {
        if (wasEnabled) ScratchBlocks.Events.enable();
    }
};

const applyCommentChangeEventUI = (service, event, ScratchBlocks) => {
    const commentId = event.commentId;
    const comment = service.workspace.getCommentById(commentId);

    if (!comment) return;

    const wasEnabled = ScratchBlocks.Events.isEnabled();
    ScratchBlocks.Events.disable();

    try {
        const newContents = event.newContents_ || event.newContents;
        if (newContents) {
            if (typeof newContents.minimized !== 'undefined' && comment.setMinimized) {
                comment.setMinimized(newContents.minimized);
            }
            if (newContents.width && newContents.height && comment.setSize) {
                comment.setSize(newContents.width, newContents.height);
            }
            if (newContents.text && comment.setText) {
                comment.setText(newContents.text);
            }
        }
    } catch (e) {
        // Comment change failed
    } finally {
        if (wasEnabled) ScratchBlocks.Events.enable();
    }
};

const applyBlockEvent = (service, event, targetForEvent, isCurrentlyEditingTarget, ScratchBlocks) => {
    const eventType = event.type;

    try {
        if (targetForEvent && targetForEvent.blocks && targetForEvent.blocks.blocklyListen) {
            targetForEvent.blocks.blocklyListen(event);
        }
    } catch (e) {
        // VM sync failed
    }

    if (isCurrentlyEditingTarget && service.workspace) {
        try {
            if (eventType === 'create') {
                applyCreateEventUI(service, event, ScratchBlocks);
            } else if (eventType === 'delete') {
                applyDeleteEventUI(service, event, ScratchBlocks);
            } else if (eventType === 'move') {
                applyMoveEventUI(service, event, ScratchBlocks);
            } else if (eventType === 'change') {
                if (event.element === 'mutation') {
                    applyMutationChangeEventUI(service, event, ScratchBlocks);
                } else {
                    applyChangeEventUI(service, event, ScratchBlocks);
                }
            } else if (eventType === 'comment_create') {
                applyCommentCreateEventUI(service, event, ScratchBlocks);
            } else if (eventType === 'comment_delete') {
                applyCommentDeleteEventUI(service, event, ScratchBlocks);
            } else if (eventType === 'comment_move') {
                applyCommentMoveEventUI(service, event, ScratchBlocks);
            } else if (eventType === 'comment_change') {
                applyCommentChangeEventUI(service, event, ScratchBlocks);
            } else if (eventType === 'var_create' || eventType === 'var_delete' || eventType === 'var_rename') {
                if (event.run && typeof event.run === 'function') {
                    if (eventType === 'var_delete') {
                        const variable = service.workspace.getVariableById(event.varId);
                        if (variable) {
                            const uses = service.workspace.variableMap_.getVariableUsesById(event.varId);
                            if (uses && uses.length > 0) {
                                service.workspace.deleteVariableInternal_(variable, uses);
                            } else {
                                service.workspace.variableMap_.deleteVariable(variable);
                            }
                        }
                    } else {
                        event.run(true);
                    }
                }
            } else if (ScratchBlocks && ScratchBlocks.Events && ScratchBlocks.Events.fire &&
                event.element !== 'mutation') {
                const wasEnabled = ScratchBlocks.Events.isEnabled();
                ScratchBlocks.Events.disable();
                event._syncOriginated = true;
                ScratchBlocks.Events.fire(event);
                if (wasEnabled) ScratchBlocks.Events.enable();
            }
        } catch (e) {
            // ignore
        }
    }
};

const relayToClients = (service, payload, sourceConn) => {
    const relayPayload = {
        type: 'block-event',
        payload: {
            ...payload,
            sender: payload.sender || payload.eventOrigin,
            eventOrigin: payload.eventOrigin || payload.sender
        },
        sender: payload.sender || payload.eventOrigin,
        timestamp: Date.now()
    };

    service.connections.forEach(connection => {
        if (connection !== sourceConn && connection.open && connection.peer !== payload.sender) {
            connection.send(relayPayload);
        }
    });
};

const flushPendingCreate = (service, blockId) => {
    const pending = pendingCreateEvents.get(blockId);
    if (!pending) return;

    pendingCreateEvents.delete(blockId);

    if (service.workspace && !service.workspace.getBlockById(blockId)) {
        const pendingMove = pendingMoveEvents.get(blockId);
        if (pendingMove) {
            clearTimeout(pendingMove.timer);
            pendingMoveEvents.delete(blockId);
        }
        return;
    }

    const eventOrigin = service.peer && service.peer.id ? service.peer.id : 'local';
    const randomPart = Math.random()
        .toString(36)
        .slice(2, 8);
    const eid = `${eventOrigin}-${Date.now()}-${randomPart}`;

    service.sendMessage('block-event', {
        event: pending.serialized,
        targetName: pending.targetName,
        eventId: eid,
        eventOrigin: eventOrigin,
        timestamp: Date.now()
    });

    const pendingMove = pendingMoveEvents.get(blockId);
    if (pendingMove) {
        clearTimeout(pendingMove.timer);
        pendingMoveEvents.delete(blockId);

        const moveRandomPart = Math.random()
            .toString(36)
            .slice(2, 8);
        const moveEid = `${eventOrigin}-${Date.now()}-${moveRandomPart}`;
        service.sendMessage('block-event', {
            event: pendingMove.serialized,
            targetName: pending.targetName,
            eventId: moveEid,
            eventOrigin: eventOrigin,
            timestamp: Date.now()
        });
    }
};

const collaborationBlockListener = (service, event) => {
    if (isShuttingDown) return;

    if (!service.isConnected || service.isApplyingRemoteChange) {
        return;
    }
    if (service.isSyncOperation || service.isLoadingProject || service.isSwitchingTarget || event._syncOriginated) {
        return;
    }
    if (!validateBlockEvent(event)) {
        return;
    }

    if (!shouldSyncEvent(service, event)) return;

    const blockIdToCheck = event.blockId || event.id;

    if (isInProcedureCreationWindow() && !event._syncOriginated) {
        let isProcedureBlockEvent = false;
        if (blockIdToCheck) {
            const block = service.workspace.getBlockById(blockIdToCheck);
            if (block && (
                block.type === 'procedures_definition' ||
                block.type === 'procedures_prototype'
            )) {
                isProcedureBlockEvent = true;
            }
        }

        if (!isProcedureBlockEvent && event.xml && typeof event.xml === 'string' && (
            event.xml.includes('procedures_definition') ||
            event.xml.includes('procedures_prototype')
        )) {
            isProcedureBlockEvent = true;
        }

        if (isProcedureBlockEvent && isCurrentlyCreatingProcedureBlock(blockIdToCheck)) {
            return;
        }

        if (isProcedureBlockEvent) {
            return;
        }
    }

    const blockId = event.blockId || event.id;
    const eventOrigin = service.peer && service.peer.id ? service.peer.id : 'local';
    const localTarget = service.vm && service.vm.editingTarget ? service.vm.editingTarget : null;
    const targetName = localTarget ? localTarget.getName() : null;
    const serializedEvent = serializeEvent(service, event);

    if (event.type === 'create') {
        pendingCreateEvents.set(blockId, {
            event: event,
            serialized: serializedEvent,
            targetName: targetName,
            timer: setTimeout(() => {
                if (!isShuttingDown) {
                    flushPendingCreate(service, blockId);
                }
            }, CREATE_DELAY_MS)
        });
        return;
    }

    if (event.type === 'move') {
        if (pendingCreateEvents.has(blockId)) {
            const existingMove = pendingMoveEvents.get(blockId);
            if (existingMove && existingMove.timer) {
                clearTimeout(existingMove.timer);
            }
            pendingMoveEvents.set(blockId, {
                event: event,
                serialized: serializedEvent,
                timer: null
            });
            return;
        }

        const existingMove = pendingMoveEvents.get(blockId);
        if (existingMove && existingMove.timer) {
            clearTimeout(existingMove.timer);
        }

        pendingMoveEvents.set(blockId, {
            event: event,
            serialized: serializedEvent,
            timer: setTimeout(() => {
                if (isShuttingDown) return;
                const pendingMv = pendingMoveEvents.get(blockId);
                if (!pendingMv) return;
                pendingMoveEvents.delete(blockId);

                try {
                    const rndPart = Math.random()
                        .toString(36)
                        .slice(2, 8);
                    const eid = `${eventOrigin}-${Date.now()}-${rndPart}`;

                    service.sendMessage('block-event', {
                        event: pendingMv.serialized,
                        targetName: targetName,
                        eventId: eid,
                        eventOrigin: eventOrigin,
                        timestamp: Date.now()
                    });
                } catch (e) {
                    // Send error
                }
            }, MOVE_DEBOUNCE_MS)
        });
        return;
    }

    if (event.type === 'delete') {
        const pendingCr = pendingCreateEvents.get(blockId);
        if (pendingCr) {
            clearTimeout(pendingCr.timer);
            pendingCreateEvents.delete(blockId);
            const pendingMv = pendingMoveEvents.get(blockId);
            if (pendingMv && pendingMv.timer) {
                clearTimeout(pendingMv.timer);
            }
            pendingMoveEvents.delete(blockId);
            return;
        }
    }

    if (pendingCreateEvents.has(blockId)) {
        flushPendingCreate(service, blockId);
    }

    try {
        const randomPart = Math.random()
            .toString(36)
            .slice(2, 8);
        const eid = `${eventOrigin}-${Date.now()}-${randomPart}`;

        service.sendMessage('block-event', {
            event: serializedEvent,
            targetName: targetName,
            eventId: eid,
            eventOrigin: eventOrigin,
            timestamp: Date.now()
        });
    } catch (e) {
        // Send error
    }
};

const handleBlockEvent = (service, payload, conn, isRetry = false) => {
    if (isShuttingDown) return;

    if (!payload || typeof payload !== 'object') {
        if (payload && payload._messageId) {
            try {
                service.sendMessage('message-ack', {
                    messageId: payload._messageId,
                    success: false,
                    error: 'Invalid payload structure'
                }, conn);
            } catch (e) {
                // Ignore
            }
        }
        return;
    }

    if (payload.eventId && service.seenEventIds.has(payload.eventId)) return;

    const eventOrigin = payload.eventOrigin || payload.sender;
    if (eventOrigin === service.peer.id || payload.sender === service.peer.id) return;
    if (!service.vm || !payload.event) return;

    if (payload.eventId) {
        service.seenEventIds.add(payload.eventId);
        if (service.seenEventTimestamps) {
            service.seenEventTimestamps.set(payload.eventId, Date.now());
        }
    }

    service.isApplyingRemoteChange = true;

    try {
        const reconstructedEvent = reconstructEvent(service, payload.event);
        if (reconstructedEvent === null) {
            if (isRetry) {
                service.isApplyingRemoteChange = false;
                return;
            }
            service.queuePendingEvent(payload);
            service.isApplyingRemoteChange = false;
            return;
        }

        if (!validateBlockEvent(reconstructedEvent)) {
            service.isApplyingRemoteChange = false;
            return;
        }

        reconstructedEvent._syncOriginated = true;
        reconstructedEvent._eventOrigin = eventOrigin;

        if (!service.vm.blockListener) {
            service.isApplyingRemoteChange = false;
            return;
        }

        let targetForEvent = null;
        if (payload.targetName) {
            targetForEvent = service.vm.runtime.targets.find(t => t.getName() === payload.targetName);
        }
        if (!targetForEvent && payload.targetId) {
            targetForEvent = service.vm.runtime.getTargetById(payload.targetId);

            if (!targetForEvent && !service.isHost && service.targetMapping &&
                service.targetMapping[payload.targetId]) {
                targetForEvent = service.vm.runtime.getTargetById(
                    service.targetMapping[payload.targetId]
                );
            }
        }
        if (!targetForEvent && reconstructedEvent.targetName) {
            targetForEvent = service.vm.runtime.targets.find(
                t => t.getName() === reconstructedEvent.targetName
            );
        }

        if (!targetForEvent) {
            if (!isRetry) {
                service.queuePendingEvent(payload);
            }
            service.isApplyingRemoteChange = false;
            return;
        }

        const isCurrentlyEditingTarget = targetForEvent === service.vm.editingTarget;
        const ScratchBlocks = window.ScratchBlocks;

        applyBlockEvent(service, reconstructedEvent, targetForEvent, isCurrentlyEditingTarget, ScratchBlocks);

        if (reconstructedEvent.type === 'create' && service.pendingEvents.length > 0) {
            requestAnimationFrame(() => service.processPendingEvents());
        }

    } catch (e) {
        // Handle error
    } finally {
        setTimeout(() => {
            service.isApplyingRemoteChange = false;
        }, 50);
    }

    if (service.isHost && payload.sender !== service.peer.id) {
        relayToClients(service, payload, conn);
    }
};

const clearPendingEventTimers = () => {
    isShuttingDown = true;

    for (const [, pending] of pendingMoveEvents) {
        if (pending.timer) {
            clearTimeout(pending.timer);
        }
    }
    pendingMoveEvents.clear();

    for (const [, pending] of pendingCreateEvents) {
        if (pending.timer) {
            clearTimeout(pending.timer);
        }
    }
    pendingCreateEvents.clear();

    recentlyCreatedProcedureBlocks.clear();
    currentlyCreatingBlocks.clear();
    procedureBlockCreationWindowStart = 0;
    window._procedureCreationWindowActive = false;
};

const resetBlockEventsState = () => {
    isShuttingDown = false;
};

export {
    collaborationBlockListener,
    handleBlockEvent,
    clearPendingEventTimers,
    resetBlockEventsState
};
