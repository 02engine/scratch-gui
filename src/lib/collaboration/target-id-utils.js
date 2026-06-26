const getTargetIdForMessage = (service, localTargetId) => {
    if (!localTargetId) return null;
    
    if (!service.isHost && service.targetMapping) {
        const hostTargetId = Object.keys(service.targetMapping).find(
            hostId => service.targetMapping[hostId] === localTargetId
        );
        if (hostTargetId) {
            return hostTargetId;
        }
    }
    
    return localTargetId;
};

const getLocalTargetId = (service, messageTargetId) => {
    if (!messageTargetId) return null;
    
    if (!service.isHost && service.targetMapping) {
        const localId = service.targetMapping[messageTargetId];
        if (localId) {
            return localId;
        }
    }
    
    return messageTargetId;
};

export {
    getTargetIdForMessage,
    getLocalTargetId
};
