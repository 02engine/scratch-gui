import {
    defaultEditorBackground,
    normalizeEditorBackground
} from './editor-background';

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
        JSON.stringify(normalizeEditorBackground(editorBackground))
    )
);

export {
    CUSTOM_UI_KEY,
    EDITOR_BACKGROUND_KEY,
    getPersistentCustomUI,
    setPersistentCustomUI,
    getPersistentEditorBackground,
    setPersistentEditorBackground
};
