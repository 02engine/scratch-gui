const EDITOR_BACKGROUND_TARGETS = {
    BLOCKS: 'blocks',
    WINDOW: 'window',
    BOTH: 'both'
};

const defaultEditorBackground = {
    image: null,
    blur: 0,
    target: EDITOR_BACKGROUND_TARGETS.BLOCKS
};

const normalizeEditorBackground = background => {
    const normalized = Object.assign({}, defaultEditorBackground, background || {});
    if (!Object.prototype.hasOwnProperty.call(EDITOR_BACKGROUND_TARGETS, String(normalized.target).toUpperCase())) {
        const validTargets = Object.keys(EDITOR_BACKGROUND_TARGETS).map(key => EDITOR_BACKGROUND_TARGETS[key]);
        if (!validTargets.includes(normalized.target)) {
            normalized.target = defaultEditorBackground.target;
        }
    }
    normalized.image = typeof normalized.image === 'string' && normalized.image ? normalized.image : null;
    const blur = Number(normalized.blur);
    normalized.blur = Number.isFinite(blur) ? Math.min(Math.max(blur, 0), 40) : 0;
    return normalized;
};

const hasEditorBackgroundTarget = (background, target) => {
    const normalized = normalizeEditorBackground(background);
    if (!normalized.image) {
        return false;
    }
    return normalized.target === target || normalized.target === EDITOR_BACKGROUND_TARGETS.BOTH;
};

const getEditorBackgroundStyle = background => {
    const normalized = normalizeEditorBackground(background);
    if (!normalized.image) {
        return {};
    }
    const escapedImage = normalized.image.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return {
        '--tw-editor-background-image': `url("${escapedImage}")`,
        '--tw-editor-background-blur': `${normalized.blur}px`
    };
};

export {
    EDITOR_BACKGROUND_TARGETS,
    defaultEditorBackground,
    normalizeEditorBackground,
    hasEditorBackgroundTarget,
    getEditorBackgroundStyle
};
