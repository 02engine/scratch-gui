const wrapVMAssetMethods = service => {
    const vm = service.vm;
    if (!vm) return;
    const self = service;

    const wrap = (obj, methodName, handler) => {
        const original = obj[methodName].bind(obj);
        obj[methodName] = function (...args) {
            const result = original(...args);
            if (!self.isConnected || self.isApplyingRemoteChange ||
                self.isSyncOperation || self.isLoadingProject) return result;
            try {
                handler(args, result);
            } catch (e) {
                console.warn('Error in asset event handler for', methodName, e);
            }
            return result;
        };
    };

    const getTargetInfo = optTargetId => {
        const target = optTargetId ? vm.runtime.getTargetById(optTargetId) : vm.editingTarget;
        return {
            targetId: target ? target.id : null,
            targetName: target ? target.getName() : null,
            isStage: target ? target.isStage : false
        };
    };

    wrap(vm, 'addSprite', (args, result) => {
        Promise.resolve(result).then(() => {
            if (service.isApplyingRemoteChange) return;

            const target = vm.editingTarget;
            if (!target || target.isStage) return;

            const json = target.toJSON();
            if (!json.objName) json.objName = target.getName();

            const costumesData = [];
            const soundsData = [];
            const storage = vm.storage || (vm.runtime && vm.runtime.storage);

            if (json.costumes && json.costumes.length > 0) {
                json.costumes.forEach((costume, index) => {
                    if (storage && costume.asset && costume.asset.data) {
                        const assetData = costume.asset.data;
                        if (assetData instanceof ArrayBuffer) {
                            costumesData[index] = Array.from(new Uint8Array(assetData));
                        } else if (assetData instanceof Uint8Array) {
                            costumesData[index] = Array.from(assetData);
                        }
                    }
                });
            }

            if (json.sounds && json.sounds.length > 0) {
                json.sounds.forEach((sound, index) => {
                    if (storage && sound.asset && sound.asset.data) {
                        const assetData = sound.asset.data;
                        if (assetData instanceof ArrayBuffer) {
                            soundsData[index] = Array.from(new Uint8Array(assetData));
                        } else if (assetData instanceof Uint8Array) {
                            soundsData[index] = Array.from(assetData);
                        }
                    }
                });
            }

            self.sendMessage('asset-event', {
                kind: 'sprite-create',
                jsonData: json,
                targetName: target.getName(),
                targetId: target.id,
                costumesData,
                soundsData
            });
        });
    });

    const originalDeleteSprite = vm.deleteSprite.bind(vm);
    vm.deleteSprite = function (targetId) {
        let targetName = null;
        if (vm.runtime) {
            const target = vm.runtime.getTargetById(targetId);
            if (target) targetName = target.getName();
        }

        const result = originalDeleteSprite(targetId);

        if (self.isConnected && !self.isApplyingRemoteChange &&
            !self.isSyncOperation && !self.isLoadingProject) {
            self.sendMessage('asset-event', {
                kind: 'sprite-delete',
                targetId,
                targetName
            });
        }
        return result;
    };

    wrap(vm, 'duplicateSprite', (args, result) => {
        Promise.resolve(result).then(() => {
            if (service.isApplyingRemoteChange) return;
            const target = vm.editingTarget;
            if (!target || target.isStage) return;

            const json = target.toJSON();

            const costumesData = [];
            const soundsData = [];
            const storage = vm.storage || (vm.runtime && vm.runtime.storage);

            if (json.costumes && json.costumes.length > 0) {
                json.costumes.forEach((costume, index) => {
                    if (storage && costume.asset && costume.asset.data) {
                        const assetData = costume.asset.data;
                        if (assetData instanceof ArrayBuffer) {
                            costumesData[index] = Array.from(new Uint8Array(assetData));
                        } else if (assetData instanceof Uint8Array) {
                            costumesData[index] = Array.from(assetData);
                        }
                    }
                });
            }

            if (json.sounds && json.sounds.length > 0) {
                json.sounds.forEach((sound, index) => {
                    if (storage && sound.asset && sound.asset.data) {
                        const assetData = sound.asset.data;
                        if (assetData instanceof ArrayBuffer) {
                            soundsData[index] = Array.from(new Uint8Array(assetData));
                        } else if (assetData instanceof Uint8Array) {
                            soundsData[index] = Array.from(assetData);
                        }
                    }
                });
            }

            self.sendMessage('asset-event', {
                kind: 'sprite-create',
                jsonData: json,
                targetName: target.getName(),
                targetId: target.id,
                costumesData,
                soundsData,
                isDuplicate: true
            });
        });
    });

    const originalRenameSprite = vm.renameSprite.bind(vm);
    vm.renameSprite = function (targetId, newName) {
        let oldName = null;
        if (vm.runtime) {
            const target = vm.runtime.getTargetById(targetId);
            if (target) oldName = target.getName();
        }

        const result = originalRenameSprite(targetId, newName);

        if (self.isConnected && !self.isApplyingRemoteChange &&
            !self.isSyncOperation && !self.isLoadingProject) {
            self.sendMessage('asset-event', {
                kind: 'sprite-rename',
                targetId,
                targetName: oldName,
                newName
            });
        }
        return result;
    };

    wrap(vm, 'reorderTarget', args => {
        const [targetIndex, newIndex] = args;
        self.sendMessage('asset-event', {
            kind: 'sprite-reorder',
            targetIndex,
            newIndex
        });
    });

    if (vm.extensionManager) {
        wrap(vm.extensionManager, 'removeExtension', args => {
            const [extensionId] = args;
            self.sendMessage('asset-event', {
                kind: 'extension-remove',
                extensionId
            });
        });
        wrap(vm.extensionManager, 'reorderExtension', args => {
            const [index, newIndex] = args;
            const keys = Array.from(vm.extensionManager._loadedExtensions.keys());
            const extensionId = keys[index];

            if (extensionId) {
                self.sendMessage('asset-event', {
                    kind: 'extension-reorder',
                    extensionId,
                    newIndex
                });
            }
        });
    }

    wrap(vm, 'addCostume', (args, result) => {
        const [md5ext, costumeObject, optTargetId] = args;
        const {targetId, targetName, isStage} = getTargetInfo(optTargetId);
        const c = costumeObject || {};

        const sendCostumeEvent = assetData => {
            const payload = {
                kind: 'costume-add',
                targetId,
                targetName,
                costume: {
                    name: c.name,
                    md5: c.md5 || (c.assetId && c.dataFormat ? `${c.assetId}.${c.dataFormat}` : md5ext),
                    dataFormat: c.dataFormat,
                    rotationCenterX: c.rotationCenterX,
                    rotationCenterY: c.rotationCenterY,
                    bitmapResolution: c.bitmapResolution,
                    assetId: c.assetId
                },
                assetData,
                isStage
            };
            self.sendMessage('asset-event', payload);
        };

        Promise.resolve(result).then(() => {
            if (c.asset && c.asset.data) {
                const data = c.asset.data;
                if (data instanceof ArrayBuffer) {
                    sendCostumeEvent(Array.from(new Uint8Array(data)));
                } else if (data instanceof Uint8Array) {
                    sendCostumeEvent(Array.from(data));
                } else {
                    sendCostumeEvent(null);
                }
            } else {
                sendCostumeEvent(null);
            }
        });
    });
    wrap(vm, 'addCostumeFromLibrary', (args, result) => {
        const [md5ext, costumeObject] = args;
        const {targetId, targetName, isStage} = getTargetInfo(null);
        const c = costumeObject || {};

        const sendCostumeEvent = assetData => {
            const payload = {
                kind: 'costume-add',
                targetId,
                targetName,
                costume: {
                    name: c.name,
                    md5: c.md5 || md5ext,
                    dataFormat: c.dataFormat,
                    rotationCenterX: c.rotationCenterX,
                    rotationCenterY: c.rotationCenterY,
                    bitmapResolution: c.bitmapResolution,
                    assetId: c.assetId
                },
                assetData,
                isStage,
                fromLibrary: true
            };
            self.sendMessage('asset-event', payload);
        };

        Promise.resolve(result).then(() => {
            if (c.asset && c.asset.data) {
                const data = c.asset.data;
                if (data instanceof ArrayBuffer) {
                    sendCostumeEvent(Array.from(new Uint8Array(data)));
                } else if (data instanceof Uint8Array) {
                    sendCostumeEvent(Array.from(data));
                } else {
                    sendCostumeEvent(null);
                }
            } else {
                sendCostumeEvent(null);
            }
        });
    });
    wrap(vm, 'deleteCostume', args => {
        const [index] = args;
        const target = vm.editingTarget;
        const targetId = target ? target.id : null;
        const targetName = target ? target.getName() : null;
        const costume = target && target.getCostumes ? target.getCostumes()[index] : null;
        const payload = {
            kind: 'costume-delete',
            targetId,
            targetName,
            index,
            md5: costume && (costume.md5 ||
                (
                    costume.assetId && costume.dataFormat ?
                        `${costume.assetId}.${costume.dataFormat}` :
                        null
                )
            ),
            name: costume && costume.name,
            isStage: target ? target.isStage : false
        };
        self.sendMessage('asset-event', payload);
    });
    wrap(vm, 'renameCostume', args => {
        const [index, newName] = args;
        const {targetId, targetName, isStage} = getTargetInfo(null);
        const payload = {
            kind: 'costume-rename',
            targetId,
            targetName,
            index,
            newName,
            isStage
        };
        self.sendMessage('asset-event', payload);
    });
    wrap(vm, 'reorderCostume', args => {
        const [targetId, index, newIndex] = args;
        const {targetName, isStage} = getTargetInfo(targetId);
        const payload = {
            kind: 'costume-reorder',
            targetId,
            targetName,
            index,
            newIndex,
            isStage
        };
        self.sendMessage('asset-event', payload);
    });
    wrap(vm, 'duplicateCostume', args => {
        const [index] = args;
        const {targetId, targetName, isStage} = getTargetInfo(null);
        const target = vm.editingTarget;
        const original = target && target.getCostumes ? target.getCostumes()[index] : null;
        const payload = {
            kind: 'costume-duplicate',
            targetId,
            targetName,
            index,
            name: original && original.name,
            isStage
        };
        self.sendMessage('asset-event', payload);
    });

    wrap(vm, 'addSound', (args, result) => {
        const [soundObject, optTargetId] = args;
        const {targetId, targetName, isStage} = getTargetInfo(optTargetId);
        const s = soundObject || {};

        const sendSoundEvent = assetData => {
            const payload = {
                kind: 'sound-add',
                targetId,
                targetName,
                sound: {
                    name: s.name,
                    md5: s.md5,
                    dataFormat: s.dataFormat,
                    assetId: s.assetId,
                    rate: s.rate,
                    sampleCount: s.sampleCount
                },
                assetData,
                isStage
            };
            self.sendMessage('asset-event', payload);
        };

        Promise.resolve(result).then(() => {
            if (s.asset && s.asset.data) {
                const data = s.asset.data;
                if (data instanceof ArrayBuffer) {
                    sendSoundEvent(Array.from(new Uint8Array(data)));
                } else if (data instanceof Uint8Array) {
                    sendSoundEvent(Array.from(data));
                } else {
                    sendSoundEvent(null);
                }
            } else {
                sendSoundEvent(null);
            }
        });
    });
    wrap(vm, 'deleteSound', args => {
        const [index] = args;
        const {targetId, targetName, isStage} = getTargetInfo(null);
        const target = vm.editingTarget;
        const sound = target && target.getSounds ? target.getSounds()[index] : null;
        const payload = {
            kind: 'sound-delete',
            targetId,
            targetName,
            index,
            md5: sound && sound.md5,
            name: sound && sound.name,
            isStage
        };
        self.sendMessage('asset-event', payload);
    });
    wrap(vm, 'renameSound', args => {
        const [index, newName] = args;
        const {targetId, targetName, isStage} = getTargetInfo(null);
        const payload = {
            kind: 'sound-rename',
            targetId,
            targetName,
            index,
            newName,
            isStage
        };
        self.sendMessage('asset-event', payload);
    });
    wrap(vm, 'reorderSound', args => {
        const [targetId, index, newIndex] = args;
        const {targetName, isStage} = getTargetInfo(targetId);
        const payload = {
            kind: 'sound-reorder',
            targetId,
            targetName,
            index,
            newIndex,
            isStage
        };
        self.sendMessage('asset-event', payload);
    });
    wrap(vm, 'duplicateSound', args => {
        const [index] = args;
        const {targetId, targetName, isStage} = getTargetInfo(null);
        const target = vm.editingTarget;
        const original = target && target.getSounds ? target.getSounds()[index] : null;
        const payload = {
            kind: 'sound-duplicate',
            targetId,
            targetName,
            index,
            name: original && original.name,
            isStage
        };
        self.sendMessage('asset-event', payload);
    });

    wrap(vm, 'updateSvg', args => {
        const [costumeIndex, svg, rotationCenterX, rotationCenterY] = args;
        const {targetId, targetName, isStage} = getTargetInfo(null);
        const target = vm.editingTarget;
        const costume = target && target.getCostumes ? target.getCostumes()[costumeIndex] : null;
        const payload = {
            kind: 'costume-update-svg',
            targetId,
            targetName,
            costumeIndex,
            svg: svg,
            rotationCenterX,
            rotationCenterY,
            costumeName: costume && costume.name,
            isStage
        };
        self.sendMessage('asset-event', payload);
    });

    wrap(vm, 'updateBitmap', args => {
        const [costumeIndex, bitmap, rotationCenterX, rotationCenterY, bitmapResolution] = args;
        const {targetId, targetName, isStage} = getTargetInfo(null);
        const target = vm.editingTarget;
        const costume = target && target.getCostumes ? target.getCostumes()[costumeIndex] : null;

        let bitmapData = null;
        if (bitmap instanceof ImageData) {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(bitmap, 0, 0);
            bitmapData = canvas.toDataURL('image/png');
        } else if (bitmap instanceof HTMLCanvasElement) {
            bitmapData = bitmap.toDataURL('image/png');
        } else if (typeof bitmap === 'string') {
            bitmapData = bitmap;
        }

        if (!bitmapData) return;

        const payload = {
            kind: 'costume-update-bitmap',
            targetId,
            targetName,
            costumeIndex,
            bitmapData,
            rotationCenterX,
            rotationCenterY,
            bitmapResolution: bitmapResolution || 2,
            costumeName: costume && costume.name,
            isStage
        };
        self.sendMessage('asset-event', payload);
    });

    if (vm.updateSoundBuffer) {
        wrap(vm, 'updateSoundBuffer', args => {
            const [soundIndex, newBuffer, optTargetId] = args;
            const {targetId, targetName, isStage} = getTargetInfo(optTargetId);
            const target = optTargetId ? vm.runtime.getTargetById(optTargetId) : vm.editingTarget;
            const sound = target && target.getSounds ? target.getSounds()[soundIndex] : null;

            let audioData = null;
            if (newBuffer && newBuffer.numberOfChannels && newBuffer.length) {
                const channels = [];
                for (let i = 0; i < newBuffer.numberOfChannels; i++) {
                    channels.push(Array.from(newBuffer.getChannelData(i)));
                }
                audioData = {
                    numberOfChannels: newBuffer.numberOfChannels,
                    sampleRate: newBuffer.sampleRate,
                    length: newBuffer.length,
                    channels: channels
                };
            }

            if (!audioData) return;

            const payload = {
                kind: 'sound-update-buffer',
                targetId,
                targetName,
                soundIndex,
                audioData,
                soundName: sound && sound.name,
                isStage
            };
            self.sendMessage('asset-event', payload);
        });
    }
};

const handleAssetEvent = (service, payload, conn) => {
    if (payload.sender === service.peer.id) return;
    if (!service.vm) return;
    const kind = payload.kind;

    const findTarget = () => {
        const tId = payload.targetId;
        const tName = payload.targetName;

        let targetId = !service.isHost && service.targetMapping ?
            service.targetMapping[tId] : tId;

        let target = null;
        if (targetId) {
            target = service.vm.runtime.getTargetById(targetId);
        }

        if (!target && tName) {
            const foundTarget = service.vm.runtime.targets.find(t => t.getName() === tName);
            if (foundTarget) {
                target = foundTarget;
                targetId = target.id;
            }
        }
        return {target, targetId};
    };

    const getEventKey = () => {
        const parts = [kind];
        if (payload.targetId) parts.push(payload.targetId);
        if (payload.targetName) parts.push(payload.targetName);
        if (payload.costume && payload.costume.name) parts.push(payload.costume.name);
        if (payload.costume && payload.costume.md5) parts.push(payload.costume.md5);
        if (payload.costume && payload.costume.assetId) parts.push(payload.costume.assetId);
        if (payload.costume && payload.costume.dataFormat) parts.push(payload.costume.dataFormat);
        if (payload.sound && payload.sound.name) parts.push(payload.sound.name);
        if (payload.sound && payload.sound.md5) parts.push(payload.sound.md5);
        if (typeof payload.index !== 'undefined') parts.push(payload.index);
        return parts.join('|');
    };

    if (!service._eventDedupeCache) {
        service._eventDedupeCache = new Map();
    }

    const dedupeKey = getEventKey();
    const now = Date.now();
    const CACHE_TTL = 1000;

    if (service._eventDedupeCache.has(dedupeKey)) {
        const lastSeen = service._eventDedupeCache.get(dedupeKey);
        if (now - lastSeen < CACHE_TTL) {
            return;
        }
    }

    service._eventDedupeCache.set(dedupeKey, now);

    if (service._eventDedupeCache.size > 100) {
        let oldestKey = null;
        let oldestTimestamp = Infinity;

        service._eventDedupeCache.forEach((timestamp, key) => {
            if (timestamp < oldestTimestamp) {
                oldestTimestamp = timestamp;
                oldestKey = key;
            }
        });

        if (oldestKey) {
            service._eventDedupeCache.delete(oldestKey);
        }
    }

    service.isApplyingRemoteChange = true;

    try {
        if (kind === 'sprite-create') {
            const json = payload.jsonData;
            if (json) {
                const storage = service.vm.storage || (service.vm.runtime && service.vm.runtime.storage);

                const costumes = json.costumes || [];
                costumes.forEach((costume, index) => {
                    delete costume.asset;
                    if (costume.assetId) {
                        delete costume.assetId;
                    }
                    const data = payload.costumesData && payload.costumesData[index];
                    if (storage && data && Array.isArray(data)) {
                        const assetType = costume.dataFormat === 'svg' ?
                            storage.AssetType.ImageVector :
                            storage.AssetType.ImageBitmap;
                        const uint8Array = new Uint8Array(data);
                        const asset = storage.createAsset(
                            assetType,
                            costume.dataFormat,
                            uint8Array,
                            null,
                            true
                        );
                        costume.asset = asset;
                        costume.assetId = asset.assetId;
                        costume.md5ext = `${asset.assetId}.${costume.dataFormat}`;
                    }
                });

                const sounds = json.sounds || [];
                sounds.forEach((sound, index) => {
                    delete sound.asset;
                    if (sound.assetId) {
                        delete sound.assetId;
                    }
                    const data = payload.soundsData && payload.soundsData[index];
                    if (storage && data && Array.isArray(data)) {
                        const uint8Array = new Uint8Array(data);
                        const asset = storage.createAsset(
                            storage.AssetType.Sound,
                            sound.dataFormat || 'wav',
                            uint8Array,
                            null,
                            true
                        );
                        sound.asset = asset;
                        sound.assetId = asset.assetId;
                        sound.md5ext = `${asset.assetId}.${sound.dataFormat}`;
                    }
                });

                service.vm.addSprite(json);
            }
        } else if (kind === 'sprite-delete') {
            const {targetId} = findTarget();
            if (targetId) {
                service.vm.deleteSprite(targetId);
            }
        } else if (kind === 'sprite-rename') {
            const {targetId} = findTarget();
            if (targetId) {
                service.vm.renameSprite(targetId, payload.newName);
            }
        } else if (kind === 'sprite-reorder') {
            service.vm.reorderTarget(payload.targetIndex, payload.newIndex);
        } else if (kind === 'extension-remove') {
            if (service.vm.extensionManager) {
                service.vm.extensionManager.removeExtension(payload.extensionId);
            }
        } else if (kind === 'extension-reorder') {
            if (service.vm.extensionManager) {
                const keys = Array.from(service.vm.extensionManager._loadedExtensions.keys());
                const currentIndex = keys.indexOf(payload.extensionId);

                if (currentIndex === -1) {
                    console.warn('[Asset Event] Could not find extension to reorder:', payload.extensionId);
                } else {
                    service.vm.extensionManager.reorderExtension(currentIndex, payload.newIndex);
                }
            }
        } else {
            const {target, targetId} = findTarget();
            const prevTarget = service.vm.editingTarget && service.vm.editingTarget.id;

            if (!target) {
                return;
            }

            if (targetId && prevTarget !== targetId) {
                service.vm.setEditingTarget(targetId);
            }

            const storage = service.vm.storage || (service.vm.runtime && service.vm.runtime.storage);

            try {
                if (kind === 'costume-add' && payload.costume) {
                    const c = payload.costume;
                    const md5ext = c.md5;
                    if (storage) {
                        const obj = {
                            name: c.name,
                            md5: c.md5,
                            dataFormat: c.dataFormat,
                            rotationCenterX: c.rotationCenterX,
                            rotationCenterY: c.rotationCenterY,
                            bitmapResolution: c.bitmapResolution,
                            assetId: c.assetId
                        };

                        if (payload.assetData && Array.isArray(payload.assetData)) {
                            const assetType = c.dataFormat === 'svg' ?
                                storage.AssetType.ImageVector :
                                storage.AssetType.ImageBitmap;
                            const uint8Array = new Uint8Array(payload.assetData);
                            const asset = storage.createAsset(
                                assetType,
                                c.dataFormat,
                                uint8Array,
                                null,
                                true
                            );
                            obj.asset = asset;
                            obj.assetId = asset.assetId;
                            obj.md5 = `${asset.assetId}.${c.dataFormat}`;
                        }

                        service.vm.addCostume(obj.md5 || md5ext, obj, targetId);
                    }
                } else if (kind === 'costume-delete') {
                    if (target.getCostumes && target.getCostumes()[payload.index]) {
                        service.vm.deleteCostume(payload.index);
                    }
                } else if (kind === 'costume-rename') {
                    if (target.getCostumes && target.getCostumes()[payload.index]) {
                        service.vm.renameCostume(payload.index, payload.newName);
                    }
                } else if (kind === 'costume-reorder') {
                    if (target.getCostumes && target.getCostumes()[payload.index]) {
                        service.vm.reorderCostume(targetId, payload.index, payload.newIndex);
                    }
                } else if (kind === 'costume-duplicate') {
                    if (target.getCostumes && target.getCostumes()[payload.index]) {
                        service.vm.duplicateCostume(payload.index);
                    }
                } else if (kind === 'sound-add' && payload.sound) {
                    const s = payload.sound;
                    if (storage) {
                        const obj = {
                            name: s.name,
                            md5: s.md5,
                            dataFormat: s.dataFormat,
                            assetId: s.assetId,
                            rate: s.rate,
                            sampleCount: s.sampleCount
                        };

                        if (payload.assetData && Array.isArray(payload.assetData)) {
                            const uint8Array = new Uint8Array(payload.assetData);
                            const asset = storage.createAsset(
                                storage.AssetType.Sound,
                                s.dataFormat || 'wav',
                                uint8Array,
                                null,
                                true
                            );
                            obj.asset = asset;
                            obj.assetId = asset.assetId;
                            obj.md5 = `${asset.assetId}.${s.dataFormat || 'wav'}`;
                        }

                        service.vm.addSound(obj, targetId);
                    }
                } else if (kind === 'sound-delete') {
                    if (target.getSounds && target.getSounds()[payload.index]) {
                        service.vm.deleteSound(payload.index);
                    }
                } else if (kind === 'sound-rename') {
                    if (target.getSounds && target.getSounds()[payload.index]) {
                        service.vm.renameSound(payload.index, payload.newName);
                    }
                } else if (kind === 'sound-reorder') {
                    if (target.getSounds && target.getSounds()[payload.index]) {
                        service.vm.reorderSound(targetId, payload.index, payload.newIndex);
                    }
                } else if (kind === 'sound-duplicate') {
                    if (target.getSounds && target.getSounds()[payload.index]) {
                        service.vm.duplicateSound(payload.index);
                    }
                } else if (kind === 'costume-update-svg' && payload.svg) {
                    const editTarget = service.vm.editingTarget;
                    if (editTarget && editTarget.getCostumes) {
                        const costumes = editTarget.getCostumes();
                        if (costumes && costumes[payload.costumeIndex]) {
                            service.vm.updateSvg(
                                payload.costumeIndex,
                                payload.svg,
                                payload.rotationCenterX,
                                payload.rotationCenterY
                            );
                        }
                    }
                } else if (kind === 'costume-update-bitmap' && payload.bitmapData) {
                    const editTarget = service.vm.editingTarget;
                    if (!editTarget || !editTarget.getCostumes) {
                        return;
                    }
                    const costumes = editTarget.getCostumes();
                    if (!costumes || !costumes[payload.costumeIndex]) {
                        return;
                    }
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                        service.vm.updateBitmap(
                            payload.costumeIndex,
                            imageData,
                            payload.rotationCenterX,
                            payload.rotationCenterY,
                            payload.bitmapResolution || 2
                        );
                    };
                    img.src = payload.bitmapData;
                    return;
                } else if (kind === 'costume-update-during-edit') {
                    const editTarget = service.vm.editingTarget;

                    if (!editTarget || !editTarget.getCostumes) {
                        return;
                    }

                    const costumes = editTarget.getCostumes();
                    if (!costumes || !costumes[payload.costumeIndex]) {
                        return;
                    }

                    if (payload.isVector && payload.svg) {
                        service.vm.updateSvg(
                            payload.costumeIndex,
                            payload.svg,
                            payload.rotationCenterX,
                            payload.rotationCenterY
                        );
                    } else if (!payload.isVector && payload.bitmapData) {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                            service.vm.updateBitmap(
                                payload.costumeIndex,
                                imageData,
                                payload.rotationCenterX,
                                payload.rotationCenterY,
                                2
                            );
                        };
                        img.src = payload.bitmapData;
                    }
                    return;
                } else if (kind === 'sound-update-buffer' && payload.audioData) {
                    const audioData = payload.audioData;
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const audioBuffer = audioContext.createBuffer(
                        audioData.numberOfChannels,
                        audioData.length,
                        audioData.sampleRate
                    );
                    for (let i = 0; i < audioData.numberOfChannels; i++) {
                        const channelData = audioBuffer.getChannelData(i);
                        const sourceData = audioData.channels[i];
                        for (let j = 0; j < sourceData.length; j++) {
                            channelData[j] = sourceData[j];
                        }
                    }
                    service.vm.updateSoundBuffer(payload.soundIndex, audioBuffer, targetId);
                }
            } finally {
                if (prevTarget && prevTarget !== targetId) {
                    service.vm.setEditingTarget(prevTarget);
                }
            }
        }
    } finally {
        setTimeout(() => {
            service.isApplyingRemoteChange = false;
        }, 50);
    }

    if (service.isHost && payload.sender !== service.peer.id) {
        service.connections.forEach(connection => {
            if (connection !== conn && connection.open) {
                connection.send({type: 'asset-event', payload, sender: payload.sender, timestamp: Date.now()});
            }
        });
    }
};

export {
    wrapVMAssetMethods,
    handleAssetEvent
};
