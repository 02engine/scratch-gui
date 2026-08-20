/**
 * UI Layout Mode constants
 *
 * Each mode maps to a distinct editor layout strategy.
 * Add new modes here — the settings modal, reducer, and GUI pick-list
 * are all driven by this registry.
 */
export const UI_LAYOUT_MODES = {
    LEGACY: 'legacy',
    NEW_02E: '02e-new',
    // VSCODE: 'vscode'
};

/**
 * React Intl message descriptors for each mode label.
 * Use intl.formatMessage() to render these at runtime.
 */
export const UI_LAYOUT_MODE_MESSAGES = {
    [UI_LAYOUT_MODES.LEGACY]: {
        id: 'tw.settingsModal.uiLayoutMode.legacy',
        defaultMessage: 'Turbowarp'
    },
    [UI_LAYOUT_MODES.NEW_02E]: {
        id: 'tw.settingsModal.uiLayoutMode.02eNew',
        defaultMessage: '02 Engine'
    },
    // [UI_LAYOUT_MODES.VSCODE]: {
    //     id: 'tw.settingsModal.uiLayoutMode.vscode',
    //     defaultMessage: 'VS Code'
    // }
};

/**
 * The mode used when no preference has been stored yet.
 */
export const DEFAULT_UI_LAYOUT_MODE = UI_LAYOUT_MODES.NEW_02E;

/**
 * Declarative feature flags per layout mode.
 * Query with LAYOUT_FEATURES[mode].featureName instead of isXxxLayout() checks.
 */
export const LAYOUT_FEATURES = {
    [UI_LAYOUT_MODES.LEGACY]: {
        floatingMenuBar: false,
        windowBackground: false,
        collapsibleMenuBar: false
    },
    [UI_LAYOUT_MODES.NEW_02E]: {
        floatingMenuBar: true,
        windowBackground: true,
        collapsibleMenuBar: true
    },
    // [UI_LAYOUT_MODES.VSCODE]: {
    //     floatingMenuBar: true,
    //     windowBackground: true,
    //     collapsibleMenuBar: true
    // }
};
