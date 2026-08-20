import {
    EDITOR_BACKGROUND_IMAGE_STORAGE,
    defaultEditorBackground,
    normalizeEditorBackground
} from './editor-background';
import {
    createPersistentEditorBackgroundURL,
    loadPersistentEditorBackgroundBlob
} from './editor-background-storage';
import {
    UI_LAYOUT_MODES,
    DEFAULT_UI_LAYOUT_MODE
} from './ui-layout-modes';

const CUSTOM_UI_KEY = 'tw:customUI';
const CANVAS_RENDERER_KEY = 'tw:canvasRenderer';
const EDITOR_BACKGROUND_KEY = 'tw:editorBackground';
const TOOLBOX_LAYOUT_KEY = 'tw:toolboxLayout';
const BLOCK_FLYOUT_WIDTH_KEY = 'tw:blockFlyoutWidth';

const getLocalStorageItem = key => {
    try {
        if (typeof localStorage === 'undefined') {
            return null;
        }
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
};

const setLocalStorageItem = (key, value) => {
    try {
        if (typeof localStorage === 'undefined') {
            return false;
        }
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        return false;
    }
};

const getPersistentUILayoutMode = (fallback = DEFAULT_UI_LAYOUT_MODE) => {
    const stored = getLocalStorageItem(CUSTOM_UI_KEY);
    if (stored === null) {
        return fallback;
    }
    // Backward compat: old boolean values
    if (stored === 'true') return UI_LAYOUT_MODES.NEW_02E;
    if (stored === 'false') return UI_LAYOUT_MODES.LEGACY;
    // New string-based mode
    if (Object.values(UI_LAYOUT_MODES).includes(stored)) return stored;
    return fallback;
};

const setPersistentUILayoutMode = mode => (
    setLocalStorageItem(CUSTOM_UI_KEY, mode)
);

const getPersistentCanvasRenderer = (fallback = true) => {
    const stored = getLocalStorageItem(CANVAS_RENDERER_KEY);
    if (stored === null) {
        return fallback;
    }
    return stored === 'true';
};

const setPersistentCanvasRenderer = canvasRenderer => (
    setLocalStorageItem(CANVAS_RENDERER_KEY, canvasRenderer === true ? 'true' : 'false')
);

const serializePersistentEditorBackground = editorBackground => {
    const normalized = normalizeEditorBackground(editorBackground);
    if (normalized.imageStorage === EDITOR_BACKGROUND_IMAGE_STORAGE.INDEXED_DB) {
        return Object.assign({}, normalized, {
            image: null
        });
    }
    return normalized;
};

const getPersistentEditorBackground = (fallback = defaultEditorBackground) => {
    const stored = getLocalStorageItem(EDITOR_BACKGROUND_KEY);
    if (stored === null) {
        return normalizeEditorBackground(fallback);
    }
    try {
        return normalizeEditorBackground(JSON.parse(stored));
    } catch (e) {
        return normalizeEditorBackground(fallback);
    }
};

const setPersistentEditorBackground = editorBackground => (
    setLocalStorageItem(
        EDITOR_BACKGROUND_KEY,
        JSON.stringify(serializePersistentEditorBackground(editorBackground))
    )
);

const getPersistentToolboxLayout = (fallback = null) => {
    const stored = getLocalStorageItem(TOOLBOX_LAYOUT_KEY);
    if (stored === null) {
        return fallback;
    }
    try {
        return JSON.parse(stored);
    } catch (e) {
        return fallback;
    }
};

const setPersistentToolboxLayout = toolboxLayout => (
    setLocalStorageItem(TOOLBOX_LAYOUT_KEY, JSON.stringify(toolboxLayout || {}))
);

const getPersistentBlockFlyoutWidth = (fallback = null) => {
    const stored = getLocalStorageItem(BLOCK_FLYOUT_WIDTH_KEY);
    if (stored === null) {
        return fallback;
    }
    const width = Number(stored);
    return Number.isFinite(width) ? width : fallback;
};

const setPersistentBlockFlyoutWidth = width => (
    setLocalStorageItem(BLOCK_FLYOUT_WIDTH_KEY, String(width))
);

const hydratePersistentEditorBackground = async background => {
    const normalized = normalizeEditorBackground(background);
    if (normalized.imageStorage !== EDITOR_BACKGROUND_IMAGE_STORAGE.INDEXED_DB) {
        return normalized;
    }
    try {
        const blob = await loadPersistentEditorBackgroundBlob();
        if (!blob) {
            return normalizeEditorBackground(Object.assign({}, normalized, {
                image: null,
                imageStorage: null
            }));
        }
        return normalizeEditorBackground(Object.assign({}, normalized, {
            image: createPersistentEditorBackgroundURL(blob)
        }));
    } catch (e) {
        return normalizeEditorBackground(Object.assign({}, normalized, {
            image: null,
            imageStorage: null
        }));
    }
};

export {
    CUSTOM_UI_KEY,
    CANVAS_RENDERER_KEY,
    EDITOR_BACKGROUND_KEY,
    TOOLBOX_LAYOUT_KEY,
    BLOCK_FLYOUT_WIDTH_KEY,
    getPersistentUILayoutMode,
    setPersistentUILayoutMode,
    // Backward-compat aliases — prefer the new names above.
    getPersistentUILayoutMode as getPersistentCustomUI,
    setPersistentUILayoutMode as setPersistentCustomUI,
    getPersistentCanvasRenderer,
    setPersistentCanvasRenderer,
    getPersistentEditorBackground,
    hydratePersistentEditorBackground,
    setPersistentEditorBackground,
    getPersistentToolboxLayout,
    setPersistentToolboxLayout,
    getPersistentBlockFlyoutWidth,
    setPersistentBlockFlyoutWidth
};
