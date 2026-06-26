import {
    StreamProcessor
} from './stream-utils.js';

const SYNC_COOLDOWN_MS = 5000;
const CHUNK_SIZE = 65536;

let _syncPendingPromise = null;

const syncState = {
    active: false,
    sequence: 0,
    lastClientSyncId: null
};

const sendProjectSync = async (service, conn) => {
    if (service.vm) {
        if (service._isShuttingDown && service._isShuttingDown()) {
            return false;
        }

        if (_syncPendingPromise) {
            await _syncPendingPromise;
            return false;
        }

        const initialState = service.getState ? service.getState() : 'UNKNOWN';
        if (initialState === 'SYNCING' || initialState === 'DISCONNECTING') {
            return false;
        }

        if (service.isSyncOperation) {
            console.trace();
            return false;
        }

        const timeSinceLastSync = Date.now() - service.lastSyncTime;
        if (service.lastSyncTime > 0 && timeSinceLastSync < SYNC_COOLDOWN_MS) {
            console.trace();
            return false;
        }

        if (service.scheduledSyncTimeout) {
            return false;
        }

        if (service._setState) {
            service._setState('SYNCING');
        }

        service.isSyncOperation = true;
        service.isApplyingRemoteChange = true;
        service.lastSyncTime = Date.now();
        syncState.sequence = syncState.sequence + 1;
        syncState.active = true;

        _syncPendingPromise = (async () => {
            try {
                service.emit('sync-lock', {locked: true});

                service.pendingSyncs = new Set();
                if (conn) {
                    service.pendingSyncs.add(conn.peer);
                } else {
                    service.connections.forEach((c, peerId) => {
                        if (c.open) service.pendingSyncs.add(peerId);
                    });
                }

                if (service.isHost && service.pendingSyncs.size > 0) {
                    service.emit('project-sync-wait', {message: `Waiting for ${service.pendingSyncs.size} clients...`});
                }

                const arrayBuffer = await service.vm.saveProjectSb3('arraybuffer', {
                    allowOptimization: false
                });

                const calculateChecksum = buffer => {
                    const view = new Uint8Array(buffer);
                    let crc = 0xFFFFFFFF;
                    for (let i = 0; i < view.length; i++) {
                        crc ^= view[i];
                        for (let j = 0; j < 8; j++) {
                            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
                        }
                    }
                    return crc ^ 0xFFFFFFFF;
                };

                const size = arrayBuffer.byteLength;
                const checksum = calculateChecksum(arrayBuffer);
                const allData = new Uint8Array(arrayBuffer);

                const targetInfo = service.vm.runtime.targets.map(target => ({
                    id: target.id,
                    name: target.getName(),
                    isOriginal: target.isOriginal,
                    visible: target.visible,
                    x: target.x,
                    y: target.y,
                    isStage: target.isStage,
                    layerOrder: target.layerOrder || 0,
                    direction: target.direction,
                    size: target.size,
                    currentCostume: target.currentCostume
                }));
                const currentEditingTarget = service.vm.editingTarget ? service.vm.editingTarget.id : null;

                const loadedExtensions = Array.from(service.vm.extensionManager._loadedExtensions.keys());
                const extensionURLs = service.vm.extensionManager.getExtensionURLs();

                const stageWidth = service.vm.runtime.stageWidth;
                const stageHeight = service.vm.runtime.stageHeight;

                service.sendMessage('project-stream-start', {
                    totalSize: size,
                    checksum,
                    targetInfo,
                    currentEditingTarget,
                    loadedExtensions,
                    extensionURLs,
                    stageWidth,
                    stageHeight,
                    syncTimestamp: service.lastSyncTime,
                    syncSequence: syncState.sequence,
                    format: 'sb3',
                    includeChunking: true
                }, conn);

                if (service.connections.size === 0) {
                    return true;
                }

                const totalChunks = Math.ceil(size / CHUNK_SIZE);
                let bytesSent = 0;

                for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                    const startByte = chunkIndex * CHUNK_SIZE;
                    const endByte = Math.min(startByte + CHUNK_SIZE, size);
                    const chunkLength = endByte - startByte;
                    const chunkData = allData.subarray(startByte, endByte);

                    const payload = {
                        sequence: chunkIndex,
                        data: Array.from(chunkData),
                        syncTimestamp: service.lastSyncTime,
                        syncSequence: syncState.sequence,
                        isLastChunk: chunkIndex === totalChunks - 1
                    };

                    service.sendMessage('project-stream-data', payload, conn);

                    bytesSent += chunkLength;
                    const progress = Math.round((bytesSent / size) * 100);

                    service.emit('project-sync-upload-progress', {
                        progress,
                        sentBytes: bytesSent,
                        totalSize: size,
                        chunksCompleted: chunkIndex + 1,
                        totalChunks
                    });
                }

                service.sendMessage('project-stream-end', {
                    totalSent: size,
                    checksum,
                    syncTimestamp: service.lastSyncTime,
                    syncSequence: syncState.sequence
                }, conn);

                return true;

            } catch (error) {
                console.error('[Stream Sync] Failed to create project stream:', error);
                service.emit('sync-failed', {error});
                return false;
            } finally {
                service.isSyncOperation = false;
                service.isApplyingRemoteChange = false;
                service.isLoadingProject = false;
                /* eslint-disable-next-line require-atomic-updates */
                syncState.active = false;

                service.emit('sync-lock', {locked: false});
                _syncPendingPromise = null;

                if (service.getState && service.getState() === 'SYNCING') {
                    if (service._setState) {
                        service._setState('CONNECTED');
                    }
                }
            }
        })();

        return _syncPendingPromise;
    }
    return false;
};

/* eslint-disable require-atomic-updates */
const processCompleteProject = (service, projectData, targetInfo, currentEditingTarget, format,
    loadedExtensions, extensionURLs, stageWidth, stageHeight, syncSequence) => {
    if (syncSequence && syncState.lastClientSyncId) {
        console.warn('[Stream Sync] Potential sync conflict detected:', {
            lastSync: syncState.lastClientSyncId,
            newSync: syncSequence
        });
    }

    const wasAttachedToWorkspace = !!service.workspace;
    service.isApplyingRemoteChange = true;
    service.isSyncOperation = true;
    service.isLoadingProject = true;
    syncState.lastClientSyncId = syncSequence;

    if (wasAttachedToWorkspace) {
        service.detachFromWorkspace();
    }

    const progressHandler = (finished, total) => {
        if (total > 0) {
            const progress = Math.round((finished / total) * 100);
            const finishedMB = Math.round((finished / 1024 / 1024 * 10)) / 10;
            const totalMB = Math.round((total / 1024 / 1024 * 10)) / 10;
            service.emit('project-sync-download-progress', {
                phase: 'loading',
                progress: Math.min(90, progress),
                message: `Loading ${finishedMB}M / ${totalMB}M...`
            });
        }
    };

    service.vm.on('ASSET_PROGRESS', progressHandler);

    let loadPromise;

    if (format === 'sb3') {
        loadPromise = service.vm.loadProject(projectData);
    } else {
        if (projectData.targets && targetInfo) {
            projectData.targets.forEach((targetData, i) => {
                if (targetInfo[i] && targetInfo[i].id) {
                    targetData.id = targetInfo[i].id;
                }
            });
        }
        loadPromise = service.vm.loadProject(projectData);
    }

    loadPromise.then(async () => {
        service.vm.off('ASSET_PROGRESS', progressHandler);

        if (stageWidth && stageHeight && service.vm.setStageSize) {
            service.vm.setStageSize(stageWidth, stageHeight);
        }

        if (loadedExtensions && loadedExtensions.length > 0) {
            for (const extId of loadedExtensions) {
                if (!service.vm.extensionManager.isExtensionLoaded(extId)) {
                    try {
                        if (service.vm.extensionManager.isBuiltinExtension &&
                            service.vm.extensionManager.isBuiltinExtension(extId)) {
                            service.vm.extensionManager.loadExtensionIdSync(extId);
                        } else if (extensionURLs && extensionURLs[extId]) {
                            await service.vm.extensionManager.loadExtensionURL(extensionURLs[extId]);
                        } else {
                            try {
                                service.vm.extensionManager.loadExtensionIdSync(extId);
                            } catch (e2) {
                                console.warn(`[Stream Sync] Failed to load extension ${extId} (fallback):`, e2);
                            }
                        }
                    } catch (error) {
                        console.error(`[Stream Sync] Failed to load extension ${extId}:`, error);
                    }
                }
            }

            if (service.vm.extensionManager.reorderExtension) {
                const currentKeys = Array.from(service.vm.extensionManager._loadedExtensions.keys());
                for (let targetIndex = 0; targetIndex < loadedExtensions.length; targetIndex++) {
                    const extId = loadedExtensions[targetIndex];
                    const currentIndex = currentKeys.indexOf(extId);
                    if (currentIndex !== -1 && currentIndex !== targetIndex) {
                        try {
                            service.vm.extensionManager.reorderExtension(currentIndex, targetIndex);
                            currentKeys.splice(currentIndex, 1);
                            currentKeys.splice(targetIndex, 0, extId);
                        } catch (e) {
                            console.warn(`[Stream Sync] Failed to reorder extension ${extId}:`, e);
                        }
                    }
                }
            }

            service.emit('project-sync-download-progress', {
                phase: 'extensions',
                progress: 95,
                message: 'Loading extensions...'
            });
        } else {
            service.emit('project-sync-download-progress', {progress: 100});
        }

        setTimeout(() => {
            service.emit('project-sync-download-complete');
        }, 200);

        if (format !== 'sb3' && targetInfo) {
            const newTargetMapping = {};
            targetInfo.forEach((targetInfoItem, i) => {
                const actualTarget = service.vm.runtime.targets[i];
                if (actualTarget) {
                    newTargetMapping[targetInfoItem.id] = actualTarget.id;
                }
            });
            service.targetMapping = newTargetMapping;
        }

        if (currentEditingTarget) {
            const targetExists = service.vm.runtime.getTargetById(currentEditingTarget);
            if (targetExists) {
                service.vm.setEditingTarget(currentEditingTarget);
            }
        }

        service.isSyncOperation = false;
        service.isApplyingRemoteChange = false;
        syncState.active = false;
        service.emit('sync-lock', {locked: false});

        if (wasAttachedToWorkspace) {
            service.emit('request-workspace-reattach');
        }

        if (service._setState) {
            service._setState('CONNECTED');
        }

        service.emit('project-synced');
        if (service.hostId) {
            try {
                service.sendMessage('client-sync-complete', {
                    timestamp: Date.now(),
                    syncSequence: syncSequence
                }, service.hostId);
            } catch (error) {
                console.error('[Stream Sync] Failed to send sync complete:', error);
            }
        }

        service.emit('project-sync-wait', {message: 'Waiting for host...'});

        await new Promise(resolve => {
            const handler = () => {
                service.off('session-ready', handler);
                resolve();
            };
            const timeout = setTimeout(() => {
                service.off('session-ready', handler);
                console.warn('[Sync Barrier] Timed out waiting for host!');
                resolve();
            }, 30000);

            service.on('session-ready', () => {
                clearTimeout(timeout);
                handler();
            });
        });

        service.emit('session-ready');
        service.isLoadingProject = false;
    }).catch(error => {
        service.vm.off('ASSET_PROGRESS', progressHandler);
        console.error('[Stream Sync] Failed to load project:', error);
        service.isApplyingRemoteChange = false;
        service.isSyncOperation = false;
        syncState.active = false;
        service.isLoadingProject = false;
        service.emit('sync-lock', {locked: false});
        if (wasAttachedToWorkspace) {
            service.emit('request-workspace-reattach');
        }
        service.emit('sync-failed', {error});
        service.streamProcessor = null;
        syncState.lastClientSyncId = null;
    });
};

const handleProjectStreamStart = (service, payload) => {
    if (!service.isHost && service.vm) {
        const receiveState = service.getState ? service.getState() : 'UNKNOWN';
        if (receiveState === 'SYNCING' || receiveState === 'DISCONNECTING') {
            console.warn(`[Stream Sync] Cannot process sync while in state: ${receiveState}`);
            return;
        }

        if (service.isSyncOperation || service.isApplyingRemoteChange || service.isLoadingProject) {
            console.warn('[Stream Sync] Already processing a sync, ignoring new stream-start');
            return;
        }

        if (payload.syncSequence && syncState.lastClientSyncId === payload.syncSequence) {
            console.warn('[Stream Sync] Ignoring duplicate sync from same sequence:', payload.syncSequence);
            return;
        }

        if (service._setState) {
            service._setState('SYNCING');
        }

        service.emit('sync-lock', {locked: true});

        if (service.vm) {
            service.vm.emit('PROJECT_LOADING');
        }

        if (!service.streamProcessor) {
            service.streamProcessor = new StreamProcessor();
        }

        const syncSequence = payload.syncSequence || syncState.sequence;
        service.streamProcessor.start(payload.totalSize, payload.checksum);
        service.streamProcessor.onProgress = progress => {
            service.emit('project-sync-download-progress', progress);
        };

        service.streamProcessor.onComplete = async projectData => {
            await processCompleteProject(
                service,
                projectData,
                payload.targetInfo,
                payload.currentEditingTarget,
                payload.format,
                payload.loadedExtensions,
                payload.extensionURLs,
                payload.stageWidth,
                payload.stageHeight,
                syncSequence
            );
            service.streamProcessor = null;
        };

        service.streamProcessor.onError = error => {
            console.error('[Stream Sync] Stream processing error:', error);
            service.isApplyingRemoteChange = false;
            service.isSyncOperation = false;
            syncState.active = false;
            service.isLoadingProject = false;
            syncState.lastClientSyncId = null;
            service.emit('sync-lock', {locked: false});
            service.emit('sync-failed', {error});
            service.streamProcessor = null;
            if (service._setState && service._isShuttingDown && !service._isShuttingDown()) {
                service._setState('CONNECTED');
            }
        };

        service.emit('project-sync-download-start', {
            totalSize: payload.totalSize,
            totalChunks: payload.includeChunking ? Math.ceil(payload.totalSize / 65536) : 1
        });
    }
};
/* eslint-enable require-atomic-updates */

const handleProjectStreamData = (service, payload) => {
    if (!service.isHost && service.vm && service.streamProcessor) {
        try {
            const data = payload.data;
            if (Array.isArray(data) && data.length > 0) {
                service.streamProcessor.processChunk(data);
            }
        } catch (error) {
            console.error('[Stream Sync] Failed to process stream data:', error);
            service.emit('sync-failed', {error: 'Failed to process stream data'});
        }
    } else {
        console.warn('[Stream Sync] Cannot process data:', {
            isHost: service.isHost,
            hasVm: !!service.vm,
            hasStreamProcessor: !!service.streamProcessor
        });
    }
};

const handleProjectStreamEnd = service => {
    if (!service.isHost && service.vm && service.streamProcessor) {
        service.streamProcessor.complete();
    }
};

const debugTargetStates = service => {
    if (!service.vm || !service.vm.runtime) {
        return {targets: [], editingTarget: null};
    }
    const targets = service.vm.runtime.targets.map(target => ({
        id: target.id,
        name: target.getName(),
        isOriginal: target.isOriginal,
        visible: target.visible
    }));
    const editingTarget = service.vm.editingTarget ? {
        id: service.vm.editingTarget.id,
        name: service.vm.editingTarget.getName()
    } : null;
    return {targets, editingTarget};
};

export {
    sendProjectSync,
    handleProjectStreamStart as handleProjectSyncStart,
    handleProjectStreamData as handleProjectSyncChunk,
    handleProjectStreamEnd,
    debugTargetStates
};
