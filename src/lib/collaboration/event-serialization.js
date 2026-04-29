const serializeEvent = (service, event) => {
    const json = event.toJson();

    if (event.type === 'move') {
        if (event.oldParentId) json.oldParentId = event.oldParentId;
        if (event.oldInputName) json.oldInputName = event.oldInputName;
        if (event.oldCoordinate) {
            json.oldCoordinate = `${Math.round(event.oldCoordinate.x)},${Math.round(event.oldCoordinate.y)}`;
        }
    }

    if (event.type === 'change') {
        if (typeof event.newValue !== 'undefined') json.newValue = event.newValue;
        if (typeof event.oldValue !== 'undefined') json.oldValue = event.oldValue;
        if (event.name) json.name = event.name;
        if (event.element) json.element = event.element;
    }

    if (event.type === 'comment_create') {
        if (event.xy) {
            json.xy = {x: event.xy.x, y: event.xy.y};
        }
        if (event.commentId) json.commentId = event.commentId;
        if (event.blockId) json.blockId = event.blockId;
        if (typeof event.text !== 'undefined') json.text = event.text;
        if (typeof event.width !== 'undefined') json.width = event.width;
        if (typeof event.height !== 'undefined') json.height = event.height;
        if (typeof event.minimized !== 'undefined') json.minimized = event.minimized;
        if (event.xml) {
            const ScratchBlocks = window.ScratchBlocks;
            if (ScratchBlocks && ScratchBlocks.Xml && ScratchBlocks.Xml.domToText) {
                json.xml = ScratchBlocks.Xml.domToText(event.xml);
            } else if (event.xml.outerHTML) {
                json.xml = event.xml.outerHTML;
            }
        }
    }

    if (event.type === 'comment_delete') {
        if (event.commentId) json.commentId = event.commentId;
        if (event.blockId) json.blockId = event.blockId;
    }

    if (event.type === 'comment_move') {
        if (event.commentId) json.commentId = event.commentId;
        if (event.newCoordinate_) {
            json.newCoordinate = `${Math.round(event.newCoordinate_.x)},${Math.round(event.newCoordinate_.y)}`;
        }
    }

    if (event.type === 'comment_change') {
        if (typeof event.oldContents_ !== 'undefined') json.oldContents = event.oldContents_;
        if (typeof event.newContents_ !== 'undefined') json.newContents = event.newContents_;
        if (typeof event.oldContents !== 'undefined') json.oldContents = event.oldContents;
        if (typeof event.newContents !== 'undefined') json.newContents = event.newContents;
        if (event.commentId) json.commentId = event.commentId;
    }

    if (event.type === 'var_create') {
        if (typeof event.varType !== 'undefined') json.varType = event.varType;
        if (typeof event.varName !== 'undefined') json.varName = event.varName;
        if (typeof event.isLocal !== 'undefined') json.isLocal = event.isLocal;
        if (typeof event.isCloud !== 'undefined') json.isCloud = event.isCloud;
        if (event.varId) json.varId = event.varId;
    }

    if (event.type === 'var_delete') {
        if (typeof event.varType !== 'undefined') json.varType = event.varType;
        if (typeof event.varName !== 'undefined') json.varName = event.varName;
        if (typeof event.isLocal !== 'undefined') json.isLocal = event.isLocal;
        if (typeof event.isCloud !== 'undefined') json.isCloud = event.isCloud;
        if (event.varId) json.varId = event.varId;
    }

    if (event.type === 'var_rename') {
        if (typeof event.oldName !== 'undefined') json.oldName = event.oldName;
        if (typeof event.newName !== 'undefined') json.newName = event.newName;
        if (event.varId) json.varId = event.varId;
    }

    const target = service.vm.editingTarget;
    if (target) {
        json.targetName = target.getName();
    }
    return json;
};

const reconstructEvent = (service, serializedEvent) => {
    if (!serializedEvent) {
        return null;
    }

    if (!service.workspace) {
        return null;
    }

    const ScratchBlocks = window.ScratchBlocks;

    if (!ScratchBlocks || !ScratchBlocks.Events || !ScratchBlocks.Events.fromJson) {
        return null;
    }

    try {
        const event = ScratchBlocks.Events.fromJson(serializedEvent, service.workspace);

        if (event.type === 'move' && serializedEvent.oldCoordinate) {
            const xy = serializedEvent.oldCoordinate.split(',');
            event.oldCoordinate = {x: parseFloat(xy[0]), y: parseFloat(xy[1])};
        }
        if (event.type === 'move' && serializedEvent.oldParentId) {
            event.oldParentId = serializedEvent.oldParentId;
        }
        if (event.type === 'move' && serializedEvent.oldInputName) {
            event.oldInputName = serializedEvent.oldInputName;
        }

        if (event.type === 'change') {
            if (typeof serializedEvent.newValue !== 'undefined') event.newValue = serializedEvent.newValue;
            if (typeof serializedEvent.oldValue !== 'undefined') event.oldValue = serializedEvent.oldValue;
            if (serializedEvent.name) event.name = serializedEvent.name;
            if (serializedEvent.element) event.element = serializedEvent.element;
        }

        if (event.type === 'comment_create') {
            if (serializedEvent.xy) event.xy = serializedEvent.xy;
            if (serializedEvent.commentId) event.commentId = serializedEvent.commentId;
            if (serializedEvent.blockId) event.blockId = serializedEvent.blockId;
            if (typeof serializedEvent.text !== 'undefined') event.text = serializedEvent.text;
            if (typeof serializedEvent.width !== 'undefined') event.width = serializedEvent.width;
            if (typeof serializedEvent.height !== 'undefined') event.height = serializedEvent.height;
            if (typeof serializedEvent.minimized !== 'undefined') event.minimized = serializedEvent.minimized;
            if (serializedEvent.xml && !event.xml) {
                try {
                    event.xml = ScratchBlocks.Xml.textToDom(`<xml>${serializedEvent.xml}</xml>`).firstChild;
                } catch (e) {
                    // XML parsing failed
                }
            }
        }

        if (event.type === 'comment_delete') {
            if (serializedEvent.commentId) event.commentId = serializedEvent.commentId;
            if (serializedEvent.blockId) event.blockId = serializedEvent.blockId;
        }

        if (event.type === 'comment_move') {
            if (serializedEvent.commentId) event.commentId = serializedEvent.commentId;
            if (serializedEvent.newCoordinate) {
                const xy = serializedEvent.newCoordinate.split(',');
                event.newCoordinate_ = {x: parseFloat(xy[0]), y: parseFloat(xy[1])};
                event.newCoordinate = event.newCoordinate_;
            }
        }

        if (event.type === 'comment_change') {
            if (typeof serializedEvent.oldContents !== 'undefined') event.oldContents_ = serializedEvent.oldContents;
            if (typeof serializedEvent.newContents !== 'undefined') event.newContents_ = serializedEvent.newContents;
            if (serializedEvent.commentId) event.commentId = serializedEvent.commentId;
        }

        if (event.type === 'var_create') {
            if (typeof serializedEvent.varType !== 'undefined') event.varType = serializedEvent.varType;
            if (typeof serializedEvent.varName !== 'undefined') event.varName = serializedEvent.varName;
            if (typeof serializedEvent.isLocal !== 'undefined') event.isLocal = serializedEvent.isLocal;
            if (typeof serializedEvent.isCloud !== 'undefined') event.isCloud = serializedEvent.isCloud;
            if (serializedEvent.varId) event.varId = serializedEvent.varId;
        }

        if (event.type === 'var_delete') {
            if (typeof serializedEvent.varType !== 'undefined') event.varType = serializedEvent.varType;
            if (typeof serializedEvent.varName !== 'undefined') event.varName = serializedEvent.varName;
            if (typeof serializedEvent.isLocal !== 'undefined') event.isLocal = serializedEvent.isLocal;
            if (typeof serializedEvent.isCloud !== 'undefined') event.isCloud = serializedEvent.isCloud;
            if (serializedEvent.varId) event.varId = serializedEvent.varId;
        }

        if (event.type === 'var_rename') {
            if (typeof serializedEvent.oldName !== 'undefined') event.oldName = serializedEvent.oldName;
            if (typeof serializedEvent.newName !== 'undefined') event.newName = serializedEvent.newName;
            if (serializedEvent.varId) event.varId = serializedEvent.varId;
        }

        return event;
    } catch (error) {
        return null;
    }
};

const shouldSyncEvent = (service, event) => {
    if (!event || !event.type) {
        return false;
    }

    const syncableEvents = [
        'create', 'delete', 'change', 'move',
        'var_create', 'var_delete', 'var_rename',
        'comment_create', 'comment_delete', 'comment_change', 'comment_move'
    ];

    if (!syncableEvents.includes(event.type)) {
        return false;
    }

    if (event.type === 'change') {
        if (event.element === 'select' || event.element === 'click') {
            return false;
        }
    }

    if (event.type === 'create') {
        if (event.xml && typeof event.xml === 'object' && event.xml.nodeName === 'shadow') {
            return false;
        }
    }

    return true;
};

export {
    serializeEvent,
    reconstructEvent,
    shouldSyncEvent
};
