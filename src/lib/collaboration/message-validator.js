const validateBlockEventPayload = function (payload) {
    if (!payload.event || typeof payload.event !== 'object') {
        return {valid: false, error: 'Missing or invalid event data'};
    }

    const event = payload.event;

    const validEventTypes = [
        'create', 'move', 'delete', 'change', 'ui', 'click',
        'selected', 'comment_create', 'comment_delete', 'comment_move', 'comment_change'
    ];
    if (!event.type || typeof event.type !== 'string' || !validEventTypes.includes(event.type)) {
        return {valid: false, error: `Invalid or missing event type: ${event.type}`};
    }

    if (payload.eventId && typeof payload.eventId !== 'string') {
        return {valid: false, error: 'Invalid event id format'};
    }

    if (payload.eventOrigin && typeof payload.eventOrigin !== 'string') {
        return {valid: false, error: 'Invalid event origin format'};
    }

    if (payload.sender && typeof payload.sender !== 'string') {
        return {valid: false, error: 'Invalid sender format'};
    }

    if (payload.targetName && typeof payload.targetName !== 'string') {
        return {valid: false, error: 'Invalid target name'};
    }

    if (payload.targetId && typeof payload.targetId !== 'string') {
        return {valid: false, error: 'Invalid target id'};
    }

    return {valid: true};
};

const validateMessageStructure = function (message) {
    if (!message || typeof message !== 'object') {
        return {valid: false, error: 'Message must be an object'};
    }

    if (typeof message.type !== 'string' || message.type.length === 0) {
        return {valid: false, error: 'Message type must be a non-empty string'};
    }

    if (typeof message.timestamp !== 'number' || message.timestamp <= 0) {
        return {valid: false, error: 'Message timestamp must be a valid number'};
    }

    return {valid: true};
};

const validatePayload = function (type, payload) {
    if (payload === null) {
        return {valid: false, error: 'Payload cannot be null or undefined'};
    }

    if (typeof payload !== 'object') {
        return {valid: false, error: 'Payload must be an object'};
    }

    switch (type) {
    case 'block-event':
        return validateBlockEventPayload(payload);

    case 'user-join':
    case 'username-change':
        if (!payload.id || typeof payload.id !== 'string') {
            return {valid: false, error: 'Missing or invalid user id'};
        }
        if (!payload.username || typeof payload.username !== 'string') {
            return {valid: false, error: 'Missing or invalid username'};
        }
        break;

    case 'kick-user':
        if (!payload.targetId || typeof payload.targetId !== 'string') {
            return {valid: false, error: 'Missing or invalid target id'};
        }
        break;

    case 'target-created':
    case 'target-deleted':
    case 'target-switch':
    case 'stage-costume-change':
    case 'costume-change':
        if (!payload.targetId || typeof payload.targetId !== 'string') {
            return {valid: false, error: 'Missing or invalid target id'};
        }
        break;

    case 'join-approved':
        if (!payload.roomId || typeof payload.roomId !== 'string') {
            return {valid: false, error: 'Missing or invalid room id'};
        }
        break;

    case 'join-request':
        if (!payload.requester || typeof payload.requester !== 'object') {
            return {valid: false, error: 'Missing or invalid requester info'};
        }
        if (!payload.requester.username || typeof payload.requester.username !== 'string') {
            return {valid: false, error: 'Missing or invalid requester username'};
        }
        break;

    case 'join-denied':
        if (payload.reason && typeof payload.reason !== 'string') {
            return {valid: false, error: 'Invalid reason format'};
        }
        break;

    case 'room-privacy':
        if (!payload.privacy || (payload.privacy !== 'public' && payload.privacy !== 'private')) {
            return {valid: false, error: 'Invalid privacy setting'};
        }
        break;

    case 'project-stream-start':
    case 'project-sync-start':
        if (!payload.totalSize || typeof payload.totalSize !== 'number' || payload.totalSize <= 0) {
            return {valid: false, error: 'Missing or invalid total size'};
        }
        if (!payload.checksum || typeof payload.checksum !== 'number') {
            return {valid: false, error: 'Missing or invalid checksum'};
        }
        if (!payload.format || (payload.format !== 'sb3' && payload.format !== 'json')) {
            return {valid: false, error: 'Invalid project format'};
        }
        if (typeof payload.targetInfo !== 'object' || !Array.isArray(payload.targetInfo)) {
            return {valid: false, error: 'Missing or invalid target info'};
        }
        break;

    case 'project-stream-data':
    case 'project-sync-chunk':
        if (!payload.data ||
                !(Array.isArray(payload.data) || ArrayBuffer.isView(payload.data))) {
            return {valid: false, error: 'Missing or invalid data'};
        }
        if (typeof payload.sequence !== 'number' || payload.sequence < 0) {
            return {valid: false, error: 'Missing or invalid sequence number'};
        }
        break;

    case 'project-stream-end':
    case 'project-sync-end':
        if (!payload.checksum || typeof payload.checksum !== 'number') {
            return {valid: false, error: 'Missing or invalid checksum'};
        }
        if (typeof payload.totalSent !== 'number' || payload.totalSent < 0) {
            return {valid: false, error: 'Missing or invalid total sent'};
        }
        break;

    case 'heart-beat':
    case 'heartbeat':
        if (!payload.timestamp || typeof payload.timestamp !== 'number') {
            return {valid: false, error: 'Missing or invalid heartbeat timestamp'};
        }
        break;

    case 'message-ack':
        if (!payload.messageId || typeof payload.messageId !== 'string') {
            return {valid: false, error: 'Missing or invalid message id'};
        }
        if (typeof payload.success !== 'boolean') {
            return {valid: false, error: 'Missing or invalid success flag'};
        }
        break;

    case 'cursor-move':
        if (typeof payload.x !== 'number' || typeof payload.y !== 'number') {
            return {valid: false, error: 'Missing or invalid cursor position'};
        }
        if (!payload.userId || typeof payload.userId !== 'string') {
            return {valid: false, error: 'Missing or invalid user id'};
        }
        break;

    case 'cursor-leave':
        if (!payload.userId || typeof payload.userId !== 'string') {
            return {valid: false, error: 'Missing or invalid user id'};
        }
        break;

    default:
        console.warn(`[Message Validator] Unknown message type: ${type}`);
        break;
    }

    return {valid: true};
};

const sanitizePayload = function (type, payload) {
    const sanitized = {...payload};

    const whitelistedProps = new Set([
        'eventId', 'eventOrigin', 'sender', 'timestamp', '_messageId',
        '_heartbeatId', 'event', 'targetName', 'targetId', 'id', 'username',
        'isHost', 'targetId', 'isStage', 'currentCostume', 'roomId',
        'roomPrivacy', 'privacy', 'totalSize', 'checksum', 'sequence',
        'syncTimestamp', 'syncSequence', 'format', 'targetInfo',
        'currentEditingTarget', 'loadedExtensions', 'extensionURLs',
        'stageWidth', 'stageHeight', 'data', 'totalSent', 'userId',
        'x', 'y', 'message', 'requester', 'reason'
    ]);

    Object.keys(sanitized).forEach(key => {
        if (!whitelistedProps.has(key)) {
            console.warn(`[Message Sanitizer] Removing unknown property from ${type}:`, key);
            delete sanitized[key];
        }
    });

    return sanitized;
};

const validateIncomingMessage = function (message) {
    const structureCheck = validateMessageStructure(message);
    if (!structureCheck.valid) {
        return {
            valid: false,
            error: structureCheck.error,
            message: null
        };
    }

    const payloadCheck = validatePayload(message.type, message.payload);
    if (!payloadCheck.valid) {
        return {
            valid: false,
            error: payloadCheck.error,
            type: message.type
        };
    }

    const sanitized = sanitizePayload(message.type, message.payload);

    return {
        valid: true,
        message: {
            type: message.type,
            payload: sanitized,
            sender: message.sender,
            timestamp: message.timestamp
        }
    };
};

export {
    validateIncomingMessage,
    validateMessageStructure,
    validatePayload,
    sanitizePayload
};
