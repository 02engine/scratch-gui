import Peer from 'peerjs';
import {resetBlockEventsState} from './block-events.js';

const createReconnectHandler = service => {
    if (!service._reconnectionState) {
        service._reconnectionState = {
            attemptCount: 0,
            lastAttemptTime: 0,
            consecutiveFailures: 0,
            isReconnecting: false
        };
    }

    service._handleConnectionLost = /* eslint-disable-line no-unused-vars */ reason => {
        if (service.isDisconnecting || (service._isShuttingDown && service._isShuttingDown())) {
            return;
        }


        if (service._attemptReconnect) {
            service._attemptReconnect();
        } else {
            console.warn('[Connection] No reconnection handler available, disconnecting');
            service.disconnect();
        }
    };

    service._attemptReconnect = () => {
        const now = Date.now();
        const state = service._reconnectionState;

        if (now - state.lastAttemptTime < 1000) {
            const timeToWait = 1000 - (now - state.lastAttemptTime);
            setTimeout(() => {
                if (!service.isDisconnecting && !(service._isShuttingDown && service._isShuttingDown())) {
                    service._attemptReconnect();
                }
            }, timeToWait);
            return;
        }

        if (state.consecutiveFailures >= 10) {
            console.error('[Connection] Max reconnection attempts reached, giving up');
            service._attemptReconnect = null;
            state.isReconnecting = false;
            service.disconnect();
            service.emit('connection-failed', {
                error: 'Unable to establish a stable connection after ' +
                    'multiple attempts. Please check your network connection and try again.'
            });
            return;
        }

        state.isReconnecting = true;
        state.lastAttemptTime = now;
        state.attemptCount++;

        // Calculate exponential backoff delay: 1s, 2s, 4s, 8s, 16s (capped at 16s)
        const backoffDelay = Math.min(1000 * Math.pow(2, Math.min(state.attemptCount - 1, 4)), 16000);

        service._reconnectTimer = setTimeout(async () => {
            if (service.isDisconnecting || (service._isShuttingDown && service._isShuttingDown())) {
                state.isReconnecting = false;
                return;
            }

            try {
                await service.connectToRoom(service.roomId, service.username, false, service.roomPrivacy);
                state.isReconnecting = false;
            } catch (error) {
                console.error(`[Connection] Reconnection attempt ${state.attemptCount} failed:`, error.message);
                if (!service.isDisconnecting) {
                    // Retry after another backoff if we haven't hit max attempts
                    state.consecutiveFailures++;
                    if (state.consecutiveFailures < 10) {
                        service._attemptReconnect();
                    } else {
                        state.isReconnecting = false;
                        service.disconnect();
                        service.emit('connection-failed', {
                            error: 'Connection unstable after multiple reconnection ' +
                                'attempts. Please refresh the page and try again.'
                        });
                    }
                }
            }
        }, backoffDelay);
    };
};

const setupHost = service => {
    service.hostId = service.peer.id;
    service.isConnectedToHost = true;
    service.currentConnectionFailureHandler = null;
    const hostUser = {
        id: service.peer.id,
        username: service.username,
        isHost: true
    };
    service.users.set(service.peer.id, hostUser);
    if (service.vm && service.vm.runtime && service.vm.runtime.targets) {
        service.targetMapping = {};
        service.vm.runtime.targets.forEach(target => {
            service.targetMapping[target.id] = target.id;
        });
    }
    service.attemptWorkspaceAttachment('Host setup');
    service.emit('room-created', {roomId: service.roomId, hostId: service.peer.id});
    service.emit('user-joined', hostUser);
};

const connectToHost = service => {
    const hostId = service.generatePeerId(service.roomId, true);
    service.hostId = hostId;
    const roomIdForError = service.roomId;
    let errorHandled = false;
    let conn = null;
    
    if (!service._reconnectionState) {
        service._reconnectionState = {
            attemptCount: 0,
            lastAttemptTime: 0,
            consecutiveFailures: 0,
            isReconnecting: false
        };
    }
    
    const handleConnectionFailure = (errorMessage, shouldTriggerReconnect = true) => {
        if (errorHandled) {
            return;
        }
        errorHandled = true;
        if (service.connectionTimeout) {
            clearTimeout(service.connectionTimeout);
            service.connectionTimeout = null;
        }
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                // Ignore
            }
        }

        // Track consecutive failures
        service._reconnectionState.consecutiveFailures++;
        service._reconnectionState.lastFailureTime = Date.now();

        if (!service._isShuttingDown || !service._isShuttingDown()) {
            if (shouldTriggerReconnect && service._reconnectionState.consecutiveFailures < 5 &&
                service._attemptReconnect) {
                console.warn('[Connection] Connection failed, attempting reconnection...');
                service._attemptReconnect();
            } else {
                service.disconnect();
            }
        }
        service.emit('connection-failed', {error: errorMessage});
    };
    service.currentConnectionFailureHandler = handleConnectionFailure;
    try {
        conn = service.peer.connect(hostId, {
            label: 'collaboration',
            metadata: {
                username: service.username,
                roomId: service.roomId
            },
            reliable: true
        });
        service.connectionTimeout = setTimeout(() => {
            if (!conn.open && !errorHandled) {
                handleConnectionFailure(`Connection to room "${roomIdForError}" timed out. Host may not be available.`);
            }
        }, 15000);
        conn.on('open', () => {
            if (!errorHandled) {
                errorHandled = true;
                if (service.connectionTimeout) {
                    clearTimeout(service.connectionTimeout);
                    service.connectionTimeout = null;
                }
                service.currentConnectionFailureHandler = null;
                service._reconnectionState = {
                    attemptCount: 0,
                    lastAttemptTime: 0,
                    consecutiveFailures: 0,
                    isReconnecting: false
                };
            }
        });
        conn.on('error', () => {
            if (!errorHandled) {
                errorHandled = true;
                if (service.connectionTimeout) {
                    clearTimeout(service.connectionTimeout);
                    service.connectionTimeout = null;
                }
                handleConnectionFailure(
                    `Could not connect to host. Room "${roomIdForError}" may not exist or host may be offline.`
                );
            }
        });
        let iceFailures = 0;
        let iceFailureTimeout = null;
        conn.peerConnection.addEventListener('iceconnectionstatechange', () => {
            const state = conn.peerConnection.iceConnectionState;

            if (state === 'failed' || state === 'disconnected') {
                if (!errorHandled) {
                    iceFailures++;
                    console.warn(`[Connection] ICE connection state: ${state} (failure ${iceFailures})`);

                    if (iceFailureTimeout) {
                        clearTimeout(iceFailureTimeout);
                        iceFailureTimeout = null;
                    }

                    if (iceFailures > 2) {
                        const backoffDelay = Math.min(2000 * Math.pow(2, iceFailures - 3), 16000);
                        iceFailureTimeout = setTimeout(() => {
                            if (!conn.open && !errorHandled) {
                                handleConnectionFailure(
                                    `ICE connection failed after ${iceFailures} attempts. This may be a network issue.`
                                );
                            }
                            iceFailureTimeout = null;
                        }, backoffDelay);
                    }
                }
            } else if (state === 'connected' || state === 'completed') {
                iceFailures = 0;
                if (iceFailureTimeout) {
                    clearTimeout(iceFailureTimeout);
                    iceFailureTimeout = null;
                }
            }
        });
        conn.peerConnection.addEventListener('connectionstatechange', () => {});
        service.handleConnection(conn);
    } catch (error) {
        const roomIdForError2 = service.roomId;
        service.disconnect();
        service.emit('connection-failed', {
            error: `Failed to connect to room "${roomIdForError2}". Please check the room name.`
        });
    }
};

const connectToRoom = async (service, roomId, username, isHost = false, privacy = 'public') => {
    if (!roomId) {
        throw new Error('roomId is required to connect to a room');
    }

    const currentState = service.getState ? service.getState() : 'UNKNOWN';
    if (currentState === 'CONNECTING' && !service._reconnectTimer) {
        throw new Error('Already connecting to a room');
    }

    try {
        service.roomId = roomId;
        
        if (service._reconnectTimer) {
            clearTimeout(service._reconnectTimer);
            service._reconnectTimer = null;
        }
        
        if (service.peer && !service._reconnectTimer) {
            service.disconnect();
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        resetBlockEventsState();

        if (service._setState) {
            service._setState('CONNECTING');
        }

        const peerId = service.generatePeerId(roomId, isHost);
        service.peer = new Peer(peerId, service.peerConfig);
        return new Promise((resolve, reject) => {
            service.username = username || `User${Math.floor(Math.random() * 1000)}`;
            service.isHost = isHost;
            service.roomPrivacy = privacy;

            service.peer.on('open', id => {
                service.isConnected = true;
                service.roomId = roomId;

                if (service._setState) {
                    service._setState('CONNECTED');
                }

                if (service.isHost) {
                    setupHost(service);
                } else {
                    createReconnectHandler(service);
                    connectToHost(service);
                }
                resolve(id);
            });

            service.peer.on('error', error => {
                if (service.isDisconnecting || (service._isShuttingDown && service._isShuttingDown())) {
                    console.warn('[Connection] Ignoring peer error during shutdown:', error);
                    return;
                }

                const roomIdForError = service.roomId;

                if (service.currentConnectionFailureHandler && !service.isHost && !service._reconnectTimer) {
                    service.currentConnectionFailureHandler(
                        `Could not connect to host. Room "${roomIdForError}" may not exist or host may be offline.`
                    );
                    reject(error);
                    return;
                }

                if (service.isHost) {
                    const errorMessage = error.message || error.toString();
                    if (errorMessage.includes('taken') || errorMessage.includes('unavailable') ||
                        errorMessage.includes('server') || errorMessage.includes('network')) {
                        console.error('[COLLABORATION] Critical peer error on host:', error);
                        service.disconnect();
                        if (service._setState) {
                            service._setState('ERROR');
                        }
                        reject(error);
                    } else {
                        console.warn('[COLLABORATION] Non-critical peer error on host (ignored):', error);
                    }
                } else {
                    service.disconnect();
                    if (service._setState) {
                        service._setState('ERROR');
                    }
                    reject(error);
                }
            });

            service.peer.on('connection', conn => {
                try {
                    service.handleConnection(conn);
                } catch (error) {
                    console.error('[Connection] Error handling incoming connection:', error);
                }
            });
        });
    } catch (error) {
        console.error('[Connection] Error in connectToRoom:', error);
        service.disconnect();
        throw error;
    }
};

const approveJoinRequest = (service, requesterId, requesterUsername) => {
    if (!service.isHost) return;
    const request = service.pendingJoinRequests.get(requesterId);
    if (!request) return;
    service.sendMessage('join-approved', {
        roomId: service.roomId,
        hostUsername: service.username
    }, requesterId);
    const userPayload = {
        id: requesterId,
        username: requesterUsername,
        isHost: false
    };
    service.users.set(requesterId, userPayload);
    service.emit('user-joined', userPayload);
    const currentUsers = Array.from(service.users.values());
    service.sendMessage('users-list', {users: currentUsers}, requesterId);
    service.connections.forEach(connection => {
        if (connection !== request.connection && connection.open) {
            service.sendMessage('user-join', userPayload, connection.peer);
        }
    });
    service.emit('users-updated', {users: currentUsers});
    service.pendingJoinRequests.delete(requesterId);
};

const handleJoinRequest = (service, data, connection) => {
    if (!service.isHost) return;
    if (service.roomPrivacy === 'public') {
        approveJoinRequest(service, connection.peer, data.requester.username);
    } else {
        service.pendingJoinRequests.set(connection.peer, {
            id: connection.peer,
            username: data.requester.username,
            connection: connection
        });
        service.emit('join-request-received', {
            requesterId: connection.peer,
            requesterUsername: data.requester.username
        });
    }
};

const handleJoinApproved = (service, connection) => {
    service.emit('approval-resolved');
    const ourUser = {
        id: service.peer.id,
        username: service.username,
        isHost: false
    };
    service.users.set(service.peer.id, ourUser);
    service.emit('user-joined', ourUser);

    service._syncRequestedOnApproval = true;
    service.sendMessage('sync-request', {}, connection);
    service.emit('join-approved');
    service.emit('connected-to-host');
};

const handleUserJoin = (service, payload, conn) => {
    if (payload.id === service.peer.id && !service.isHost) {
        service.emit('approval-resolved');
        service.users.set(service.peer.id, payload);
        service.emit('user-joined', payload);
        service.emit('connected-to-host');
        return;
    }
    if (payload.id === service.peer.id) return;
    service.pendingJoinRequests.set(payload.id, {
        id: payload.id,
        username: payload.username,
        connection: conn
    });
    service.emit('join-request-received', {
        requesterId: payload.id,
        requesterUsername: payload.username
    });
    if (service.isHost) {
        if (service.roomPrivacy === 'private') return;
        if (service.roomPrivacy === 'public') approveJoinRequest(service, payload.id, payload.username, conn);
    }
    service.users.set(payload.id, payload);
    service.emit('user-joined', payload);
    if (service.isHost) {
        const currentUsers = Array.from(service.users.values());
        service.sendMessage('users-list', {users: currentUsers}, conn ? conn : payload.id);
        service.connections.forEach(connection => {
            if (connection !== conn && connection.open) {
                service.sendMessage('user-join', payload, connection.peer);
            }
        });
        service.emit('users-updated', {users: currentUsers});
    }
};

const handleJoinDenied = (service, data) => {
    service.emit('approval-resolved');
    service.emit('join-denied', data.reason || 'Join request was denied');
};

const handleJoinCancelled = (service, data, connection) => {
    if (!service.isHost) return;
    if (service.pendingJoinRequests.has(data.id)) {
        service.pendingJoinRequests.delete(data.id);
        service.emit('join-request-cancelled', {
            requesterId: data.id,
            requesterUsername: data.username
        });
    }
    if (connection && !connection.destroyed && connection.close) {
        connection.close();
    }
    service.connections.delete(data.id);
};

const denyJoinRequest = (service, requesterId, reason = 'Host denied your request') => {
    if (!service.isHost) return;
    const request = service.pendingJoinRequests.get(requesterId);
    if (!request) return;
    service.sendMessage('join-denied', {reason}, requesterId);
    if (request.connection && request.connection.close) request.connection.close();
    service.pendingJoinRequests.delete(requesterId);
};

const cancelJoinRequest = service => {
    if (service.connections.has(service.hostId)) {
        const conn = service.connections.get(service.hostId);
        if (conn) {
            service.sendMessage('join-cancelled', {
                id: service.peer.id,
                username: service.username
            }, conn);
        }
    }
    service.disconnect();
};

const handleRoomPrivacy = (service, data) => {
    service.roomPrivacy = data.privacy;
    service.emit('room-privacy-changed', data.privacy);
};

const getPendingJoinRequests = service => {
    if (!service.isHost || !service.isConnected || service.isDisconnecting) {
        return [];
    }
    const requests = Array.from(service.pendingJoinRequests.values()).map(request => ({
        id: request.id,
        username: request.username
    }));
    return requests;
};

const getRoomPrivacy = service => service.roomPrivacy;

const changeRoomPrivacy = (service, newPrivacy) => {
    if (!service.isHost) throw new Error('Only the host can change room privacy');
    if (newPrivacy !== 'public' && newPrivacy !== 'private') {
        throw new Error('Privacy must be either "public" or "private"');
    }
    service.roomPrivacy = newPrivacy;
    service.sendMessage('room-privacy', {privacy: newPrivacy});
};

export {
    setupHost,
    connectToHost,
    handleJoinRequest,
    handleJoinApproved,
    handleUserJoin,
    handleJoinDenied,
    handleJoinCancelled,
    approveJoinRequest,
    denyJoinRequest,
    cancelJoinRequest,
    handleRoomPrivacy,
    getPendingJoinRequests,
    getRoomPrivacy,
    changeRoomPrivacy,
    connectToRoom
};
