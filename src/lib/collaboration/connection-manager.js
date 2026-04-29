const sendMessage = (service, type, payload, targetConn) => {
    // ROBUSTNESS FIX: Better error handling and validation
    if (!service || !service.peer) {
        return;
    }

    const message = {type, payload, sender: service.peer.id, timestamp: Date.now()};

    if (targetConn) {
        if (typeof targetConn === 'string') {
            const conn = service.connections.get(targetConn);
            if (conn && conn.open) {
                try {
                    conn.send(message);
                } catch (error) {
                    service.emit('message-send-failed', {type, targetId: targetConn, error});
                }
            } else {
                return;
            }
        }

        if (targetConn.open) {
            try {
                targetConn.send(message);
            } catch (error) {
                service.emit('message-send-failed', {type, error});
            }
            return;
        }
    }

    service.connections.forEach(conn => {
        if (conn.open) {
            try {
                conn.send(message);
            } catch (error) {
                service.emit('message-send-failed', {type, peer: conn.peer, error});
            }
        }
    });
};

const handleMessage = (service, data, conn) => {
    const {type, payload, sender} = data;
    if (service.messageHandlers[type]) {
        const enrichedPayload = {...payload, sender};
        service.messageHandlers[type](enrichedPayload, conn);
    }
};

const handleConnection = (service, conn) => {
    service.connections.set(conn.peer, conn);

    conn.on('open', () => {
        if (!service.isHost && conn.peer === service.hostId) {
            service.isConnectedToHost = true;
            service.attemptWorkspaceAttachment('Client connected');
            service.emit('connected-to-host');
        }

        if (!service.isHost) {
            const userInfo = {
                id: service.peer.id,
                username: service.username,
                isHost: service.isHost
            };
            sendMessage(service, 'user-join', userInfo, conn);
            service.emit('awaiting-approval');
        }
    });

    conn.on('data', data => {
        handleMessage(service, data, conn);
    });

    conn.on('close', () => {
        const userInfo = service.users.get(conn.peer);
        service.connections.delete(conn.peer);

        if (conn.peer === service.hostId && !service.isHost) {
            if (service._handleConnectionLost) {
                service._handleConnectionLost('host disconnected');
            } else {
                service.emit('host-left');
                setTimeout(() => {
                    if (!service.isDisconnecting) {
                        service.disconnect();
                    }
                }, 100);
            }
            return;
        }

        service.users.delete(conn.peer);
        if (!service.wasKicked) {
            service.emit('user-left', {
                id: conn.peer,
                username: userInfo ? userInfo.username : null
            });
        }
    });

    conn.on('error', () => {

        if (service.isHost) {
            const userInfo = service.users.get(conn.peer);
            service.connections.delete(conn.peer);
            service.users.delete(conn.peer);
            if (!service.wasKicked) {
                service.emit('user-left', {
                    id: conn.peer,
                    username: userInfo ? userInfo.username : null
                });
            }
        } else {
            if (conn.peer !== service.hostId) {
                service.connections.delete(conn.peer);
                service.users.delete(conn.peer);
            }

            if (service._handleConnectionLost) {
                service._handleConnectionLost('connection error');
            } else {
                service.emit('host-left');
                setTimeout(() => {
                    if (!service.isDisconnecting) {
                        service.disconnect();
                    }
                }, 100);
            }
        }
    });

    if (conn.open) {
        conn.emit('open');
    }
};

export {
    sendMessage,
    handleConnection,
    handleMessage
};
