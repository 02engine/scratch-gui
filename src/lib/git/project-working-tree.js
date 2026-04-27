const sanitizePathPart = name => {
    if (!name || typeof name !== 'string') {
        return 'unnamed';
    }
    
    const safe = String(name)
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\.+$/g, '')
        .trim();
    return safe || 'unnamed';
};

const makeSafeScriptFilename = id => {
    const str = String(id || '');
    const base = sanitizePathPart(str) || 'script';
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h * 31) + str.charCodeAt(i)) % 0xFFFFFFFF;
    }
    const hex = Math.floor(h).toString(16);
    return `${base}-${hex.slice(0, 8) || '0'}.xml`;
};

const yieldToBrowser = () => new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
    } else {
        setTimeout(resolve, 0);
    }
});

const ensureDir = async (fs, dirPath) => {
    if (!fs || typeof fs.mkdir !== 'function') {
        throw new Error('Invalid filesystem object');
    }
    if (!dirPath || typeof dirPath !== 'string') {
        throw new Error('Invalid directory path');
    }
    
    try {
        await fs.mkdir(dirPath);
    } catch (e) {
        if (e.code !== 'EEXIST') {
            throw e;
        }
    }
};

const writeTextFile = async (fs, filePath, text) => {
    if (!fs || typeof fs.writeFile !== 'function') {
        throw new Error('Invalid filesystem object');
    }
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path');
    }
    if (text === null || typeof text === 'undefined') {
        throw new Error('File content cannot be null or undefined');
    }
    
    const content = typeof text === 'string' ? text : String(text);
    await fs.writeFile(filePath, content);
};

const writeBinaryFile = async (fs, filePath, data) => {
    if (!fs || typeof fs.writeFile !== 'function') {
        throw new Error('Invalid filesystem object');
    }
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path');
    }
    if (!data) {
        throw new Error('File data cannot be null or undefined');
    }
    
    if (typeof data === 'string') {
        await fs.writeFile(filePath, data);
        return;
    }
    const view = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (view.length === 0) {
        console.warn('Writing empty binary file:', filePath);
    }
    await fs.writeFile(filePath, view);
};

const removeRecursive = async (fs, filePath) => {
    if (!fs || !filePath || typeof filePath !== 'string') {
        return;
    }
    
    let stat;
    try {
        stat = await fs.stat(filePath);
    } catch (e) {
        // File doesn't exist, nothing to remove
        return;
    }

    if (stat.isDirectory()) {
        const entries = await fs.readdir(filePath);
        await Promise.all(entries.map(entry => removeRecursive(fs, `${filePath}/${entry}`)));
        try {
            await fs.rmdir(filePath);
        } catch (e) {
            // Directory might not be empty or have permission issues
            console.warn('Failed to remove directory:', filePath, e);
        }
        return;
    }

    try {
        await fs.unlink(filePath);
    } catch (e) {
        // File might be locked or have permission issues
        console.warn('Failed to remove file:', filePath, e);
    }
};

const clearWorkingTree = async ({pfs, dir}) => {
    if (!pfs || typeof pfs.readdir !== 'function') {
        throw new Error('Invalid filesystem object');
    }
    if (!dir || typeof dir !== 'string') {
        throw new Error('Invalid directory path');
    }
    
    let entries;
    try {
        entries = await pfs.readdir(dir);
    } catch (e) {
        // Directory doesn't exist, nothing to clear
        return;
    }
    
    await Promise.all(entries.map(async entry => {
        if (entry === '.git' || entry === '.gitignore') return;
        await removeRecursive(pfs, `${dir}/${entry}`);
    }));
};

const getTopLevelScripts = blocks => {
    if (!blocks || typeof blocks !== 'object') {
        return [];
    }
    if (!Array.isArray(blocks._scripts)) {
        return [];
    }
    return blocks._scripts.filter(script => script !== null && typeof script !== 'undefined');
};

const wrapXml = inner => (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<xml xmlns="http://www.w3.org/1999/xhtml">${inner}</xml>\n`
);

const getCostumeAssetType = (storage, costume) => {
    if (!costume) return null;
    const format = costume.dataFormat || (costume.md5ext ? costume.md5ext.split('.').pop() : null);
    if (format === 'svg') return storage.AssetType.ImageVector;
    return storage.AssetType.ImageBitmap;
};

const getSoundAssetType = storage => storage.AssetType.Sound;

const loadAssetData = async (storage, assetType, md5ext) => {
    if (!storage || typeof storage.load !== 'function') {
        throw new Error('Invalid storage object');
    }
    if (!assetType) {
        throw new Error('Asset type is required');
    }
    if (!md5ext || typeof md5ext !== 'string') {
        return null;
    }
    
    const md5 = md5ext.split('.')[0];
    if (!md5) {
        return null;
    }
    
    try {
        const asset = await storage.load(assetType, md5);
        return asset ? asset.data : null;
    } catch (e) {
        console.warn('Failed to load asset:', md5ext, e);
        return null;
    }
};

const writeTarget = async ({vm, target, storage, fs, dir, onProgress, progressState}) => {
    const spriteName = sanitizePathPart(target.getName ? target.getName() : target.sprite && target.sprite.name);
    const spriteRoot = `${dir}/${spriteName}`;

    const scriptsDir = `${spriteRoot}/scripts`;
    const costumesDir = `${spriteRoot}/costumes`;
    const soundsDir = `${spriteRoot}/sounds`;

    await ensureDir(fs, spriteRoot);
    await ensureDir(fs, scriptsDir);
    await ensureDir(fs, costumesDir);
    await ensureDir(fs, soundsDir);

    // Scripts
    const scripts = getTopLevelScripts(target.blocks);
    for (const scriptId of scripts) {
        let xmlInner = '';
        if (typeof target.blocks.blockToXML === 'function') {
            xmlInner = target.blocks.blockToXML(scriptId, target.comments);
        } else if (typeof target.blocks.toXML === 'function') {
            // fallback: whole target as single file
            xmlInner = target.blocks.toXML(target.comments);
        }
        const filename = makeSafeScriptFilename(scriptId);
        await writeTextFile(fs, `${scriptsDir}/${filename}`, wrapXml(xmlInner));

        if (progressState) {
            progressState.completed += 1;
            if (typeof onProgress === 'function') {
                onProgress({
                    phase: 'write',
                    message: `Writing scripts for ${spriteName}…`,
                    completed: progressState.completed,
                    total: progressState.total
                });
            }
            if (progressState.completed % 25 === 0) {
                await yieldToBrowser();
            }
        }
    }

    // Assets + index.json
    const spriteJsonString = vm.toJSON(target.id);
    const spriteJson = JSON.parse(spriteJsonString);

    const costumes = Array.isArray(spriteJson.costumes) ? spriteJson.costumes : [];
    const sounds = Array.isArray(spriteJson.sounds) ? spriteJson.sounds : [];

    const costumeFiles = [];
    for (const costume of costumes) {
        const name = sanitizePathPart(costume.name);
        const ext = costume.dataFormat || (costume.md5ext ? costume.md5ext.split('.').pop() : '');
        const filename = ext ? `${name}.${ext}` : name;
        const md5ext = costume.md5ext;
        const assetType = getCostumeAssetType(storage, costume);

        const data = await loadAssetData(storage, assetType, md5ext);
        if (data) {
            await writeBinaryFile(fs, `${costumesDir}/${filename}`, data);
        }

        costumeFiles.push({
            name: costume.name,
            file: `costumes/${filename}`,
            md5ext: costume.md5ext,
            dataFormat: costume.dataFormat,
            rotationCenterX: costume.rotationCenterX,
            rotationCenterY: costume.rotationCenterY
        });

        if (progressState) {
            progressState.completed += 1;
            if (typeof onProgress === 'function') {
                onProgress({
                    phase: 'write',
                    message: `Writing costumes for ${spriteName}…`,
                    completed: progressState.completed,
                    total: progressState.total
                });
            }
            if (progressState.completed % 25 === 0) {
                await yieldToBrowser();
            }
        }
    }

    const soundFiles = [];
    for (const sound of sounds) {
        const name = sanitizePathPart(sound.name);
        const ext = sound.dataFormat || sound.format || (sound.md5ext ? sound.md5ext.split('.').pop() : '');
        const filename = ext ? `${name}.${ext}` : name;
        const md5ext = sound.md5ext;

        const data = await loadAssetData(storage, getSoundAssetType(storage), md5ext);
        if (data) {
            await writeBinaryFile(fs, `${soundsDir}/${filename}`, data);
        }

        soundFiles.push({
            name: sound.name,
            file: `sounds/${filename}`,
            md5ext: sound.md5ext,
            dataFormat: sound.dataFormat,
            rate: sound.rate,
            sampleCount: sound.sampleCount
        });

        if (progressState) {
            progressState.completed += 1;
            if (typeof onProgress === 'function') {
                onProgress({
                    phase: 'write',
                    message: `Writing sounds for ${spriteName}…`,
                    completed: progressState.completed,
                    total: progressState.total
                });
            }
            if (progressState.completed % 25 === 0) {
                await yieldToBrowser();
            }
        }
    }

    const indexJson = {
        name: spriteJson.name,
        isStage: spriteJson.isStage,
        variables: spriteJson.variables,
        lists: spriteJson.lists,
        broadcasts: spriteJson.broadcasts,
        currentCostume: spriteJson.currentCostume,
        x: spriteJson.x,
        y: spriteJson.y,
        size: spriteJson.size,
        direction: spriteJson.direction,
        visible: spriteJson.visible,
        draggable: spriteJson.draggable,
        rotationStyle: spriteJson.rotationStyle,
        tempo: spriteJson.tempo,
        volume: spriteJson.volume,
        videoState: spriteJson.videoState,
        videoTransparency: spriteJson.videoTransparency,
        textToSpeechLanguage: spriteJson.textToSpeechLanguage,
        costumes: costumeFiles,
        sounds: soundFiles
    };

    await writeTextFile(fs, `${spriteRoot}/index.json`, JSON.stringify(indexJson, null, 2));

    if (progressState) {
        progressState.completed += 1;
        if (typeof onProgress === 'function') {
            onProgress({
                phase: 'write',
                message: `Writing metadata for ${spriteName}…`,
                completed: progressState.completed,
                total: progressState.total
            });
        }
        if (progressState.completed % 25 === 0) await yieldToBrowser();
    }
};

const writeProjectToWorkingTree = async ({vm, fs, dir, onProgress} = {}) => {
    const runtime = vm && vm.runtime;
    const storage = runtime && runtime.storage;
    if (!runtime || !storage) throw new Error('VM runtime/storage not available');

    const targets = runtime.targets.filter(t => t.isOriginal);

    const total = targets.reduce((acc, target) => {
        const scripts = getTopLevelScripts(target.blocks).length;
        let costumesCount = 0;
        let soundsCount = 0;
        try {
            const spriteJsonString = vm.toJSON(target.id);
            const spriteJson = JSON.parse(spriteJsonString);
            costumesCount = Array.isArray(spriteJson.costumes) ? spriteJson.costumes.length : 0;
            soundsCount = Array.isArray(spriteJson.sounds) ? spriteJson.sounds.length : 0;
        } catch (e) {
            // ignore
        }
        // +1 for index.json
        return acc + scripts + costumesCount + soundsCount + 1;
    }, 0);

    const progressState = {
        total: Math.max(1, total),
        completed: 0
    };

    if (typeof onProgress === 'function') {
        onProgress({
            phase: 'write',
            message: 'Writing project files…',
            completed: 0,
            total: progressState.total
        });
        await yieldToBrowser();
    }

    for (const target of targets) {
        await writeTarget({vm, target, storage, fs, dir, onProgress, progressState});
    }
};

export {
    clearWorkingTree,
    writeProjectToWorkingTree
};
