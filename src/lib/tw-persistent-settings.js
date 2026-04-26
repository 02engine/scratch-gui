import {
    EDITOR_BACKGROUND_IMAGE_STORAGE,
    defaultEditorBackground,
    normalizeEditorBackground
} from './editor-background';
import {
    createPersistentEditorBackgroundURL,
    loadPersistentEditorBackgroundBlob
} from './editor-background-storage';

const CUSTOM_UI_KEY = 'tw:customUI';
const EDITOR_BACKGROUND_KEY = 'tw:editorBackground';

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

const getPersistentCustomUI = (fallback = true) => {
    const stored = getLocalStorageItem(CUSTOM_UI_KEY);
    if (stored === null) {
        return fallback;
    }
    return stored === 'true';
};

const setPersistentCustomUI = customUI => (
    setLocalStorageItem(CUSTOM_UI_KEY, customUI === true ? 'true' : 'false')
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
    EDITOR_BACKGROUND_KEY,
    getPersistentCustomUI,
    setPersistentCustomUI,
    getPersistentEditorBackground,
    hydratePersistentEditorBackground,
    setPersistentEditorBackground
};
