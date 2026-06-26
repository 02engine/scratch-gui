import {
    setupCursorLayer,
    bindCursorEvents,
    bindViewportSyncListeners,
    updateAllRemoteCursorPositions,
    unbindCursorEvents,
    unbindViewportSyncListeners,
    destroyCursorLayer
} from './cursor-sync.js';

const TEXT_INPUT_DEBOUNCE_MS = 300;

let customBlockRefreshTimer = null;

const attachToWorkspace = (service, workspace) => {
    if (!workspace) return;
    if (service.workspace === workspace) return;

    try {
        service.workspace = workspace;

        if (!service._textInputDebounce) {
            service._textInputDebounce = new Map();
        }

        const originalBlockListener = service.collaborationBlockListener.bind(service);

        service._wrappedBlockListener = event => {
            if (service._isShuttingDown && service._isShuttingDown()) {
                return;
            }

            if (event.type === 'change' && event.element === 'field' && event.name && event.blockId) {
                const block = service.workspace && service.workspace.getBlockById ?
                    service.workspace.getBlockById(event.blockId) : null;

                if (block) {
                    const field = block.getField(event.name);
                    const isTextInput = field && field.constructor &&
                        (field.constructor.name === 'FieldTextInput' ||
                            field.constructor.name === 'FieldTextInputRepeatable' ||
                            field.constructor.name === 'FieldNumber');

                    if (isTextInput) {
                        const debounceKey = `${event.blockId}-${event.name}`;

                        const existingTimer = service._textInputDebounce.get(debounceKey);
                        if (existingTimer) {
                            clearTimeout(existingTimer);
                        }

                        const timer = setTimeout(() => {
                            service._textInputDebounce.delete(debounceKey);
                            if (block && field) {
                                const currentValue = field.getValue();
                                event.newValue = currentValue;
                                try {
                                    originalBlockListener(event);
                                } catch (e) {
                                    // ignore
                                }
                            }
                        }, TEXT_INPUT_DEBOUNCE_MS);

                        service._textInputDebounce.set(debounceKey, timer);
                        return;
                    }
                }
            }

            return originalBlockListener(event);
        };

        workspace.addChangeListener(service._wrappedBlockListener);
        setupCursorLayer(service);
        bindCursorEvents(service);
        bindViewportSyncListeners(service);

        if (service.workspace.scrollbar && service.workspace.scrollbar.set && !service._origScrollbarSet) {
            const sb = service.workspace.scrollbar;
            service._origScrollbarSet = sb.set.bind(sb);
            sb.set = function (x, y) {
                service._origScrollbarSet(x, y);
                try {
                    updateAllRemoteCursorPositions(service);
                } catch (e) {
                    // ignore
                }
            };
        }

        if (service.workspace.setScale && !service._origSetScale) {
            service._origSetScale = service.workspace.setScale.bind(service.workspace);
            service.workspace.setScale = function (scale) {
                service._origSetScale(scale);
                try {
                    updateAllRemoteCursorPositions(service);
                } catch (e) {
                    // ignore
                }
            };
        }
    } catch (error) {
        // ignore
    }
};

const detachFromWorkspace = service => {
    if (!service.workspace) return;

    try {
        if (service._textInputDebounce) {
            service._textInputDebounce.forEach(timer => clearTimeout(timer));
            service._textInputDebounce.clear();
        }

        if (customBlockRefreshTimer) {
            clearTimeout(customBlockRefreshTimer);
            customBlockRefreshTimer = null;
        }

        if (service.workspace) {
            if (service._wrappedBlockListener) {
                service.workspace.removeChangeListener(service._wrappedBlockListener);
                delete service._wrappedBlockListener;
            } else {
                try {
                    service.workspace.removeChangeListener(service.collaborationBlockListener);
                } catch (e) {
                    // ignore
                }
            }
        }
        unbindCursorEvents(service);
        unbindViewportSyncListeners(service);
        if (service.workspace && service.workspace.scrollbar && service._origScrollbarSet) {
            service.workspace.scrollbar.set = service._origScrollbarSet;
            service._origScrollbarSet = null;
        }
        if (service.workspace && service._origSetScale) {
            service.workspace.setScale = service._origSetScale;
            service._origSetScale = null;
        }
        destroyCursorLayer(service);
        service.workspace = null;
        service._customBlockRefreshPending = false;
    } catch (_error) {
        try {
            destroyCursorLayer(service);
        } catch (_e) {
            // ignore
        }
    }
};

const attemptWorkspaceAttachment = (service, context, retries = 10) => {
    if (service.workspace) return;

    if (retries <= 0) {
        service.emit('workspace-attachment-failed', {context});
        return;
    }

    if (window.Blockly && window.Blockly.getMainWorkspace && window.Blockly.getMainWorkspace()) {
        service.attachToWorkspace(window.Blockly.getMainWorkspace());
        return;
    }

    setTimeout(() => {
        attemptWorkspaceAttachment(service, `${context} (retry ${11 - retries})`, retries - 1);
    }, 1000);
};

export {
    attachToWorkspace,
    detachFromWorkspace,
    attemptWorkspaceAttachment
};
