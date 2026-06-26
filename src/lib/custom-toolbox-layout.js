import LazyScratchBlocks from './tw-lazy-scratch-blocks';

const STATIC_CATEGORY_IDS = ['motion', 'looks', 'sound', 'events', 'control', 'sensing', 'operators'];

const DEFAULT_TOOLBOX_LAYOUT = {
    enabled: false,
    hiddenBlocks: {},
    groups: []
};

const CATEGORY_NAME_FALLBACKS = {
    motion: 'Motion',
    looks: 'Looks',
    sound: 'Sound',
    events: 'Events',
    control: 'Control',
    sensing: 'Sensing',
    operators: 'Operators'
};

const CATEGORY_MESSAGE_KEYS = {
    motion: 'MOTION',
    looks: 'LOOKS',
    sound: 'SOUND',
    events: 'EVENTS',
    control: 'CONTROL',
    sensing: 'SENSING',
    operators: 'OPERATORS'
};

const normalizeToolboxLayout = layout => {
    const normalized = Object.assign({}, DEFAULT_TOOLBOX_LAYOUT, layout || {});
    const hiddenBlocks = normalized.hiddenBlocks && typeof normalized.hiddenBlocks === 'object' ?
        normalized.hiddenBlocks : {};
    const groups = Array.isArray(normalized.groups) ? normalized.groups : [];
    return {
        enabled: normalized.enabled === true,
        hiddenBlocks,
        groups: groups.map((group, index) => ({
            id: group.id || `custom-${index + 1}`,
            name: group.name || `Custom ${index + 1}`,
            colour: group.colour || '#4c97ff',
            secondaryColour: group.secondaryColour || group.colour || '#3373cc',
            blocks: Array.isArray(group.blocks) ? group.blocks.map(block => ({
                ...block,
                categoryId: block.categoryId === 'event' ? 'events' : block.categoryId
            })) : []
        }))
    };
};

const getBlockKey = (categoryId, type, index) => `${categoryId}:${type}:${index}`;

const resolveMessageReferences = message => {
    if (!message) {
        return '';
    }
    if (LazyScratchBlocks.isLoaded()) {
        return LazyScratchBlocks.get().utils.replaceMessageReferences(message);
    }
    return message;
};

const serializeNode = node => new XMLSerializer().serializeToString(node);

const parseToolboxDOM = toolboxXML => {
    const parser = new DOMParser();
    return parser.parseFromString(toolboxXML, 'text/xml');
};

const serializeToolboxDOM = dom => new XMLSerializer().serializeToString(dom);

const getElementChildren = node => Array.prototype.filter.call(node.childNodes || [], child => child.nodeType === 1);

const collectDefaultBlocks = toolboxXML => {
    const dom = parseToolboxDOM(toolboxXML);
    const categories = getElementChildren(dom.documentElement)
        .filter(child => child.tagName && child.tagName.toLowerCase() === 'category');
    const result = [];

    for (const category of categories) {
        const categoryId = category.getAttribute('id');
        if (!STATIC_CATEGORY_IDS.includes(categoryId)) continue;
        let index = 0;
        for (const child of getElementChildren(category)) {
            if (child.tagName.toLowerCase() !== 'block') continue;
            const type = child.getAttribute('type');
            if (!type) continue;
            result.push({
                key: getBlockKey(categoryId, type, index),
                categoryId,
                categoryName: resolveMessageReferences(category.getAttribute('name') || CATEGORY_NAME_FALLBACKS[categoryId] || categoryId),
                categoryXMLName: category.getAttribute('name') || CATEGORY_NAME_FALLBACKS[categoryId] || categoryId,
                categoryColour: category.getAttribute('colour'),
                categorySecondaryColour: category.getAttribute('secondaryColour'),
                xmlText: serializeNode(child.cloneNode(true)),
                type,
                index
            });
            index++;
        }
    }
    return result;
};

const findBlockTemplate = (categoryMap, blockRef) => {
    const category = categoryMap.get(blockRef.categoryId);
    if (!category) return null;
    if (blockRef.key && category.blocksByKey.has(blockRef.key)) {
        return category.blocksByKey.get(blockRef.key);
    }
    const blocks = category.blocksByType.get(blockRef.type) || [];
    return blocks[blockRef.index || 0] || null;
};

const applyCustomToolboxLayout = (toolboxXML, layout) => {
    const normalized = normalizeToolboxLayout(layout);
    if (!normalized.enabled) {
        return toolboxXML;
    }

    const dom = parseToolboxDOM(toolboxXML);
    const root = dom.documentElement;
    const categories = getElementChildren(root)
        .filter(child => child.tagName && child.tagName.toLowerCase() === 'category');
    const categoryMap = new Map();

    for (const category of categories) {
        const categoryId = category.getAttribute('id');
        if (!STATIC_CATEGORY_IDS.includes(categoryId)) continue;

        let index = 0;
        const blocksByType = new Map();
        const blocksByKey = new Map();
        for (const child of getElementChildren(category)) {
            if (child.tagName.toLowerCase() !== 'block') continue;
            const type = child.getAttribute('type');
            if (!type) continue;
            const entry = {
                key: getBlockKey(categoryId, type, index),
                node: child.cloneNode(true),
                type,
                index
            };
            blocksByKey.set(entry.key, entry);
            if (!blocksByType.has(type)) {
                blocksByType.set(type, []);
            }
            blocksByType.get(type).push(entry);
            index++;
        }
        categoryMap.set(categoryId, {
            node: category,
            blocksByType,
            blocksByKey
        });
    }

    for (const [categoryId, categoryInfo] of categoryMap.entries()) {
        const hidden = new Set(normalized.hiddenBlocks[categoryId] || []);
        if (!hidden.size) continue;
        let index = 0;
        for (const child of getElementChildren(categoryInfo.node)) {
            if (child.tagName.toLowerCase() !== 'block') continue;
            const type = child.getAttribute('type');
            const key = getBlockKey(categoryId, type, index);
            index++;
            if (hidden.has(key)) {
                categoryInfo.node.removeChild(child);
            }
        }
    }

    let insertBeforeNode = null;
    for (const category of categories) {
        const categoryId = category.getAttribute('id');
        if (categoryId === 'variables' || categoryId === 'myBlocks' || category.getAttribute('custom')) {
            insertBeforeNode = category;
            break;
        }
    }

    for (const group of normalized.groups) {
        const category = dom.createElement('category');
        category.setAttribute('name', group.name);
        category.setAttribute('id', `customToolbox-${group.id}`);
        category.setAttribute('colour', group.colour);
        category.setAttribute('secondaryColour', group.secondaryColour || group.colour);

        let addedCount = 0;
        for (const blockRef of group.blocks) {
            const template = findBlockTemplate(categoryMap, blockRef);
            if (!template) continue;
            category.appendChild(template.node.cloneNode(true));
            addedCount++;
        }

        if (!addedCount) continue;
        if (insertBeforeNode) {
            root.insertBefore(category, insertBeforeNode);
        } else {
            root.appendChild(category);
        }
    }

    return serializeToolboxDOM(dom);
};

export {
    DEFAULT_TOOLBOX_LAYOUT,
    CATEGORY_MESSAGE_KEYS,
    STATIC_CATEGORY_IDS,
    CATEGORY_NAME_FALLBACKS,
    applyCustomToolboxLayout,
    collectDefaultBlocks,
    normalizeToolboxLayout,
    resolveMessageReferences
};
