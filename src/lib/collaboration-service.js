import {
    serializeEvent as serializeEventExternal,
    reconstructEvent as reconstructEventExternal,
    shouldSyncEvent as shouldSyncEventExternal
} from './collaboration/event-serialization.js';
import {
    collaborationBlockListener as collaborationBlockListenerImpl,
    handleBlockEvent as handleBlockEventImpl,
    clearPendingEventTimers as clearPendingEventTimersImpl
} from './collaboration/block-events.js';
import {
    attachToWorkspace as attachToWorkspaceExternal,
    detachFromWorkspace as detachFromWorkspaceExternal,
    attemptWorkspaceAttachment as attemptWorkspaceAttachmentExternal
} from './collaboration/ui-manager.js';
import {
    sendMessage as sendMessageExternal,
    handleConnection as handleConnectionExternal,
    handleMessage as handleMessageExternal
} from './collaboration/connection-manager.js';
import {
    wrapVMAssetMethods as wrapVMAssetMethodsExternal,
    handleAssetEvent as handleAssetEventExternal
} from './collaboration/asset-events.js';
import {
    sendProjectSync as sendProjectSyncExternal,
    handleProjectSyncStart as handleProjectSyncStartExternal,
    handleProjectSyncChunk as handleProjectSyncChunkExternal,
    handleProjectStreamEnd as handleProjectStreamEndExternal,
    debugTargetStates as debugTargetStatesExternal
} from './collaboration/sync-manager.js';
import {
    getTargetIdForMessage,
    getLocalTargetId as _getLocalTargetId
} from './collaboration/target-id-utils.js';
import {
    connectToRoom as connectToRoomExternal,
    setupHost as setupHostExternal,
    connectToHost as connectToHostExternal,
    approveJoinRequest as approveJoinRequestExternal,
    denyJoinRequest as denyJoinRequestExternal,
    cancelJoinRequest as cancelJoinRequestExternal,
    handleJoinRequest as handleJoinRequestExternal,
    handleJoinApproved as handleJoinApprovedExternal,
    handleJoinDenied as handleJoinDeniedExternal,
    handleJoinCancelled as handleJoinCancelledExternal,
    handleRoomPrivacy as handleRoomPrivacyExternal,
    getPendingJoinRequests as getPendingJoinRequestsExternal,
    getRoomPrivacy as getRoomPrivacyExternal,
    changeRoomPrivacy as changeRoomPrivacyExternal,
    handleUserJoin as handleUserJoinExternal
} from './collaboration/room-manager.js';
import {
    setupCursorLayer as setupCursorLayerExternal,
    destroyCursorLayer as destroyCursorLayerExternal,
    bindCursorEvents as bindCursorEventsExternal,
    unbindCursorEvents as unbindCursorEventsExternal,
    handleCursorMove as handleCursorMoveExternal,
    handleCursorLeave as handleCursorLeaveExternal,
    updateAllRemoteCursorPositions as updateAllRemoteCursorPositionsExternal,
    handleCursorChat as handleCursorChatExternal,
    bindViewportSyncListeners as bindViewportSyncListenersExternal,
    unbindViewportSyncListeners as unbindViewportSyncListenersExternal
} from './collaboration/cursor-sync.js';
import {APPNAME} from './brand.js';

let collaborationServiceInstance = null;

class CollaborationService {
    constructor () {
        this.peer = null;
        this.connections = new Map();
        this.isHost = false;
        this.roomId = null;
        this.username = null;
        this.isConnected = false;
        this.isConnectedToHost = false;
        this.users = new Map();
        this.hostId = null;
        this.vm = null;
        this.eventListeners = new Map();
        this.isApplyingRemoteChange = false;
        this.wasKicked = false;
        this.pendingEvents = [];
        this.retryTimer = null;
        this.currentConnectionFailureHandler = null;
        this.targetMapping = {};
        this.lastSyncTime = 0;
        this.isSyncOperation = false;
        this.isSwitchingTarget = false;
        this.roomPrivacy = 'public';
        this.pendingJoinRequests = new Map();
        this.isDisconnecting = false;
        this.connectionTimeout = null;
        this.seenEventIds = new Set();
        this.seenEventTimestamps = new Map();
        this.remoteCursors = new Map();
        this.cursorLayer = null;
        this.remoteCursorPositions = new Map();
        this._lastCursorOverlay = null;
        this._currentSyncSequence = 0;
        this._lastReceivedSyncSequence = -1;
        this.userEditingTargets = new Map();
        this._activeSyncDirection = null;
        this._syncRequestedOnApproval = false;
        this._syncRequestTimer = null;
        this._syncRequestCooldown = 2000;
        this._suppressionClearTimer = null;
        this._lastHostSyncRequestHandledAt = 0;
        this._hostSyncRequestCooldownMs = 1000;
        this._state = 'IDLE';
        this._cleanupInterval = setInterval(() => {
            if (this.seenEventIds.size > 100) {
                const now = Date.now();
                const eventsToRemove = [];
                this.seenEventTimestamps.forEach((timestamp, eventId) => {
                    if (now - timestamp > 30000) {
                        eventsToRemove.push(eventId);
                    }
                });
                if (eventsToRemove.length > 0) {
                    eventsToRemove.forEach(eventId => {
                        this.seenEventIds.delete(eventId);
                        this.seenEventTimestamps.delete(eventId);
                    });
                }
            }
        }, 30000);

        this.peerConfig = {
            host: 'peer.deepsealab.dpdns.org',
            port: 443,
            path: '/',
            secure: true,
            config: {
                iceServers: [
                    {urls: 'stun:vpn.mikedev101.cc:5349'},
                    {urls: 'turn:vpn.mikedev101.cc:5349', username: 'free', credential: 'free'},
                    {urls: 'stun:stun.l.google.com:19302'},
                    {urls: 'stun:freeturn.net:3478'},
                    {urls: 'stun:freeturn.net:5349'},
                    {urls: 'turn:freeturn.net:3478', username: 'free', credential: 'free'},
                    {urls: 'turns:freeturn.net:5349', username: 'free', credential: 'free'}
                ],
                iceCandidatePoolSize: 10,
                iceTransportPolicy: 'all'
            },
            debug: 2
        };


        this.messageHandlers = {
            'user-join': this.handleUserJoin.bind(this),
            'user-leave': this.handleUserLeave.bind(this),
            'users-list': this.handleUsersList.bind(this),
            'username-change': this.handleUsernameChange.bind(this),
            'kick-user': this.handleKickUser.bind(this),
            'sync-request': this.handleSyncRequest.bind(this),
            'project-sync-start': this.handleProjectSyncStart.bind(this),
            'project-sync-chunk': this.handleProjectSyncChunk.bind(this),
            'project-stream-start': this.handleProjectStreamStart.bind(this),
            'project-stream-data': this.handleProjectStreamData.bind(this),
            'project-stream-end': this.handleProjectStreamEnd.bind(this),
            'targets-update': this.handleTargetsUpdate.bind(this),
            'block-event': (payload, conn) => handleBlockEventImpl(this, payload, conn),
            'asset-event': this.handleAssetEvent.bind(this),
            'cursor-move': this.handleCursorMove.bind(this),
            'cursor-leave': this.handleCursorLeave.bind(this),
            'join-request': this.handleJoinRequest.bind(this),
            'join-approved': this.handleJoinApproved.bind(this),
            'join-denied': this.handleJoinDenied.bind(this),
            'join-cancelled': this.handleJoinCancelled.bind(this),
            'room-privacy': this.handleRoomPrivacy.bind(this),
            'target-switch': this.handleTargetSwitch.bind(this),
            'target-created': this.handleTargetCreated.bind(this),
            'target-deleted': this.handleTargetDeleted.bind(this),
            'stage-costume-change': this.handleStageCostumeChange.bind(this),
            'costume-change': this.handleCostumeChange.bind(this),
            'extension-load': this.handleExtensionLoad.bind(this),
            'client-sync-complete': this.handleClientSyncComplete.bind(this),
            'session-ready': this.handleSessionReady.bind(this),
            'cursor-chat': this.handleCursorChat.bind(this),
            'host-loading-start': this.handleHostLoadingStart.bind(this),
            'host-loading-progress': this.handleHostLoadingProgress.bind(this),
            'host-loading-complete': this.handleHostLoadingComplete.bind(this),
            'sprite-info-changed': this.handleSpriteInfoChanged.bind(this)
        };
    }

    getState () {
        return this._state;
    }

    _setState (newState) {
        this._state = newState;
    }

    _isShuttingDown () {
        return this.isDisconnecting || this._state === 'DISCONNECTING';
    }

    handleHostLoadingStart () {
        if (this.isHost) return;
        this.emit('host-loading-start');
    }

    handleHostLoadingProgress (payload) {
        if (this.isHost) return;
        this.emit('host-loading-progress', {progress: payload.progress});
    }

    handleHostLoadingComplete () {
        if (this.isHost) return;
        this.emit('host-loading-complete');
    }

    requestProjectSync (reason = 'unspecified') {
        if (!this.isConnected || this.isHost) return;
        if (!this.hostId) return;
        if (this._activeSyncDirection !== null) return;

        if (this._syncRequestTimer) {
            clearTimeout(this._syncRequestTimer);
        }

        this._syncRequestTimer = setTimeout(() => {
            this._syncRequestTimer = null;
            this.sendMessage('sync-request', {
                reason,
                lastKnownSequence: this._lastReceivedSyncSequence
            }, this.hostId);
        }, this._syncRequestCooldown);
    }

    shouldSuppressEvents () {
        return this.isSyncOperation || this.isApplyingRemoteChange || this.isLoadingProject || this.isSwitchingTarget;
    }

    init (vm) {
        this.vm = vm;
        this.collaborationBlockListener = this.collaborationBlockListener.bind(this);

        if (this.vm) {
            this.vm.on('workspaceUpdate', this.onWorkspaceUpdate.bind(this));
            this.vm.on('PROJECT_CHANGED', this.onProjectChanged.bind(this));

            if (this.vm.runtime) {
                this.vm.runtime.on('TARGETS_UPDATE', this.onTargetsUpdate.bind(this));
                this.vm.runtime.on('SPRITE_INFO_CHANGED', (target, changedProps) => {
                    this.spriteInfoChanged(target, changedProps);
                });
                this.vm.runtime.on('TARGET_VISUAL_CHANGE', this.onTargetVisualChange.bind(this));
            }
            this.wrapVMAssetMethods();
            this.wrapVMLoadProject();
            this.wrapExtensionManager();
        }
    }

    wrapVMLoadProject () {
        if (!this.vm || !this.vm.loadProject) return;

        const originalLoadProject = this.vm.loadProject.bind(this.vm);
        const service = this;

        if (!service.lastLoadTime) {
            service.lastLoadTime = Date.now();
        }

        this.vm.loadProject = function (input) {
            const isSyncLoad = service.isSyncOperation || service.isApplyingRemoteChange;
            const now = Date.now();
            const timeSinceLastLoad = now - service.lastLoadTime;

            if (!isSyncLoad && service.lastLoadTime > 0 && timeSinceLastLoad < 1000) {
                service.loadCount = (service.loadCount || 0) + 1;
                if (service.loadCount > 3) {
                    service.isLoadingProject = false;
                    service.isSyncOperation = false;
                    if (service.scheduledSyncTimeout) {
                        clearTimeout(service.scheduledSyncTimeout);
                        service.scheduledSyncTimeout = null;
                    }
                    service.loadCount = 0;
                    service.lastLoadTime = now + 5000;
                }
            } else {
                service.loadCount = 0;
            }
            service.lastLoadTime = now;

            if (!isSyncLoad && service.isConnected) {
                service.isLoadingProject = true;
            }

            if (service.isHost && service.isConnected && !isSyncLoad && service.connections.size > 0) {
                service.sendMessage('host-loading-start', {timestamp: Date.now()});
            }

            const progressHandler = (finished, total) => {
                if (service.isHost && service.isConnected && total > 0) {
                    const progress = Math.round((finished / total) * 100);
                    service.sendMessage('host-loading-progress', {progress, finished, total});
                }
            };

            if (service.isHost && service.isConnected && !isSyncLoad) {
                service.vm.on('ASSET_PROGRESS', progressHandler);
            }

            return originalLoadProject(input).then(() => {
                if (service.isHost && service.isConnected && !isSyncLoad) {
                    service.vm.off('ASSET_PROGRESS', progressHandler);
                }

                if (service.isHost && service.isConnected && !isSyncLoad) {
                    if (service.scheduledSyncTimeout) {
                        clearTimeout(service.scheduledSyncTimeout);
                        service.scheduledSyncTimeout = null;
                    }

                    if (service.connections.size > 0) {
                        service.sendMessage('host-loading-complete', {timestamp: Date.now()});

                        const shouldScheduleSync = service._syncRequestedOnApproval === false;
                        if (shouldScheduleSync) {
                            service.scheduledSyncTimeout = setTimeout(() => {
                                if (service.isSyncOperation) {
                                    service.scheduledSyncTimeout = null;
                                    return;
                                }
                                const timeSinceLastSync = Date.now() - service.lastSyncTime;
                                if (service.lastSyncTime > 0 && timeSinceLastSync < 2000) {
                                    service.scheduledSyncTimeout = null;
                                    return;
                                }
                                service.scheduledSyncTimeout = null;
                                service.sendProjectSync(null);
                            }, 500);
                        } else {
                            service._syncRequestedOnApproval = false;
                        }
                    } else {
                        setTimeout(() => {
                            service.isLoadingProject = false;
                        }, 3000);
                    }
                } else if (!isSyncLoad && service.isConnected) {
                    setTimeout(() => {
                        service.isLoadingProject = false;
                    }, 3000);
                }

                return Promise.resolve();
            });
        };
    }

    wrapExtensionManager () {
        if (!this.vm || !this.vm.extensionManager) return;

        const service = this;
        const extensionManager = this.vm.extensionManager;

        if (extensionManager.loadExtensionURL) {
            const originalLoadExtensionURL = extensionManager.loadExtensionURL.bind(extensionManager);
            extensionManager.loadExtensionURL = async function (extensionURL, ...args) {
                const result = await originalLoadExtensionURL(extensionURL, ...args);

                if (service.isConnected && !service.isApplyingRemoteChange &&
                    !service.isSyncOperation && !service.isLoadingProject) {
                    service.sendMessage('extension-load', {
                        extensionURL: extensionURL,
                        timestamp: Date.now()
                    });
                }

                return result;
            };
        }

        if (extensionManager.loadExtensionIdSync) {
            const originalLoadExtensionIdSync = extensionManager.loadExtensionIdSync.bind(extensionManager);
            extensionManager.loadExtensionIdSync = function (extensionId) {
                const result = originalLoadExtensionIdSync(extensionId);

                if (service.isConnected && !service.isApplyingRemoteChange &&
                    !service.isSyncOperation && !service.isLoadingProject) {
                    service.sendMessage('extension-load', {
                        extensionId: extensionId,
                        isBuiltin: true,
                        timestamp: Date.now()
                    });
                }

                return result;
            };
        }
    }

    handleExtensionLoad (payload, conn) {
        if (!this.vm || !this.vm.extensionManager) return;
        if (payload.sender === this.peer.id) return;

        const extensionManager = this.vm.extensionManager;
        this.isApplyingRemoteChange = true;

        const loadExtension = async () => {
            try {
                const extId = payload.extensionId;
                const extURL = payload.extensionURL;

                if (extId && extensionManager.isExtensionLoaded(extId)) {
                    return;
                }

                if (extId && extensionManager.isBuiltinExtension &&
                    extensionManager.isBuiltinExtension(extId)) {
                    extensionManager.loadExtensionIdSync(extId);
                } else if (extURL) {
                    await extensionManager.loadExtensionURL(extURL);
                } else if (extId) {
                    try {
                        extensionManager.loadExtensionIdSync(extId);
                    } catch (e) {
                        // ignore
                    }
                }
            } catch (e) {
                // ignore
            } finally {
                setTimeout(() => {
                    this.isApplyingRemoteChange = false;
                }, 100);
            }
        };

        loadExtension().catch(err => {
            console.error('[Collab] Unhandled extension load error:', err);
        });

        if (this.isHost && payload.sender !== this.peer.id) {
            this.connections.forEach(connection => {
                if (connection !== conn && connection.open) {
                    connection.send({
                        type: 'extension-load',
                        payload,
                        sender: payload.sender,
                        timestamp: Date.now()
                    });
                }
            });
        }
    }

    /**
     * Attach the collaboration block listener to a Blockly workspace
     * This should be called when the blocks component mounts or when collaboration starts
     * @param {Blockly.WorkspaceSvg} workspace - The Blockly workspace instance
     * @return {boolean} - True if attachment was successful, false otherwise
     */
    attachToWorkspace (workspace) {
        return attachToWorkspaceExternal(this, workspace);
    }

    /**
     * Detach the collaboration block listener from a Blockly workspace
     * This should be called when the blocks component unmounts or when collaboration ends
     * @return {boolean} - True if detachment was successful, false otherwise
     */
    detachFromWorkspace () {
        return detachFromWorkspaceExternal(this);
    }

    collaborationBlockListener (event) {
        return collaborationBlockListenerImpl(this, event);
    }

    shouldSyncEvent (event) {
        return shouldSyncEventExternal(this, event);
    }

    wrapVMAssetMethods () {
        return wrapVMAssetMethodsExternal(this);
    }

    handleAssetEvent (payload, conn) {
        return handleAssetEventExternal(this, payload, conn);
    }

    serializeEvent (event) {
        return serializeEventExternal(this, event);
    }

    generatePeerId (roomId, isHost = false) {
        if (!roomId) {
            throw new Error('roomId is required for generatePeerId');
        }

        const sanitizedRoomId = roomId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

        if (isHost) {
            return `${APPNAME}-collab-${sanitizedRoomId}-host`;
        }
        const timestamp = Date.now();
        const randomString = Math.random()
            .toString(36)
            .substring(2, 11);
        return `${APPNAME}-collab-${sanitizedRoomId}-user-${timestamp}-${randomString}`;
    }

    connectToRoom (roomId, username, isHost = false, privacy = 'public') {
        return connectToRoomExternal(this, roomId, username, isHost, privacy);
    }

    setupHost () {
        setupHostExternal(this);
    }

    attemptWorkspaceAttachment (context) {
        attemptWorkspaceAttachmentExternal(this, context);
    }

    connectToHost () {
        connectToHostExternal(this);
    }

    handleConnection (conn) {
        handleConnectionExternal(this, conn);
    }

    handleMessage (data, conn) {
        handleMessageExternal(this, data, conn);
    }

    sendMessage (type, payload, targetConn = null) {
        sendMessageExternal(this, type, payload, targetConn);
    }

    handleUserJoin (payload, conn) {
        handleUserJoinExternal(this, payload, conn);
    }

    handleUserLeave (payload) {
        this.users.delete(payload.id);
        this.userEditingTargets.delete(payload.id);

        if (this.pendingSyncs && this.pendingSyncs.has(payload.id)) {
            this.pendingSyncs.delete(payload.id);

            if (this.isHost && this.pendingSyncs.size === 0) {
                this.sendMessage('session-ready', {timestamp: Date.now()});
                this.emit('session-ready');
            }
        }

        if (typeof window !== 'undefined' && window.ReduxStore) {
            const store = window.ReduxStore;
            const state = store.getState();
            const spriteEditors = state.scratchGui.collaboration.spriteEditors;
            
            Object.keys(spriteEditors).forEach(spriteId => {
                const editors = spriteEditors[spriteId];
                const hasUser = editors.some(editor => editor.userId === payload.id);
                
                if (hasUser) {
                    store.dispatch({
                        type: 'scratch-gui/collaboration/REMOVE_SPRITE_EDITOR',
                        spriteId: spriteId,
                        userId: payload.id
                    });
                }
            });
        }

        this.emit('user-left', payload);
    }

    handleUsersList (payload) {
        const ourUser = this.users.get(this.peer.id);

        this.users.clear();
        payload.users.forEach(user => {
            this.users.set(user.id, user);
        });

        if (ourUser && !this.users.has(this.peer.id)) {
            this.users.set(this.peer.id, ourUser);
        }

        this.emit('users-updated', {users: Array.from(this.users.values())});
    }

    handleUsernameChange (payload) {
        if (this.users.has(payload.id)) {
            this.users.get(payload.id).username = payload.username;
            this.emit('username-changed', payload);
        }
    }

    handleKickUser (payload) {
        if (payload.targetId === this.peer.id) {
            this.wasKicked = true;
            this.disconnect();
            this.emit('kicked-from-room', payload);
        } else if (this.isHost) {
            const targetConn = this.connections.get(payload.targetId);
            if (targetConn) {
                targetConn.close();
                this.connections.delete(payload.targetId);
                this.users.delete(payload.targetId);
            }
        }
    }

    handleSyncRequest (payload, conn) {
        if (!this.isHost) return;
        const now = Date.now();
        const since = now - this._lastHostSyncRequestHandledAt;
        if (this._lastHostSyncRequestHandledAt > 0 && since < this._hostSyncRequestCooldownMs) {
            return;
        }
        this._lastHostSyncRequestHandledAt = now;
        this.sendProjectSync(conn ? conn : payload.sender);
    }

    handleProjectSyncStart (payload, conn) {
        if (!this.isHost) {
            this._projectSyncRequestInFlight = false;
        }
        return handleProjectSyncStartExternal(this, payload, conn);
    }

    handleProjectSyncChunk (payload, conn) {
        return handleProjectSyncChunkExternal(this, payload, conn);
    }

    handleProjectStreamStart (payload, conn) {
        return handleProjectSyncStartExternal(this, payload, conn);
    }

    handleProjectStreamData (payload, conn) {
        return handleProjectSyncChunkExternal(this, payload, conn);
    }

    handleProjectStreamEnd (payload, conn) {
        return handleProjectStreamEndExternal(this, payload, conn);
    }

    handleClientSyncComplete (payload) {
        if (!this.isHost) return;

        if (this.pendingSyncs) {
            this.pendingSyncs.delete(payload.sender);

            if (this.pendingSyncs.size === 0) {
                this.sendMessage('session-ready', {timestamp: Date.now()});
                this.emit('session-ready');
            }
        }
    }

    handleSessionReady () {
        this.emit('session-ready');
    }

    handleTargetsUpdate (payload, conn) {
        if (!this.vm || !this.vm.runtime) return;
        if (payload.sender === this.peer.id) return;

        this.isApplyingRemoteChange = true;

        const updates = payload.updates || [];
        updates.forEach(update => {
            const targetId = this.isHost ? update.targetId : (this.targetMapping[update.targetId] || update.targetId);
            const target = this.vm.runtime.getTargetById(targetId);
            if (target) {
                if ('x' in update && 'y' in update) target.setXY(update.x, update.y);
                if ('direction' in update) target.setDirection(update.direction);
                if ('size' in update) target.setSize(update.size);
                if ('visible' in update) target.setVisible(update.visible);
            }
        });

        this.isApplyingRemoteChange = false;

        if (this.isHost) {
            this.connections.forEach(connection => {
                if (connection !== conn && connection.open) {
                    connection.send({
                        type: 'targets-update',
                        payload: payload,
                        sender: payload.sender,
                        timestamp: Date.now()
                    });
                }
            });
        }
    }

    handleBlockEvent (payload, conn, isRetry = false) {
        return handleBlockEventImpl(this, payload, conn, isRetry);
    }

    setupCursorLayer () {
        return setupCursorLayerExternal(this);
    }

    destroyCursorLayer () {
        return destroyCursorLayerExternal(this);
    }

    bindCursorEvents () {
        return bindCursorEventsExternal(this);
    }

    unbindCursorEvents () {
        return unbindCursorEventsExternal(this);
    }

    handleCursorMove (payload, conn) {
        return handleCursorMoveExternal(this, payload, conn);
    }

    handleCursorLeave (payload, conn) {
        return handleCursorLeaveExternal(this, payload, conn);
    }

    updateAllRemoteCursorPositions () {
        return updateAllRemoteCursorPositionsExternal(this);
    }

    handleCursorChat (payload, conn) {
        return handleCursorChatExternal(this, payload, conn);
    }

    bindViewportSyncListeners () {
        return bindViewportSyncListenersExternal(this);
    }

    unbindViewportSyncListeners () {
        return unbindViewportSyncListenersExternal(this);
    }

    reconstructEvent (serializedEvent) {
        return reconstructEventExternal(this, serializedEvent);
    }

    onWorkspaceUpdate () {
        return;
    }

    onProjectChanged () {
        return;
    }

    onTargetsUpdate () {
        if (!this.isConnected || this.isApplyingRemoteChange || this.isSyncOperation || this.isLoadingProject) return;

        const now = Date.now();
        if (this._lastTargetsUpdate && now - this._lastTargetsUpdate < 33) return;
        this._lastTargetsUpdate = now;

        const updates = [];
        const targets = this.vm.runtime.targets;

        if (!this._lastTargetState) this._lastTargetState = {};

        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            if (target.isStage) continue;

            const id = target.id;
            const state = {
                x: target.x,
                y: target.y,
                direction: target.direction,
                size: target.size,
                visible: target.visible
            };

            const lastState = this._lastTargetState[id];

            if (!lastState ||
                lastState.x !== state.x ||
                lastState.y !== state.y ||
                lastState.direction !== state.direction ||
                lastState.size !== state.size ||
                lastState.visible !== state.visible) {

                updates.push({targetId: id, ...state});
                this._lastTargetState[id] = state;
            }
        }

        if (updates.length > 0) {
            this.sendMessage('targets-update', {updates, timestamp: now});
        }
    }

    onTargetVisualChange (target) {
        if (!this.isConnected || !target || this.isApplyingRemoteChange ||
            this.isSyncOperation || this.isLoadingProject) return;

        if (typeof target.currentCostume !== 'number') return;

        const targetId = target.id;
        const payload = {
            targetId,
            currentCostume: target.currentCostume,
            isStage: target.isStage
        };

        if (target.isStage) {
            this.sendMessage('stage-costume-change', payload);
        } else {
            this.sendMessage('costume-change', payload);
        }
    }

    handleStageCostumeChange (payload, conn) {
        if (!this.vm || !this.vm.runtime) return;

        const targetId = payload.targetId;
        const mappedTargetId = !this.isHost && this.targetMapping ?
            this.targetMapping[targetId] : targetId;

        const stage = this.vm.runtime.getTargetById(mappedTargetId);
        if (stage && stage.isStage) {
            const costumeIndex = payload.currentCostume;
            if (costumeIndex >= 0 && costumeIndex < stage.getCostumes().length) {
                stage.setCostume(costumeIndex);
            }
        }

        if (this.isHost && payload.sender !== this.peer.id) {
            this.connections.forEach(connection => {
                if (connection !== conn && connection.open) {
                    connection.send({
                        type: 'stage-costume-change',
                        payload,
                        sender: payload.sender,
                        timestamp: Date.now()
                    });
                }
            });
        }
    }

    handleCostumeChange (payload, conn) {
        if (!this.vm || !this.vm.runtime) return;

        const targetId = payload.targetId;
        const mappedTargetId = !this.isHost && this.targetMapping ?
            this.targetMapping[targetId] : targetId;

        const target = this.vm.runtime.getTargetById(mappedTargetId);
        if (target && !target.isStage) {
            const costumeIndex = payload.currentCostume;
            if (costumeIndex >= 0 && costumeIndex < target.getCostumes().length) {
                target.setCostume(costumeIndex);
            }
        }

        if (this.isHost && payload.sender !== this.peer.id) {
            this.connections.forEach(connection => {
                if (connection !== conn && connection.open) {
                    connection.send({
                        type: 'costume-change',
                        payload,
                        sender: payload.sender,
                        timestamp: Date.now()
                    });
                }
            });
        }
    }

    syncCurrentCostume () {
        if (!this.isConnected || !this.vm || !this.vm.runtime ||
            this.isApplyingRemoteChange || this.isSyncOperation || this.isLoadingProject) {
            return;
        }

        const target = this.vm.editingTarget;
        if (!target || typeof target.currentCostume !== 'number') return;

        const targetId = target.id;
        const payload = {
            targetId,
            currentCostume: target.currentCostume,
            isStage: target.isStage
        };

        if (target.isStage) {
            this.sendMessage('stage-costume-change', payload);
        } else {
            this.sendMessage('costume-change', payload);
        }
    }

    sendProjectSync (conn) {
        return sendProjectSyncExternal(this, conn);
    }

    changeUsername (newUsername) {
        this.username = newUsername;
        this.sendMessage('username-change', {
            id: this.peer.id,
            username: newUsername
        });

        if (this.users.has(this.peer.id)) {
            this.users.get(this.peer.id).username = newUsername;
        }
    }

    kickUser (userId) {
        if (this.isHost) {
            this.sendMessage('kick-user', {targetId: userId});

            const conn = this.connections.get(userId);
            if (conn) {
                if (conn.close) conn.close();
                this.connections.delete(userId);
            }
        }
    }

    getConnectedUsers () {
        return Array.from(this.users.values());
    }

    isUserHost (userId) {
        const user = this.users.get(userId);
        return user && user.isHost;
    }

    isConnectedToHostPeer () {
        return this.isConnectedToHost;
    }

    disconnect () {
        if (this.isDisconnecting) {
            return;
        }

        if (!this.peer && !this.isConnected && !this.isConnectedToHost) {
            return;
        }

        this.isDisconnecting = true;
        this._setState('DISCONNECTING');

        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        if (this.scheduledSyncTimeout) {
            clearTimeout(this.scheduledSyncTimeout);
            this.scheduledSyncTimeout = null;
        }

        // Clear reconnection timer and state
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        this._reconnectionState = null;
        this._attemptReconnect = null;

        if (this.peer) {
            try {
                this.clearPendingEvents();

                if (this._debugFlagInterval) {
                    clearInterval(this._debugFlagInterval);
                    this._debugFlagInterval = null;
                }

                if (this._syncRequestTimer) {
                    clearTimeout(this._syncRequestTimer);
                    this._syncRequestTimer = null;
                }

                if (this._suppressionClearTimer) {
                    clearTimeout(this._suppressionClearTimer);
                    this._suppressionClearTimer = null;
                }

                this.connections.forEach(conn => {
                    try {
                        if (conn && conn.close) conn.close();
                    } catch (e) {
                        // ignore
                    }
                });

                if (this.peer && !this.peer.destroyed && this.peer.destroy) {
                    this.peer.destroy();
                }
            } catch (e) {
                // ignore
            }
            this.peer = null;
        }

        this.detachFromWorkspace();
        this.clearPendingEvents();

        clearPendingEventTimersImpl();

        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }

        this.connections.clear();
        this.users.clear();
        this.pendingJoinRequests.clear();
        this.userEditingTargets.clear();
        this.isConnected = false;
        this.isConnectedToHost = false;
        this.isHost = false;
        this.roomId = null;
        this.roomPrivacy = 'public';
        this.hostId = null;
        this.wasKicked = false;
        this.currentConnectionFailureHandler = null;
        this.targetMapping = {};
        this.isSyncOperation = false;
        this.isLoadingProject = false;
        this.isSwitchingTarget = false;
        this.seenEventIds.clear();
        this.seenEventTimestamps.clear();
        this.destroyCursorLayer();

        this.isDisconnecting = false;
        this._setState('IDLE');

        this.emit('disconnected');
    }

    on (event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    off (event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit (event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    // ignore
                }
            });
        }
    }

    queuePendingEvent (payload) {
        const eventWithTimestamp = {
            ...payload,
            queuedAt: Date.now()
        };

        this.pendingEvents.push(eventWithTimestamp);
        this.startRetryTimer();

        const now = Date.now();
        const beforeLength = this.pendingEvents.length;

        this.pendingEvents = this.pendingEvents.filter(
            evt => now - evt.queuedAt < 30000
        );
        const removed = beforeLength - this.pendingEvents.length;
        if (removed > 0) {
            console.log(`[Collab] Removed ${removed} expired pending events`);
        }

        if (this.pendingEvents.length > 100) {
            this.pendingEvents = this.pendingEvents.slice(-90);
        }
    }

    startRetryTimer () {
        if (this.retryTimer) {
            return;
        }

        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.processPendingEvents();

            if (this.pendingEvents.length > 0) {
                this.startRetryTimer();
            }
        }, 1000);
    }

    processPendingEvents () {
        if (this.pendingEvents.length === 0) {
            return;
        }

        const currentTime = Date.now();
        const eventsToRetry = [];
        const expiredEvents = [];
        const preSyncEvents = [];

        for (const event of this.pendingEvents) {
            const age = currentTime - event.queuedAt;

            if (event.queuedAt < this.lastSyncTime) {
                preSyncEvents.push(event);
            } else if (age > 30000) {
                expiredEvents.push(event);
            } else {
                eventsToRetry.push(event);
            }
        }

        this.pendingEvents = [];

        for (const payload of eventsToRetry) {
            try {
                const cleanPayload = {...payload};
                delete cleanPayload.queuedAt;
                this.handleBlockEvent(cleanPayload, null, true);
            } catch (e) {
                // ignore
            }
        }
    }

    clearPendingEvents () {
        this.pendingEvents = [];
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    debugTargetStates (context = '') {
        return debugTargetStatesExternal(this, context);
    }

    handleJoinRequest (data, connection) {
        return handleJoinRequestExternal(this, data, connection);
    }

    handleJoinApproved (data, connection) {
        return handleJoinApprovedExternal(this, data, connection);
    }

    handleJoinDenied (data, connection) {
        return handleJoinDeniedExternal(this, data, connection);
    }

    handleRoomPrivacy (data, connection) {
        return handleRoomPrivacyExternal(this, data, connection);
    }

    handleTargetSwitch (payload, conn) {
        const spriteId = payload.targetId;
        const userId = payload.userId;
        const username = payload.username;
        
        if (!userId) return;
        
        const oldTargetId = this.userEditingTargets.get(userId);
        
        if (spriteId !== oldTargetId) {
            if (typeof window !== 'undefined' && window.ReduxStore) {
                const store = window.ReduxStore;
                
                if (oldTargetId) {
                    store.dispatch({
                        type: 'scratch-gui/collaboration/REMOVE_SPRITE_EDITOR',
                        spriteId: oldTargetId,
                        userId: userId
                    });
                }
                
                if (spriteId) {
                    store.dispatch({
                        type: 'scratch-gui/collaboration/SET_SPRITE_EDITOR',
                        spriteId: spriteId,
                        userId: userId,
                        username: username,
                        timestamp: Date.now()
                    });
                }
            }
            
            this.userEditingTargets.set(userId, spriteId);
        }
        
        if (this.isHost && conn && payload.sender !== this.peer.id) {
            this.connections.forEach(connection => {
                if (connection !== conn && connection.open) {
                    connection.send({
                        type: 'target-switch',
                        payload,
                        sender: payload.sender,
                        timestamp: Date.now()
                    });
                }
            });
        }
    }

    handleTargetCreated () {
        return;
    }

    handleTargetDeleted () {
        return;
    }

    onEditingTargetChange () {
        if (!this.vm || !this.isConnected || this.isApplyingRemoteChange) return;

        const editingTargetId = this.vm.editingTarget ? this.vm.editingTarget.id : null;

        this.sendMessage('target-switch', {
            targetId: editingTargetId,
            userId: this.peer.id,
            username: this.username,
            timestamp: Date.now()
        });

        this.isSwitchingTarget = true;
        setTimeout(() => {
            this.isSwitchingTarget = false;
        }, 500);
    }

    onTargetCreated () {
        return;
    }

    spriteInfoChanged (target, changedProps) {
        if (!this.isConnected || !target || this.isApplyingRemoteChange ||
            this.isSyncOperation || this.isLoadingProject) {
            return;
        }

        if (target.isStage) return;

        const payload = {
            targetName: target.sprite.name,
            changedProps,
            timestamp: Date.now()
        };

        this.sendMessage('sprite-info-changed', payload);
    }

    handleSpriteInfoChanged (payload, conn) {
        if (!this.vm || !this.vm.runtime) return;
        if (!payload.sender) return;
        if (payload.sender === this.peer.id) return;

        const targetName = payload.targetName;
        if (!targetName) return;

        const target = this.vm.runtime.targets.find(t => t.sprite.name === targetName && !t.isStage && t.isOriginal);
        if (!target) {
            console.warn('[Collab] Target not found for name:', targetName);
            return;
        }
        if (target.isStage) return;

        this.isApplyingRemoteChange = true;

        const changedProps = payload.changedProps || {};
        
        let newX = target.x;
        let newY = target.y;
        if ('x' in changedProps) newX = changedProps.x;
        if ('y' in changedProps) newY = changedProps.y;
        if (newX !== target.x || newY !== target.y) {
            target.setXY(newX, newY);
        }
        if ('direction' in changedProps) target.setDirection(changedProps.direction);
        if ('size' in changedProps) target.setSize(changedProps.size);
        if ('visible' in changedProps) target.setVisible(changedProps.visible);
        if ('rotationStyle' in changedProps) target.setRotationStyle(changedProps.rotationStyle);

        this.isApplyingRemoteChange = false;

        if (this.isHost && payload.sender !== this.peer.id) {
            this.connections.forEach(connection => {
                if (connection !== conn && connection.open) {
                    connection.send({
                        type: 'sprite-info-changed',
                        payload,
                        sender: payload.sender,
                        timestamp: Date.now()
                    });
                }
            });
        }
    }

    onTargetDeleted (targetId) {
        if (!this.isConnected || this.isApplyingRemoteChange ||
            this.isSyncOperation || this.isLoadingProject) return;

        const targetIdToSend = getTargetIdForMessage(this, targetId);
        this.sendMessage('target-deleted', {
            targetId: targetIdToSend,
            timestamp: Date.now()
        });
    }

    approveJoinRequest (requesterId, requesterUsername) {
        return approveJoinRequestExternal(this, requesterId, requesterUsername);
    }

    denyJoinRequest (requesterId, reason = 'Host denied your request') {
        return denyJoinRequestExternal(this, requesterId, reason);
    }

    cancelJoinRequest () {
        return cancelJoinRequestExternal(this);
    }

    handleJoinCancelled (data, connection) {
        return handleJoinCancelledExternal(this, data, connection);
    }

    getPendingJoinRequests () {
        return getPendingJoinRequestsExternal(this);
    }

    getRoomPrivacy () {
        return getRoomPrivacyExternal(this);
    }

    changeRoomPrivacy (newPrivacy) {
        return changeRoomPrivacyExternal(this, newPrivacy);
    }
}

const CollaborationServiceExport = {
    getInstance () {
        if (!collaborationServiceInstance) {
            collaborationServiceInstance = new CollaborationService();
        }
        return collaborationServiceInstance;
    }
};

if (typeof window !== 'undefined') {
    window.CollaborationService = CollaborationServiceExport;
}

export default CollaborationServiceExport;
