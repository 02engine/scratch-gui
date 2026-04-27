/**
 * Reconstruct SB3 from working tree directory structure
 * Parses scripts from XML, loads assets, and builds a valid SB3 project
 */

import JSZip from '@turbowarp/jszip';

const sanitizePathPart = name => {
    if (!name || typeof name !== 'string') {
        return 'unnamed';
    }
    
    return String(name)
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\.+$/g, '')
        .trim() || 'unnamed';
};

/**
 * Generate a unique block ID
 * @returns {string}
 */
let blockIdCounter = 0;
const generateBlockId = () => {
    blockIdCounter++;
    const random = Math.floor(Math.random() * 0xFFFFFF).toString(16)
        .padStart(6, '0');
    return `b${Date.now().toString(36)}${random}`;
};

/**
 * Parse mutation element
 * @param {Element} node - Mutation DOM element
 * @returns {object}
 */
const parseMutation = node => {
    const mutation = {};
    
    if (!node || !node.attributes) {
        return mutation;
    }

    for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        mutation[attr.name] = attr.value;
    }

    const children = node.children;
    if (children && children.length > 0) {
        for (const child of children) {
            if (child.tagName && child.tagName.toLowerCase() === 'xml') {
                mutation.xml = child.textContent || '';
            }
        }
    }

    return mutation;
};

/**
 * Extract block structure from XML using DOMParser
 * @param {string} xml - XML string for blocks
 * @returns {object} Blocks structure {blockId: {opcode, inputs, fields, children...}}
 */
export const parseBlocksFromXML = xml => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        const blocks = {};
        
        const processNode = (node, parentId = null) => {
            if (!node || !node.tagName) return;
            
            const tagName = node.tagName.toLowerCase();
            
            if (tagName === 'block' || tagName === 'shadow') {
                const blockId = node.getAttribute('id') || generateBlockId();
                const opcode = node.getAttribute('type') || '';
                
                const block = {
                    id: blockId,
                    opcode: opcode,
                    parent: parentId,
                    inputs: {},
                    fields: {},
                    next: null,
                    topLevel: parentId === null,
                    shadow: tagName === 'shadow',
                    comment: node.getAttribute('comment') || null,
                    mutation: null,
                    x: parseFloat(node.getAttribute('x') || '0'),
                    y: parseFloat(node.getAttribute('y') || '0')
                };

                const children = node.children;
                if (children) {
                    for (const child of children) {
                        if (!child.tagName) continue;
                        
                        const childName = child.tagName.toLowerCase();
                        
                        if (childName === 'field') {
                            const fieldName = child.getAttribute('name');
                            const fieldId = child.getAttribute('id');
                            const fieldData = child.textContent || '';
                            
                            block.fields[fieldName] = {
                                name: fieldName,
                                id: fieldId,
                                value: fieldData,
                                variableType: child.getAttribute('variabletype') || undefined
                            };
                        } else if (childName === 'mutation') {
                            block.mutation = parseMutation(child);
                        } else if (childName === 'value' || childName === 'statement') {
                            const inputName = child.getAttribute('name');
                            let childBlockNode = null;
                            let childShadowNode = null;

                            for (const grandChild of child.children) {
                                if (!grandChild.tagName) continue;
                                
                                const gcName = grandChild.tagName.toLowerCase();
                                if (gcName === 'block') {
                                    childBlockNode = grandChild;
                                } else if (gcName === 'shadow') {
                                    childShadowNode = grandChild;
                                }
                            }

                            if (childShadowNode && !childBlockNode) {
                                childBlockNode = childShadowNode;
                            }

                            if (childShadowNode && childBlockNode !== childShadowNode) {
                                const shadowId = childShadowNode.getAttribute('id') || generateBlockId();
                                blocks[shadowId] = {
                                    id: shadowId,
                                    opcode: childShadowNode.getAttribute('type') || '',
                                    parent: blockId,
                                    inputs: {},
                                    fields: {},
                                    next: null,
                                    topLevel: false,
                                    shadow: true,
                                    mutation: null
                                };

                                processNode(childShadowNode, shadowId);
                            }

                            if (childBlockNode) {
                                block.inputs[inputName] = {
                                    name: inputName,
                                    block: childBlockNode.getAttribute('id') || generateBlockId(),
                                    shadow: childShadowNode ? childShadowNode.getAttribute('id') : null
                                };

                                processNode(childBlockNode, blockId);
                            }
                        } else if (childName === 'next') {
                            for (const grandChild of child.children) {
                                if (!grandChild.tagName) continue;
                                
                                const gcName = grandChild.tagName.toLowerCase();
                                if (gcName === 'block' || gcName === 'shadow') {
                                    block.next = grandChild.getAttribute('id') || generateBlockId();
                                    processNode(grandChild, blockId);
                                    break;
                                }
                            }
                        }
                    }
                }

                blocks[blockId] = block;
            } else if (tagName === 'xml') {
                for (const child of children) {
                    processNode(child, parentId);
                }
            }
        };

        for (const child of doc.children) {
            processNode(child);
        }

        return blocks;
    } catch (e) {
        console.error('Failed to parse XML:', e);
        return {};
    }
};

/**
 * Read file from filesystem
 * @param {object} pfs - Promisified filesystem
 * @param {string} filePath - Path to file
 * @returns {Promise<Uint8Array>}
 */
const readFile = async (pfs, filePath) => {
    if (!pfs || !filePath) {
        throw new Error('Invalid filesystem or file path');
    }

    try {
        const data = await pfs.readFile(filePath);
        return data instanceof Uint8Array ? data : new Uint8Array(data);
    } catch (e) {
        throw new Error(`Failed to read file ${filePath}: ${e.message}`);
    }
};

/**
 * Read text file from filesystem
 * @param {object} pfs - Promisified filesystem
 * @param {string} filePath - Path to file
 * @returns {Promise<string>}
 */
const readTextFile = async (pfs, filePath) => {
    const data = await readFile(pfs, filePath);
    return new TextDecoder().decode(data);
};

/**
 * List directory contents
 * @param {object} pfs - Promisified filesystem
 * @param {string} dirPath - Directory path
 * @returns {Promise<string[]>}
 */
const readDirectory = async (pfs, dirPath) => {
    if (!pfs || !dirPath) {
        throw new Error('Invalid filesystem or directory path');
    }

    try {
        return await pfs.readdir(dirPath);
    } catch (e) {
        if (e.code === 'ENOENT') {
            return [];
        }
        throw e;
    }
};

/**
 * Compute MD5-like hash of data (fallback for environments without crypto)
 * @param {Uint8Array} data - Data to hash
 * @returns {Promise<string>}
 */
const computeMD5 = async data => {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        try {
            const hashBuffer = await crypto.subtle.digest('MD5', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            // Fall through to simple hash
        }
    }

    // Simple FNV-1a hash (not cryptographically secure but works for asset IDs)
    let hash = 2166136261;
    for (let i = 0; i < data.length; i++) {
        hash ^= data[i];
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(32, '0')
        .slice(0, 32);
};

/**
 * Read sprite metadata from index.json
 * @param {object} pfs - Filesystem
 * @param {string} spriteDir - Sprite directory path
 * @returns {Promise<object>}
 */
export const readSpriteIndex = async (pfs, spriteDir) => {
    const indexPath = `${spriteDir}/index.json`;
    
    try {
        const content = await readTextFile(pfs, indexPath);
        return JSON.parse(content);
    } catch (e) {
        console.warn(`Failed to read sprite index at ${indexPath}:`, e);
        return {};
    }
};

/**
 * Read and parse all script XML files for a sprite
 * @param {object} pfs - Filesystem
 * @param {string} spriteDir - Sprite directory path
 * @returns {Promise<{blocks: object, blockCount: number}>}
 */
export const readSpriteScripts = async (pfs, spriteDir) => {
    const scriptsDir = `${spriteDir}/scripts`;
    const allBlocks = {};
    let blockCount = 0;

    try {
        const scriptFiles = await readDirectory(pfs, scriptsDir);
        const xmlFiles = scriptFiles.filter(f => f.endsWith('.xml'));

        for (const xmlFile of xmlFiles) {
            try {
                const scriptPath = `${scriptsDir}/${xmlFile}`;
                const xmlContent = await readTextFile(pfs, scriptPath);
                const blocks = parseBlocksFromXML(xmlContent);

                for (const [blockId, block] of Object.entries(blocks)) {
                    if (!allBlocks[blockId]) {
                        allBlocks[blockId] = block;
                        blockCount++;
                    }
                }
            } catch (e) {
                console.warn(`Failed to parse script ${xmlFile}:`, e);
            }
        }
    } catch (e) {
        console.warn(`Failed to read scripts directory at ${scriptsDir}:`, e);
    }

    return {blocks: allBlocks, blockCount};
};

/**
 * Read costume files for a sprite
 * @param {object} pfs - Filesystem
 * @param {string} spriteDir - Sprite directory path
 * @returns {Promise<Array<{name, file, dataFormat, data, dataExt}>>}
 */
export const readSpriteCostumes = async (pfs, spriteDir) => {
    const costumesDir = `${spriteDir}/costumes`;
    const costumes = [];

    try {
        const costumeFiles = await readDirectory(pfs, costumesDir);

        for (const file of costumeFiles) {
            try {
                const filePath = `${costumesDir}/${file}`;
                const data = await readFile(pfs, filePath);
                
                const ext = file.split('.').pop()
                    .toLowerCase();
                const name = file.replace(`.${ext}`, '');

                costumes.push({
                    name: name,
                    file: `costumes/${file}`,
                    dataFormat: ext,
                    data: data,
                    dataExt: ext,
                    assetId: null,
                    md5ext: null
                });
            } catch (e) {
                console.warn(`Failed to read costume ${file}:`, e);
            }
        }
    } catch (e) {
        console.warn(`Failed to read costumes directory at ${costumesDir}:`, e);
    }

    return costumes;
};

/**
 * Read sound files for a sprite
 * @param {object} pfs - Filesystem
 * @param {string} spriteDir - Sprite directory path
 * @returns {Promise<Array<{name, file, dataFormat, data}>>}
 */
export const readSpriteSounds = async (pfs, spriteDir) => {
    const soundsDir = `${spriteDir}/sounds`;
    const sounds = [];

    try {
        const soundFiles = await readDirectory(pfs, soundsDir);

        for (const file of soundFiles) {
            try {
                const filePath = `${soundsDir}/${file}`;
                const data = await readFile(pfs, filePath);

                const ext = file.split('.').pop()
                    .toLowerCase();
                const name = file.replace(`.${ext}`, '');

                let sampleCount = null;
                let rate = null;

                if (ext === 'wav') {
                    const view = new DataView(data);
                    if (view.getUint32(0, true) === 0x46464952) {
                        rate = view.getUint32(24, true);
                        sampleCount = data.byteLength / 2;
                    }
                }

                sounds.push({
                    name: name,
                    file: `sounds/${file}`,
                    dataFormat: ext,
                    data: data,
                    sampleCount,
                    rate
                });
            } catch (e) {
                console.warn(`Failed to read sound ${file}:`, e);
            }
        }
    } catch (e) {
        console.warn(`Failed to read sounds directory at ${soundsDir}:`, e);
    }

    return sounds;
};

/**
 * Build target object from working tree sprite directory
 * @param {object} pfs - Filesystem
 * @param {string} spriteDir - Sprite directory path
 * @returns {Promise<object>}
 */
export const buildTargetFromWorkingTree = async (pfs, spriteDir) => {
    const spriteName = sanitizePathPart(spriteDir.split('/').pop());

    const [index, scriptsData, costumes, sounds] = await Promise.all([
        readSpriteIndex(pfs, spriteDir),
        readSpriteScripts(pfs, spriteDir),
        readSpriteCostumes(pfs, spriteDir),
        readSpriteSounds(pfs, spriteDir)
    ]);

    const target = {
        isStage: index.isStage || false,
        name: index.name || spriteName,
        variables: index.variables || {},
        lists: index.lists || {},
        broadcasts: index.broadcasts || {},
        blocks: scriptsData.blocks,
        comments: {},
        currentCostume: index.currentCostume || 0,
        costumes: costumes.map((c, i) => {
            const indexCostume = index.costumes && index.costumes[i] ? index.costumes[i] : {};
            return {
                name: c.name,
                bitmapResolution: c.dataFormat === 'svg' ? 1 : 2,
                layerOrder: indexCostume.layerOrder,
                rotationCenterX: indexCostume.rotationCenterX || 0.5,
                rotationCenterY: indexCostume.rotationCenterY || 0.5,
                dataFormat: c.dataFormat,
                assetId: c.assetId,
                md5ext: c.md5ext,
                skinId: i
            };
        }),
        sounds: sounds.map((s, i) => ({
            name: s.name,
            dataFormat: s.dataFormat,
            format: s.dataFormat,
            assetId: s.assetId,
            md5ext: s.md5ext,
            rate: s.rate || 44100,
            sampleCount: s.sampleCount,
            soundId: i
        })),
        volume: index.volume !== undefined ? index.volume : 100,
        layerOrder: index.layerOrder || 0,
        visible: index.visible !== undefined ? index.visible : true,
        x: index.x !== undefined ? index.x : 0,
        y: index.y !== undefined ? index.y : 0,
        size: index.size !== undefined ? index.size : 100,
        direction: index.direction !== undefined ? index.direction : 90,
        draggable: index.draggable !== undefined ? index.draggable : false,
        rotationStyle: index.rotationStyle !== undefined ? index.rotationStyle : 'all around',
        sayThreshold: index.sayThreshold || 10,
        thinkThreshold: index.thinkThreshold || 10
    };

    return target;
};

/**
 * Reconstruct SB3 from working tree directory
 * @param {object} fs - Filesystem
 * @param {string} dir - Repository directory
 * @param {object} options - Options
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<ArrayBuffer>}
 */
export const reconstructSb3FromWorkingTree = async ({fs, dir, onProgress}) => {
    if (!fs || !dir) {
        throw new Error('Filesystem and directory are required');
    }

    const pfs = fs.promises;
    const zip = new JSZip();
    const targets = [];

    try {
        const entries = await readDirectory(pfs, dir);
        const spriteDirs = entries.filter(e =>
            !e.startsWith('.') &&
            e !== 'project.sb3'
        ).map(e => `${dir}/${e}`);

        let processed = 0;

        if (typeof onProgress === 'function') {
            onProgress({phase: 'reading', message: 'Reading sprites...', completed: 0, total: spriteDirs.length + 2});
        }

        for (const spriteDir of spriteDirs) {
            try {
                const stat = await pfs.stat(spriteDir);
                if (!stat.isDirectory()) continue;

                const target = await buildTargetFromWorkingTree(pfs, spriteDir);
                
                for (const costume of target.costumes) {
                    if (costume.file) {
                        const costumeFile = await readFile(pfs, `${dir}/${spriteDir.split('/').pop()}/${costume.file}`);
                        const ext = costume.dataFormat || costume.file.split('.').pop();
                        const md5 = await computeMD5(costumeFile);
                        costume.md5ext = `${md5}.${ext}`;
                        costume.assetId = md5;
                        
                        zip.file(`${md5}.${ext}`, costumeFile);
                    }
                }

                for (const sound of target.sounds) {
                    if (sound.file) {
                        const soundFile = await readFile(pfs, `${dir}/${spriteDir.split('/').pop()}/${sound.file}`);
                        const ext = sound.dataFormat || sound.file.split('.').pop();
                        const md5 = await computeMD5(soundFile);
                        sound.md5ext = `${md5}.${ext}`;
                        sound.assetId = md5;
                        
                        zip.file(`${md5}.${ext}`, soundFile);
                    }
                }

                targets.push(target);

                processed++;
                if (typeof onProgress === 'function' && processed % 5 === 0) {
                    onProgress({phase: 'reading', message: `Read sprite ${target.name}...`, completed: processed, total: spriteDirs.length + 2});
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            } catch (e) {
                console.warn(`Failed to process sprite directory ${spriteDir}:`, e);
            }
        }

        if (targets.length === 0) {
            throw new Error('No sprites found in working tree');
        }

        if (typeof onProgress === 'function') {
            onProgress({phase: 'building', message: 'Building SB3 file...', completed: processed + 1, total: processed + 2});
        }

        const projectJson = {
            targets: targets.map(t => {
                const clean = {...t};
                delete clean.blocks.comments;
                return clean;
            }),
            monitors: [],
            extensions: [],
            meta: {
                semver: '3.0.0',
                vm: '0.2.0-prerelease',
                agent: 'MistWarp-GUI'
            }
        };

        zip.file('project.json', JSON.stringify(projectJson, null, 2));

        if (typeof onProgress === 'function') {
            onProgress({phase: 'finishing', message: 'Generating SB3...', completed: processed + 2, total: processed + 2});
        }

        const blob = await zip.generateAsync({
            type: 'arraybuffer',
            compression: 'DEFLATE',
            compressionOptions: {level: 6}
        });

        return blob;
    } catch (e) {
        throw new Error(`Failed to reconstruct SB3: ${e.message}`);
    }
};

/**
 * Verify the working tree structure
 * @param {object} fs - Filesystem
 * @param {string} dir - Repository directory
 * @returns {Promise<boolean>}
 */
export const verifyWorkingTree = async ({fs, dir}) => {
    try {
        const pfs = fs.promises;
        const entries = await readDirectory(pfs, dir);

        let hasSprites = false;
        for (const entry of entries) {
            if (entry.startsWith('.') || entry === 'project.sb3') continue;

            const entryPath = `${dir}/${entry}`;
            try {
                const stat = await pfs.stat(entryPath);
                if (stat.isDirectory()) {
                    hasSprites = true;

                    const indexPath = `${entryPath}/index.json`;
                    try {
                        await pfs.stat(indexPath);
                    } catch (e) {
                        return false;
                    }
                }
            } catch (e) {
                return false;
            }
        }

        return hasSprites;
    } catch (e) {
        return false;
    }
};
