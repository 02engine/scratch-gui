import classNames from 'classnames';
import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';
import MediaQuery from 'react-responsive';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';
import tabStyles from 'react-tabs/style/react-tabs.css';
import VM from 'scratch-vm';

import DraggableWindow from '../draggable-window/draggable-window.jsx';
import MinimizedBar from '../draggable-window/minimized-bar.jsx';
import ProjectExporter from '../../lib/project-exporter.js';
import windowStateStorage from '../../lib/window-state-storage';
import computedStyleToInlineStyle from 'computed-style-to-inline-style';

import Blocks from '../../containers/blocks.jsx';
import CostumeTab from '../../containers/costume-tab.jsx';
import TargetPane from '../../containers/target-pane.jsx';
import SoundTab from '../../containers/sound-tab.jsx';
import StageWrapper from '../../containers/stage-wrapper.jsx';
import Loader from '../loader/loader.jsx';
import Box from '../box/box.jsx';
import MenuBar from '../menu-bar/menu-bar.jsx';
import CostumeLibrary from '../../containers/costume-library.jsx';
import BackdropLibrary from '../../containers/backdrop-library.jsx';
import Watermark from '../../containers/watermark.jsx';

import Backpack from '../../containers/backpack.jsx';
import BrowserModal from '../browser-modal/browser-modal.jsx';
import TipsLibrary from '../../containers/tips-library.jsx';
import Cards from '../../containers/cards.jsx';
import Alerts from '../../containers/alerts.jsx';
import DragLayer from '../../containers/drag-layer.jsx';
import ConnectionModal from '../../containers/connection-modal.jsx';
import TelemetryModal from '../telemetry-modal/telemetry-modal.jsx';
import TWUsernameModal from '../../containers/tw-username-modal.jsx';
import TWSettingsModal from '../../containers/tw-settings-modal.jsx';
import TWSecurityManager from '../../containers/tw-security-manager.jsx';
import TWCustomExtensionModal from '../../containers/tw-custom-extension-modal.jsx';
import TWExtensionImportModal from '../../containers/tw-extension-import-modal.jsx';
import TWRestorePointManager from '../../containers/tw-restore-point-manager.jsx';
import TWFontsModal from '../../containers/tw-fonts-modal.jsx';
import TWUnknownPlatformModal from '../../containers/tw-unknown-platform-modal.jsx';
import TWInvalidProjectModal from '../../containers/tw-invalid-project-modal.jsx';
import TWGitModal from '../../containers/tw-git-modal.jsx';
import CollaborationContainer from '../../containers/collaboration-container.jsx';

import {STAGE_SIZE_MODES, FIXED_WIDTH, UNCONSTRAINED_NON_STAGE_WIDTH} from '../../lib/layout-constants';
import {resolveStageSize} from '../../lib/screen-utils';
import getCostumeUrl from '../../lib/get-costume-url';
import {Theme} from '../../lib/themes';
import {BLOCKS_TAB_INDEX, COSTUMES_TAB_INDEX, SOUNDS_TAB_INDEX} from '../../reducers/editor-tab';
import {
    EDITOR_BACKGROUND_TARGETS,
    getEditorBackgroundStyle,
    hasEditorBackgroundTarget
} from '../../lib/editor-background';

import {isRendererSupported, isBrowserSupported} from '../../lib/tw-environment-support-prober';

import styles from './gui.css';
import addExtensionIcon from './icon--extensions.svg';
import codeIcon from '!../../lib/tw-recolor/build!./icon--code.svg';
import costumesIcon from '!../../lib/tw-recolor/build!./icon--costumes.svg';
import soundsIcon from '!../../lib/tw-recolor/build!./icon--sounds.svg';

const messages = defineMessages({
    addExtension: {
        id: 'gui.gui.addExtension',
        description: 'Button to add an extension in the target pane',
        defaultMessage: 'Add Extension'
    },
    stageTargetName: {
        id: 'tw.gui.stageTargetName',
        description: 'Display name for the stage target in newUI editor windows',
        defaultMessage: 'Stage'
    },
    editorWindowLock: {
        id: 'tw.gui.editorWindowLock',
        description: 'Tooltip for the lock button in a newUI editor window',
        defaultMessage: 'Lock window: switching targets opens a new editor'
    },
    editorWindowUnlock: {
        id: 'tw.gui.editorWindowUnlock',
        description: 'Tooltip for the unlock button in a newUI editor window',
        defaultMessage: 'Unlock window: switching targets reuses this editor'
    },
    editorWindowPreviewHint: {
        id: 'tw.gui.editorWindowPreviewHint',
        description: 'Hint shown inside inactive editor windows in newUI',
        defaultMessage: 'Click this window to activate the editor'
    },
    editorWindowNoPreview: {
        id: 'tw.gui.editorWindowNoPreview',
        description: 'Fallback text for targets without a current costume preview',
        defaultMessage: 'No current costume preview'
    }
});

const EDITOR_WINDOW_BASE_Z_INDEX = 120;
const TARGET_PANE_WINDOW_Z_INDEX = 470;
const STAGE_WINDOW_Z_INDEX = 475;
const EDITOR_WINDOW_DEFAULT_SIZE = {width: 760, height: 560};
const EDITOR_WINDOW_MIN_SIZE = {width: 0, height: 0};
const EDITOR_WINDOW_MAX_SIZE = {width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER};
const EDITOR_WINDOW_INITIAL_MARGIN_X = 12;
const EDITOR_WINDOW_INITIAL_MARGIN_BOTTOM = 12;
const EDITOR_WINDOW_INITIAL_TOP_OFFSET = 40;
const EDITOR_WINDOW_INITIAL_CASCADE_X = 24;
const EDITOR_WINDOW_INITIAL_CASCADE_Y = 18;
const clampIndex = (value, length) => {
    if (!length) {
        return 0;
    }
    return Math.min(Math.max(value || 0, 0), length - 1);
};

const WindowLockIcon = props => (
    <svg
        aria-hidden="true"
        height="14"
        viewBox="0 0 16 16"
        width="14"
        {...props}
    >
        <path
            d="M5 7V5.8A3 3 0 0 1 8 2.9a3 3 0 0 1 3 2.9V7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
        />
        <rect
            fill="none"
            height="6.5"
            rx="1.4"
            stroke="currentColor"
            strokeWidth="1.4"
            width="8"
            x="4"
            y="7"
        />
        <circle cx="8" cy="10.2" fill="currentColor" r="1" />
    </svg>
);

const getFullscreenBackgroundColor = () => {
    const params = new URLSearchParams(location.search);
    if (params.has('fullscreen-background')) {
        return params.get('fullscreen-background');
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return '#111';
    }
    return 'white';
};

const fullscreenBackgroundColor = getFullscreenBackgroundColor();

const SNAPSHOT_REFERENCE_ATTRIBUTE_NAMES = [
    'fill',
    'stroke',
    'filter',
    'mask',
    'clip-path',
    'marker-start',
    'marker-mid',
    'marker-end',
    'href',
    'xlink:href',
    'aria-labelledby',
    'aria-describedby',
    'for'
];

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const replaceSnapshotIdReferences = (value, idMap) => {
    if (typeof value !== 'string' || !value) {
        return value;
    }

    let nextValue = value;
    idMap.forEach((nextId, previousId) => {
        const escapedPreviousId = escapeRegExp(previousId);
        nextValue = nextValue.replace(new RegExp(`url\\(#${escapedPreviousId}\\)`, 'g'), `url(#${nextId})`);
        if (nextValue === `#${previousId}`) {
            nextValue = `#${nextId}`;
        }
    });

    return nextValue;
};

const sanitizeSnapshotDom = (snapshotRoot, snapshotNamespace) => {
    if (!snapshotRoot) {
        return;
    }

    snapshotRoot.setAttribute('data-editor-window-snapshot', 'true');
    snapshotRoot.setAttribute('aria-hidden', 'true');

    const idMap = new Map();
    snapshotRoot.querySelectorAll('[id]').forEach((element, index) => {
        const previousId = element.getAttribute('id');
        if (!previousId) {
            return;
        }
        const nextId = `${snapshotNamespace}-${index}-${previousId}`;
        idMap.set(previousId, nextId);
        element.setAttribute('id', nextId);
    });

    if (idMap.size) {
        [snapshotRoot].concat(Array.from(snapshotRoot.querySelectorAll('*'))).forEach(element => {
            SNAPSHOT_REFERENCE_ATTRIBUTE_NAMES.forEach(attributeName => {
                const attributeValue = element.getAttribute(attributeName);
                if (!attributeValue) {
                    return;
                }
                element.setAttribute(attributeName, replaceSnapshotIdReferences(attributeValue, idMap));
            });

            const inlineStyle = element.getAttribute('style');
            if (inlineStyle) {
                element.setAttribute('style', replaceSnapshotIdReferences(inlineStyle, idMap));
            }
        });
    }
};

const GUIComponent = props => {
    const {
        accountNavOpen,
        activeTabIndex,
        alertsVisible,
        authorId,
        authorThumbnailUrl,
        authorUsername,
        basePath,
        backdropLibraryVisible,
        backpackHost,
        backpackVisible,
        blocksId,
        blocksTabVisible,
        cardsVisible,
        canChangeLanguage,
        canChangeTheme,
        canCreateNew,
        canEditTitle,
        canManageFiles,
        canRemix,
        canSave,
        canCreateCopy,
        canShare,
        canUseCloud,
        children,
        connectionModalVisible,
        costumeLibraryVisible,
        costumesTabVisible,
        customStageSize,
        enableCommunity,
        intl,
        isCreating,
        isEmbedded,
        isFullScreen,
        isPlayerOnly,
        isRtl,
        isShared,
        isWindowFullScreen,
        isTelemetryEnabled,
        isTotallyNormal,
        loading,
        logo,
        renderLogin,
        onClickAbout,
        onClickAccountNav,
        onCloseAccountNav,
        onClickAddonSettings,
        onClickDesktopSettings,
        onClickNewWindow,
        onClickPackager,
        onLogOut,
        onOpenRegistration,
        onToggleLoginOpen,
        onActivateCostumesTab,
        onActivateSoundsTab,
        onActivateTab,
        onClickLogo,
        onExtensionButtonClick,
        onOpenCustomExtensionModal,
        onOpenExtensionImportMethodModal,
        onSetSelectedExtension,
        onProjectTelemetryEvent,
        onRequestCloseBackdropLibrary,
        onRequestCloseCostumeLibrary,
        onRequestCloseTelemetryModal,
        onSeeCommunity,
        onShare,
        onShowPrivacyPolicy,
        onStartSelectingFileUpload,
        onTelemetryModalCancel,
        onTelemetryModalOptIn,
        onTelemetryModalOptOut,
        securityManager,
        showComingSoon,
        showOpenFilePicker,
        showSaveFilePicker,
        soundsTabVisible,
        stageSizeMode,
        targetIsStage,
        telemetryModalVisible,
        theme,
        tipsLibraryVisible,
        usernameModalVisible,
        settingsModalVisible,
        customExtensionModalVisible,
        extensionImportMethodModalVisible,
        fontsModalVisible,
        unknownPlatformModalVisible,
        invalidProjectModalVisible,
    gitModalVisible,
    onRequestCloseGitModal,
    collaborationModalVisible,
    onRequestCloseCollaborationModal,
    vm,
        customUI,
        editorBackground,
        editingTargetId,
        sprites,
        stage,
        ...componentProps
    } = omit(props, 'dispatch');

    const [stageWindowPosition, setStageWindowPosition] = React.useState({x: 350, y: 200}); //其实没什么实际含义
    const [stageWindowSize, setStageWindowSize] = React.useState({width: 485, height: 483});
    const [stageWindowContentSize, setStageWindowContentSize] = React.useState({width: 0, height: 0});
    const [stageWindowAutoFit, setStageWindowAutoFit] = React.useState(() => {
        const savedStageWindowState = windowStateStorage.getWindowState('stage');
        return !!(savedStageWindowState && savedStageWindowState.autoFit);
    });
    const [stageWindowMinimized, setStageWindowMinimized] = React.useState(false);
    const [targetPaneWindowPosition, setTargetPaneWindowPosition] = React.useState({x: 400, y: 275}); //也没什么含义
    const [targetPaneWindowSize, setTargetPaneWindowSize] = React.useState({width: 485, height: 447});
    const [targetPaneWindowMinimized, setTargetPaneWindowMinimized] = React.useState(false);
    const [menuBarCollapsed, setMenuBarCollapsed] = React.useState(false);
    const [editorWindowSessions, setEditorWindowSessions] = React.useState([]);
    const [activeEditorWindowId, setActiveEditorWindowId] = React.useState(null);
    const editorWindowSessionsRef = React.useRef(editorWindowSessions);
    const activeEditorWindowIdRef = React.useRef(activeEditorWindowId);
    const editorWindowIdCounterRef = React.useRef(0);
    const editorWindowZIndexRef = React.useRef(EDITOR_WINDOW_BASE_Z_INDEX);
    const lastRequestedEditingTargetIdRef = React.useRef(null);
    const pendingEditorWindowSyncRef = React.useRef(null);
    const previousCustomUIRef = React.useRef(customUI);
    const editorDesktopRef = React.useRef(null);
    const menuBarCollapsedRef = React.useRef(menuBarCollapsed);
    const activeEditorContentRef = React.useRef(null);
    const editorLayoutRefreshFrameRef = React.useRef(null);
    const addonEditorDomRefreshFrameRef = React.useRef(null);
    const snapshotNamespaceCounterRef = React.useRef(0);

    const handleStageWindowContentResize = React.useCallback((id, contentSize) => {
        setStageWindowContentSize(prevSize => {
            if (prevSize.width === contentSize.width && prevSize.height === contentSize.height) {
                return prevSize;
            }
            return contentSize;
        });
    }, []);

    const handleToggleStageWindowAutoFit = React.useCallback(() => {
        setStageWindowAutoFit(value => !value);
    }, []);

    const handleMenuBarCollapseChange = React.useCallback(collapsed => {
        menuBarCollapsedRef.current = collapsed;
        setMenuBarCollapsed(collapsed);
    }, []);

    React.useEffect(() => {
        menuBarCollapsedRef.current = menuBarCollapsed;
    }, [menuBarCollapsed]);

    const scheduleAddonEditorDomRefresh = React.useCallback(() => {
        if (addonEditorDomRefreshFrameRef.current !== null) {
            cancelAnimationFrame(addonEditorDomRefreshFrameRef.current);
        }
        const refreshAddons = () => {
            addonEditorDomRefreshFrameRef.current = null;
            if (window.addonAPI && typeof window.addonAPI.refreshAfterDomRemount === 'function') {
                window.addonAPI.refreshAfterDomRemount();
            }
        };
        if (typeof window.requestAnimationFrame === 'function') {
            addonEditorDomRefreshFrameRef.current = requestAnimationFrame(refreshAddons);
        } else {
            queueMicrotask(refreshAddons);
        }
    }, []);

    const setActiveEditorContentNode = React.useCallback(node => {
        const previousNode = activeEditorContentRef.current;
        if (previousNode && previousNode !== node) {
            previousNode.removeAttribute('data-sa-active-editor-root');
            if (window.__scratchGuiActiveEditorRoot === previousNode) {
                delete window.__scratchGuiActiveEditorRoot;
            }
        }

        activeEditorContentRef.current = node;

        if (node) {
            node.setAttribute('data-sa-active-editor-root', 'true');
            window.__scratchGuiActiveEditorRoot = node;
            if (previousNode !== node) {
                scheduleAddonEditorDomRefresh();
            }
        }
    }, [scheduleAddonEditorDomRefresh]);

    const syncWorkspaceGrid = React.useCallback(() => {
        const ScratchBlocks = window.ScratchBlocks;
        const workspace = ScratchBlocks && typeof ScratchBlocks.getMainWorkspace === 'function' ?
            ScratchBlocks.getMainWorkspace() :
            null;
        if (!workspace) {
            return;
        }

        const grid = typeof workspace.getGrid === 'function' ? workspace.getGrid() : workspace.grid_;
        if (!grid) {
            return;
        }

        try {
            if (typeof grid.update === 'function') {
                grid.update(workspace.scale || 1);
            }
            const metrics = typeof workspace.getMetrics === 'function' ? workspace.getMetrics() : null;
            const absoluteLeft = metrics && typeof metrics.absoluteLeft === 'number' ? metrics.absoluteLeft : 0;
            const absoluteTop = metrics && typeof metrics.absoluteTop === 'number' ? metrics.absoluteTop : 0;
            if (typeof grid.moveTo === 'function') {
                grid.moveTo((workspace.scrollX || 0) + absoluteLeft, (workspace.scrollY || 0) + absoluteTop);
            }
        } catch (error) {
            // Ignore transient grid sync errors during workspace remounts.
        }
    }, []);

    const scheduleEditorLayoutRefresh = React.useCallback(() => {
        if (editorLayoutRefreshFrameRef.current !== null) {
            cancelAnimationFrame(editorLayoutRefreshFrameRef.current);
        }
        editorLayoutRefreshFrameRef.current = requestAnimationFrame(() => {
            editorLayoutRefreshFrameRef.current = null;
            window.dispatchEvent(new Event('resize'));
            const ScratchBlocks = window.ScratchBlocks;
            if (ScratchBlocks && typeof ScratchBlocks.svgResize === 'function') {
                const workspace = typeof ScratchBlocks.getMainWorkspace === 'function' ?
                    ScratchBlocks.getMainWorkspace() :
                    null;
                if (workspace) {
                    try {
                        ScratchBlocks.svgResize(workspace);
                    } catch (error) {
                        // Ignore transient workspace resize errors during remounts.
                    }
                }
            }
            syncWorkspaceGrid();
        });
    }, [syncWorkspaceGrid]);

    React.useEffect(() => {
        editorWindowSessionsRef.current = editorWindowSessions;
    }, [editorWindowSessions]);

    React.useEffect(() => {
        activeEditorWindowIdRef.current = activeEditorWindowId;
    }, [activeEditorWindowId]);

    React.useEffect(() => () => {
        if (editorLayoutRefreshFrameRef.current !== null) {
            cancelAnimationFrame(editorLayoutRefreshFrameRef.current);
            editorLayoutRefreshFrameRef.current = null;
        }
        if (addonEditorDomRefreshFrameRef.current !== null) {
            cancelAnimationFrame(addonEditorDomRefreshFrameRef.current);
            addonEditorDomRefreshFrameRef.current = null;
        }
    }, []);

    const getTargetById = React.useCallback(targetId => {
        if (!targetId) {
            return null;
        }
        if (stage && stage.id === targetId) {
            return stage;
        }
        return sprites[targetId] || null;
    }, [sprites, stage]);

    const getTargetDisplayName = React.useCallback(targetId => {
        const target = getTargetById(targetId);
        if (!target) {
            return intl.formatMessage(messages.stageTargetName);
        }
        if (target.isStage) {
            return target.name || intl.formatMessage(messages.stageTargetName);
        }
        return target.name;
    }, [getTargetById, intl]);

    const commitEditorWindowState = React.useCallback((nextSessions, nextActiveId = activeEditorWindowIdRef.current) => {
        editorWindowSessionsRef.current = nextSessions;
        activeEditorWindowIdRef.current = nextActiveId;
        setEditorWindowSessions(nextSessions);
        setActiveEditorWindowId(nextActiveId);
    }, []);

    const getEditorFullScreenGeometry = React.useCallback(() => {
        const desktopRect = editorDesktopRef.current ?
            editorDesktopRef.current.getBoundingClientRect() :
            null;
        const width = desktopRect ? desktopRect.width : window.innerWidth;
        const height = desktopRect ? desktopRect.height : window.innerHeight;
        return {
            position: {
                x: 0,
                y: 0
            },
            size: {
                width: Math.max(0, Math.round(width)),
                height: Math.max(0, Math.round(height))
            }
        };
    }, []);

    const getInitialEditorWindowGeometry = React.useCallback(cascadeIndex => {
        const desktopRect = editorDesktopRef.current ?
            editorDesktopRef.current.getBoundingClientRect() :
            null;
        const desktopWidth = desktopRect ? desktopRect.width : window.innerWidth;
        const desktopHeight = desktopRect ? desktopRect.height : window.innerHeight;
        const position = {
            x: Math.max(0, EDITOR_WINDOW_INITIAL_MARGIN_X + (cascadeIndex * EDITOR_WINDOW_INITIAL_CASCADE_X)),
            y: Math.max(0, EDITOR_WINDOW_INITIAL_TOP_OFFSET + (cascadeIndex * EDITOR_WINDOW_INITIAL_CASCADE_Y))
        };
        const size = {
            width: Math.max(
                Math.min(EDITOR_WINDOW_DEFAULT_SIZE.width, Math.round(desktopWidth)),
                Math.round(desktopWidth - position.x - EDITOR_WINDOW_INITIAL_MARGIN_X)
            ),
            height: Math.max(
                Math.min(EDITOR_WINDOW_DEFAULT_SIZE.height, Math.round(desktopHeight)),
                Math.round(desktopHeight - position.y - EDITOR_WINDOW_INITIAL_MARGIN_BOTTOM)
            )
        };
        return {
            position,
            size
        };
    }, []);

    const createEditorWindowSession = React.useCallback((targetId, overrides = {}) => {
        const cascadeIndex = editorWindowSessionsRef.current.length % 6;
        const nextZIndex = ++editorWindowZIndexRef.current;
        const initialGeometry = getInitialEditorWindowGeometry(cascadeIndex);
        editorWindowIdCounterRef.current += 1;
        return {
            id: `editor-${editorWindowIdCounterRef.current}`,
            targetId,
            locked: false,
            activeTabIndex: BLOCKS_TAB_INDEX,
            isFullScreen: false,
            isMinimized: false,
            snapshotMarkup: null,
            snapshotSize: null,
            snapshotThemeId: null,
            position: initialGeometry.position,
            size: initialGeometry.size,
            normalPosition: initialGeometry.position,
            normalSize: initialGeometry.size,
            zIndex: nextZIndex,
            lastFocusedAt: nextZIndex,
            ...overrides
        };
    }, [getInitialEditorWindowGeometry]);

    const createEditorWindowSnapshot = React.useCallback(() => {
        const sourceNode = activeEditorContentRef.current;
        if (!sourceNode) {
            return null;
        }
        const width = sourceNode.clientWidth;
        const height = sourceNode.clientHeight;
        if (!width || !height) {
            return null;
        }

        const snapshotRoot = sourceNode.cloneNode(true);
        snapshotRoot.removeAttribute('data-sa-active-editor-root');
        snapshotRoot.querySelectorAll('[data-sa-active-editor-root]').forEach(element => {
            element.removeAttribute('data-sa-active-editor-root');
        });
        snapshotRoot.style.width = `${width}px`;
        snapshotRoot.style.height = `${height}px`;

        const originalCanvases = sourceNode.querySelectorAll('canvas');
        const clonedCanvases = snapshotRoot.querySelectorAll('canvas');
        clonedCanvases.forEach((clonedCanvas, index) => {
            const originalCanvas = originalCanvases[index];
            if (!originalCanvas || !clonedCanvas.parentNode) {
                return;
            }
            try {
                const image = document.createElement('img');
                image.src = originalCanvas.toDataURL();
                image.width = originalCanvas.width;
                image.height = originalCanvas.height;
                image.className = clonedCanvas.className;
                image.style.cssText = clonedCanvas.getAttribute('style') || '';
                image.setAttribute('draggable', 'false');
                clonedCanvas.parentNode.replaceChild(image, clonedCanvas);
            } catch (error) {
                // Ignore canvases that cannot be serialized.
            }
        });

        computedStyleToInlineStyle(snapshotRoot, {recursive: true});
        snapshotNamespaceCounterRef.current += 1;
        sanitizeSnapshotDom(snapshotRoot, `editor-snapshot-${snapshotNamespaceCounterRef.current}`);

        snapshotRoot.style.width = '100%';
        snapshotRoot.style.height = '100%';
        snapshotRoot.style.pointerEvents = 'none';

        return {
            snapshotMarkup: snapshotRoot.outerHTML,
            snapshotSize: {width, height},
            snapshotThemeId: theme.id
        };
    }, [theme.id]);

    const captureSessionSnapshot = React.useCallback((sessions, sessionId) => {
        if (!sessionId) {
            return sessions;
        }
        const snapshot = createEditorWindowSnapshot();
        if (!snapshot) {
            return sessions;
        }
        return sessions.map(session => {
            if (session.id !== sessionId) {
                return session;
            }
            return {
                ...session,
                snapshotMarkup: snapshot.snapshotMarkup,
                snapshotSize: snapshot.snapshotSize,
                snapshotThemeId: snapshot.snapshotThemeId
            };
        });
    }, [createEditorWindowSnapshot]);

    const syncFullScreenEditorWindowGeometry = React.useCallback(() => {
        const fullScreenGeometry = getEditorFullScreenGeometry();
        let hasChanges = false;
        const nextSessions = editorWindowSessionsRef.current.map(session => {
            if (!session.isFullScreen) {
                return session;
            }
            const needsPositionUpdate =
                session.position.x !== fullScreenGeometry.position.x ||
                session.position.y !== fullScreenGeometry.position.y;
            const needsSizeUpdate =
                session.size.width !== fullScreenGeometry.size.width ||
                session.size.height !== fullScreenGeometry.size.height;
            if (!needsPositionUpdate && !needsSizeUpdate) {
                return session;
            }
            hasChanges = true;
            return {
                ...session,
                position: fullScreenGeometry.position,
                size: fullScreenGeometry.size
            };
        });

        if (!hasChanges) {
            return;
        }

        commitEditorWindowState(nextSessions);
        if (nextSessions.some(session => session.id === activeEditorWindowIdRef.current && session.isFullScreen)) {
            scheduleEditorLayoutRefresh();
        }
    }, [commitEditorWindowState, getEditorFullScreenGeometry, scheduleEditorLayoutRefresh]);

    React.useEffect(() => {
        if (!customUI || !activeEditorWindowId) {
            return;
        }
        scheduleEditorLayoutRefresh();
    }, [activeEditorWindowId, customUI, scheduleEditorLayoutRefresh, theme.id]);

    React.useLayoutEffect(() => {
        if (!customUI) {
            return;
        }
        menuBarCollapsedRef.current = menuBarCollapsed;
        syncFullScreenEditorWindowGeometry();
    }, [customUI, menuBarCollapsed, syncFullScreenEditorWindowGeometry]);

    React.useEffect(() => {
        if (!customUI) {
            return undefined;
        }

        let resizeFrame = null;
        const scheduleSync = () => {
            if (resizeFrame !== null) {
                cancelAnimationFrame(resizeFrame);
            }
            resizeFrame = requestAnimationFrame(() => {
                resizeFrame = null;
                syncFullScreenEditorWindowGeometry();
            });
        };

        let resizeObserver = null;
        if (typeof ResizeObserver !== 'undefined' && editorDesktopRef.current) {
            resizeObserver = new ResizeObserver(scheduleSync);
            resizeObserver.observe(editorDesktopRef.current);
        }
        window.addEventListener('resize', scheduleSync);
        scheduleSync();

        return () => {
            if (resizeFrame !== null) {
                cancelAnimationFrame(resizeFrame);
            }
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
            window.removeEventListener('resize', scheduleSync);
        };
    }, [customUI, syncFullScreenEditorWindowGeometry]);

    const findEditorWindowFallback = React.useCallback((sessions, excludedId = null) => {
        const candidates = sessions.filter(session => session.id !== excludedId);
        const visibleCandidates = candidates.filter(session => !session.isMinimized);
        const orderedCandidates = (visibleCandidates.length ? visibleCandidates : candidates)
            .slice()
            .sort((a, b) => b.lastFocusedAt - a.lastFocusedAt);
        return orderedCandidates[0] || null;
    }, []);

    const syncEditorWindowContext = React.useCallback((session, {syncVm = true, syncTab = true} = {}) => {
        if (!session) {
            return;
        }
        if (syncVm && session.targetId) {
            const currentTargetId = vm.editingTarget ? vm.editingTarget.id : null;
            if (currentTargetId !== session.targetId) {
                lastRequestedEditingTargetIdRef.current = session.targetId;
                vm.setEditingTarget(session.targetId);
            }
        }
        if (syncTab && session.activeTabIndex !== activeTabIndex) {
            onActivateTab(session.activeTabIndex);
        }
    }, [activeTabIndex, onActivateTab, vm]);

    React.useLayoutEffect(() => {
        if (!customUI) {
            pendingEditorWindowSyncRef.current = null;
            return;
        }

        const pendingSync = pendingEditorWindowSyncRef.current;
        if (!pendingSync || pendingSync.windowId !== activeEditorWindowId) {
            return;
        }

        const activeSession = editorWindowSessions.find(session => session.id === pendingSync.windowId);
        if (!activeSession) {
            pendingEditorWindowSyncRef.current = null;
            return;
        }

        pendingEditorWindowSyncRef.current = null;
        syncEditorWindowContext(activeSession, {
            syncVm: pendingSync.syncVm,
            syncTab: pendingSync.syncTab
        });

        requestAnimationFrame(() => {
            if (activeEditorWindowIdRef.current === activeSession.id) {
                scheduleEditorLayoutRefresh();
                scheduleAddonEditorDomRefresh();
            }
        });
    }, [
        activeEditorWindowId,
        customUI,
        editorWindowSessions,
        scheduleAddonEditorDomRefresh,
        scheduleEditorLayoutRefresh,
        syncEditorWindowContext
    ]);

    const updateEditorWindowSession = React.useCallback((windowId, updater) => {
        let updatedSession = null;
        let hasChanges = false;
        const nextSessions = editorWindowSessionsRef.current.map(session => {
            if (session.id !== windowId) {
                return session;
            }
            const partialUpdate = updater(session);
            if (!partialUpdate) {
                updatedSession = session;
                return session;
            }
            const hasSessionChanges = Object.keys(partialUpdate)
                .some(key => session[key] !== partialUpdate[key]);
            if (!hasSessionChanges) {
                updatedSession = session;
                return session;
            }
            updatedSession = {
                ...session,
                ...partialUpdate
            };
            hasChanges = true;
            return updatedSession;
        });
        if (hasChanges) {
            commitEditorWindowState(nextSessions);
        }
        return updatedSession;
    }, [commitEditorWindowState]);

    const activateEditorWindow = React.useCallback((windowId, options = {}) => {
        const currentSessions = editorWindowSessionsRef.current;
        const sessionIndex = currentSessions.findIndex(session => session.id === windowId);
        if (sessionIndex === -1) {
            return;
        }
        const currentActiveId = activeEditorWindowIdRef.current;
        let nextSessions = currentSessions;
        if (currentActiveId && currentActiveId !== windowId) {
            nextSessions = captureSessionSnapshot(nextSessions, currentActiveId);
        }
        const nextZIndex = ++editorWindowZIndexRef.current;
        nextSessions = nextSessions.map((session, index) => {
            if (index !== sessionIndex) {
                return session;
            }
            return {
                ...session,
                activeTabIndex: typeof options.activeTabIndex === 'number' ? options.activeTabIndex : session.activeTabIndex,
                isMinimized: false,
                zIndex: nextZIndex,
                lastFocusedAt: nextZIndex
            };
        });
        commitEditorWindowState(nextSessions, windowId);
        pendingEditorWindowSyncRef.current = {
            windowId,
            syncVm: options.syncVm !== false,
            syncTab: options.syncTab !== false
        };
    }, [captureSessionSnapshot, commitEditorWindowState]);

    const handleEditorTargetSelection = React.useCallback((targetId, options = {}) => {
        if (!targetId || !getTargetById(targetId)) {
            return;
        }

        const currentSessions = editorWindowSessionsRef.current.slice();
        const activeSession = currentSessions.find(session => session.id === activeEditorWindowIdRef.current) || null;
        const inheritedTabIndex = typeof options.activeTabIndex === 'number' ?
            options.activeTabIndex :
            (activeSession ? activeSession.activeTabIndex : BLOCKS_TAB_INDEX);

        let nextSessions = currentSessions;
        let nextActiveId = null;
        const existingSession = currentSessions.find(session => session.targetId === targetId);

        if (existingSession) {
            nextActiveId = existingSession.id;
            nextSessions = currentSessions.map(session => (
                session.id === existingSession.id ? {
                    ...session,
                    isMinimized: false
                } : session
            ));
        } else if (activeSession && !activeSession.locked) {
            nextActiveId = activeSession.id;
            nextSessions = currentSessions.map(session => (
                session.id === activeSession.id ? {
                    ...session,
                    targetId,
                    activeTabIndex: inheritedTabIndex,
                    isMinimized: false
                } : session
            ));
        } else {
            const newSession = createEditorWindowSession(targetId, {
                activeTabIndex: inheritedTabIndex
            });
            nextSessions = currentSessions.concat(newSession);
            nextActiveId = newSession.id;
        }

        if (activeSession && activeSession.id !== nextActiveId) {
            nextSessions = captureSessionSnapshot(nextSessions, activeSession.id);
        }

        const nextZIndex = ++editorWindowZIndexRef.current;
        nextSessions = nextSessions.map(session => (
            session.id === nextActiveId ? {
                ...session,
                isMinimized: false,
                zIndex: nextZIndex,
                lastFocusedAt: nextZIndex
            } : session
        ));

        commitEditorWindowState(nextSessions, nextActiveId);
        pendingEditorWindowSyncRef.current = {
            windowId: nextActiveId,
            syncVm: options.syncVm !== false,
            syncTab: options.syncTab !== false
        };
    }, [commitEditorWindowState, createEditorWindowSession, getTargetById]);

    const handleEditorWindowPositionChange = React.useCallback((windowId, position) => {
        updateEditorWindowSession(windowId, session => ({
            position,
            normalPosition: position,
            isFullScreen: session.isFullScreen ? false : session.isFullScreen
        }));
    }, [updateEditorWindowSession]);

    const handleEditorWindowSizeChange = React.useCallback((windowId, size) => {
        updateEditorWindowSession(windowId, session => ({
            size,
            normalSize: size,
            isFullScreen: session.isFullScreen ? false : session.isFullScreen
        }));
        if (windowId === activeEditorWindowIdRef.current) {
            scheduleEditorLayoutRefresh();
        }
    }, [scheduleEditorLayoutRefresh, updateEditorWindowSession]);

    const handleEditorWindowFullScreenToggle = React.useCallback((windowId, currentlyFullScreen, currentPosition, currentSize) => {
        updateEditorWindowSession(windowId, session => {
            if (currentlyFullScreen || session.isFullScreen) {
                return {
                    isFullScreen: false,
                    position: session.normalPosition || session.position,
                    size: session.normalSize || session.size
                };
            }
            const fullScreenGeometry = getEditorFullScreenGeometry();
            return {
                isFullScreen: true,
                normalPosition: currentPosition,
                normalSize: currentSize,
                position: fullScreenGeometry.position,
                size: fullScreenGeometry.size
            };
        });
        if (windowId === activeEditorWindowIdRef.current) {
            scheduleEditorLayoutRefresh();
        }
    }, [getEditorFullScreenGeometry, scheduleEditorLayoutRefresh, updateEditorWindowSession]);

    const handleEditorWindowLockToggle = React.useCallback(windowId => {
        updateEditorWindowSession(windowId, session => ({
            locked: !session.locked
        }));
    }, [updateEditorWindowSession]);

    const restoreEditorWindow = React.useCallback(windowId => {
        updateEditorWindowSession(windowId, () => ({isMinimized: false}));
        activateEditorWindow(windowId);
    }, [activateEditorWindow, updateEditorWindowSession]);

    const handleEditorWindowMinimizeToggle = React.useCallback((windowId, minimized) => {
        const nextSessions = editorWindowSessionsRef.current.map(session => (
            session.id === windowId ? {
                ...session,
                isMinimized: minimized
            } : session
        ));
        let nextActiveId = activeEditorWindowIdRef.current;
        if (minimized && activeEditorWindowIdRef.current === windowId) {
            const fallbackSession = findEditorWindowFallback(nextSessions, windowId);
            nextActiveId = fallbackSession ? fallbackSession.id : null;
        }
        commitEditorWindowState(nextSessions, nextActiveId);
        if (nextActiveId) {
            pendingEditorWindowSyncRef.current = {
                windowId: nextActiveId,
                syncVm: true,
                syncTab: true
            };
        } else {
            pendingEditorWindowSyncRef.current = null;
        }
    }, [commitEditorWindowState, findEditorWindowFallback]);

    const handleEditorWindowClose = React.useCallback(windowId => {
        const nextSessions = editorWindowSessionsRef.current.filter(session => session.id !== windowId);
        let nextActiveId = activeEditorWindowIdRef.current;
        if (activeEditorWindowIdRef.current === windowId) {
            const fallbackSession = findEditorWindowFallback(nextSessions);
            nextActiveId = fallbackSession ? fallbackSession.id : null;
        }
        commitEditorWindowState(nextSessions, nextActiveId);
        if (nextActiveId) {
            pendingEditorWindowSyncRef.current = {
                windowId: nextActiveId,
                syncVm: true,
                syncTab: true
            };
        } else {
            pendingEditorWindowSyncRef.current = null;
        }
    }, [commitEditorWindowState, findEditorWindowFallback]);

    const handleActiveEditorTabSelect = React.useCallback(tabIndex => {
        onActivateTab(tabIndex);
        if (!customUI) {
            return;
        }
        const activeWindowId = activeEditorWindowIdRef.current;
        if (!activeWindowId) {
            return;
        }
        updateEditorWindowSession(activeWindowId, session => (
            session.activeTabIndex === tabIndex ? null : {activeTabIndex: tabIndex}
        ));
        scheduleEditorLayoutRefresh();
    }, [customUI, onActivateTab, scheduleEditorLayoutRefresh, updateEditorWindowSession]);

    const handleEditorWindowContentResize = React.useCallback(windowId => {
        if (windowId === activeEditorWindowIdRef.current) {
            scheduleEditorLayoutRefresh();
        }
    }, [scheduleEditorLayoutRefresh]);

    React.useEffect(() => {
        if (!customUI || !activeEditorWindowId) {
            return;
        }
        const activeSession = editorWindowSessionsRef.current.find(
            session => session.id === activeEditorWindowId
        );
        if (!activeSession || activeSession.activeTabIndex === activeTabIndex) {
            return;
        }
        updateEditorWindowSession(activeEditorWindowId, () => ({
            activeTabIndex
        }));
    }, [activeEditorWindowId, activeTabIndex, customUI, updateEditorWindowSession]);

    React.useEffect(() => {
        const wasCustomUI = previousCustomUIRef.current;
        previousCustomUIRef.current = customUI;
        if (customUI && !wasCustomUI && !editorWindowSessionsRef.current.length && editingTargetId) {
            handleEditorTargetSelection(editingTargetId, {
                activeTabIndex,
                syncVm: false
            });
        }
    }, [activeTabIndex, customUI, editingTargetId, handleEditorTargetSelection]);

    React.useEffect(() => {
        if (!customUI || !editingTargetId) {
            return;
        }
        if (lastRequestedEditingTargetIdRef.current === editingTargetId) {
            lastRequestedEditingTargetIdRef.current = null;
            return;
        }
        const activeSession = editorWindowSessionsRef.current.find(
            session => session.id === activeEditorWindowIdRef.current
        );
        if (activeSession && activeSession.targetId === editingTargetId) {
            return;
        }
        handleEditorTargetSelection(editingTargetId, {
            syncVm: false
        });
    }, [customUI, editingTargetId, handleEditorTargetSelection]);

    React.useEffect(() => {
        if (!customUI || !activeEditorWindowId) {
            return;
        }
        scheduleEditorLayoutRefresh();
    }, [activeEditorWindowId, activeTabIndex, customUI, scheduleEditorLayoutRefresh]);

    React.useEffect(() => {
        if (!customUI) {
            return;
        }
        const validTargetIds = new Set(Object.keys(sprites));
        if (stage && stage.id) {
            validTargetIds.add(stage.id);
        }
        const currentSessions = editorWindowSessionsRef.current;
        let nextSessions = currentSessions.filter(session => validTargetIds.has(session.targetId));
        if (nextSessions.length === currentSessions.length) {
            return;
        }

        let nextActiveId = nextSessions.some(session => session.id === activeEditorWindowIdRef.current) ?
            activeEditorWindowIdRef.current :
            null;

        if (!nextActiveId) {
            const fallbackSession = findEditorWindowFallback(nextSessions);
            nextActiveId = fallbackSession ? fallbackSession.id : null;
        }

        if (!nextSessions.length && editingTargetId && validTargetIds.has(editingTargetId)) {
            const newSession = createEditorWindowSession(editingTargetId, {
                activeTabIndex
            });
            nextSessions = [newSession];
            nextActiveId = newSession.id;
        }

        commitEditorWindowState(nextSessions, nextActiveId);
        if (nextActiveId) {
            const nextActiveSession = nextSessions.find(session => session.id === nextActiveId);
            syncEditorWindowContext(nextActiveSession, {
                syncVm: true,
                syncTab: true
            });
        }
    }, [
        activeTabIndex,
        commitEditorWindowState,
        createEditorWindowSession,
        customUI,
        editingTargetId,
        findEditorWindowFallback,
        sprites,
        stage,
        syncEditorWindowContext
    ]);

    const renderEditorWindowTitle = React.useCallback(session => (
        <span className={styles.editorWindowTitleText}>
            {getTargetDisplayName(session.targetId)}
        </span>
    ), [getTargetDisplayName]);

    const renderEditorWindowHeaderActions = React.useCallback(session => (
        <button
            className={classNames(styles.editorWindowHeaderButton, {
                [styles.editorWindowHeaderButtonActive]: session.locked
            })}
            onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                handleEditorWindowLockToggle(session.id);
            }}
            title={intl.formatMessage(
                session.locked ? messages.editorWindowUnlock : messages.editorWindowLock
            )}
            type="button"
        >
            <WindowLockIcon />
        </button>
    ), [handleEditorWindowLockToggle, intl]);

    const activeEditorSession = customUI ?
        (editorWindowSessions.find(session => session.id === activeEditorWindowId) || null) :
        null;
    const activeEditorSessionReady = !customUI || !activeEditorSession ||
        activeEditorSession.targetId === editingTargetId;
    const blocksLayoutToken = customUI && activeEditorSession ?
        [
            activeEditorSession.id,
            activeEditorSession.targetId || '',
            activeEditorSession.activeTabIndex,
            activeEditorSession.size && activeEditorSession.size.width,
            activeEditorSession.size && activeEditorSession.size.height,
            editingTargetId || ''
        ].join(':') :
        `legacy:${editingTargetId || ''}:${activeTabIndex}`;

    const renderEditorWrapper = stageSize => (
        <Box
            className={styles.editorWrapper}
            componentRef={setActiveEditorContentNode}
            data-sa-active-editor-root="true"
        >
            <Tabs
                forceRenderTabPanel
                className={tabClassNames.tabs}
                selectedIndex={activeTabIndex}
                selectedTabClassName={tabClassNames.tabSelected}
                selectedTabPanelClassName={tabClassNames.tabPanelSelected}
                onSelect={handleActiveEditorTabSelect}
            >
                <TabList className={tabClassNames.tabList}>
                    <Tab className={tabClassNames.tab}>
                        <img
                            draggable={false}
                            src={codeIcon()}
                        />
                        <FormattedMessage
                            defaultMessage="Code"
                            description="Button to get to the code panel"
                            id="gui.gui.codeTab"
                        />
                    </Tab>
                    <Tab className={tabClassNames.tab}>
                        <img
                            draggable={false}
                            src={costumesIcon()}
                        />
                        {targetIsStage ? (
                            <FormattedMessage
                                defaultMessage="Backdrops"
                                description="Button to get to the backdrops panel"
                                id="gui.gui.backdropsTab"
                            />
                        ) : (
                            <FormattedMessage
                                defaultMessage="Costumes"
                                description="Button to get to the costumes panel"
                                id="gui.gui.costumesTab"
                            />
                        )}
                    </Tab>
                    <Tab className={tabClassNames.tab}>
                        <img
                            draggable={false}
                            src={soundsIcon()}
                        />
                        <FormattedMessage
                            defaultMessage="Sounds"
                            description="Button to get to the sounds panel"
                            id="gui.gui.soundsTab"
                        />
                    </Tab>
                </TabList>
                <TabPanel className={tabClassNames.tabPanel}>
                    <Box className={styles.blocksWrapper}>
                        <Blocks
                            key={`${blocksId}/${theme.id}`}
                            canUseCloud={canUseCloud}
                            grow={1}
                            isVisible={blocksTabVisible}
                            options={{
                                media: `${basePath}static/${theme.getBlocksMediaFolder()}/`
                            }}
                            stageSize={stageSize}
                            onOpenCustomExtensionModal={onOpenCustomExtensionModal}
                            onOpenExtensionImportMethodModal={onOpenExtensionImportMethodModal}
                            onSetSelectedExtension={onSetSelectedExtension}
                            layoutToken={blocksLayoutToken}
                            theme={theme}
                            vm={vm}
                        />
                    </Box>
                    <Box className={styles.extensionButtonContainer}>
                        <button
                            className={styles.extensionButton}
                            title={intl.formatMessage(messages.addExtension)}
                            onClick={onExtensionButtonClick}
                        >
                            <img
                                className={styles.extensionButtonIcon}
                                draggable={false}
                                src={addExtensionIcon}
                            />
                        </button>
                    </Box>
                    <Box className={styles.watermark}>
                        <Watermark />
                    </Box>
                </TabPanel>
                <TabPanel className={tabClassNames.tabPanel}>
                    {costumesTabVisible ? <CostumeTab vm={vm} /> : null}
                </TabPanel>
                <TabPanel className={tabClassNames.tabPanel}>
                    {soundsTabVisible ? <SoundTab vm={vm} /> : null}
                </TabPanel>
            </Tabs>
            {backpackVisible ? (
                <Backpack host={backpackHost} />
            ) : null}
        </Box>
    );

    const renderEditorWindowPreview = React.useCallback(session => {
        if (session.snapshotMarkup) {
            return (
                <Box className={styles.editorWindowSnapshot}>
                    <div
                        className={styles.editorWindowSnapshotContent}
                        dangerouslySetInnerHTML={{__html: session.snapshotMarkup}}
                    />
                </Box>
            );
        }

        const target = getTargetById(session.targetId);
        if (!target) {
            return (
                <Box className={styles.editorWindowPreview}>
                    <div className={styles.editorWindowPreviewTitle}>
                        {getTargetDisplayName(session.targetId)}
                    </div>
                    <div className={styles.editorWindowPreviewHint}>
                        {intl.formatMessage(messages.editorWindowNoPreview)}
                    </div>
                </Box>
            );
        }

        const costumes = target.costumes || [];
        const currentCostume = costumes[clampIndex(target.currentCostume, costumes.length)] || null;
        const costumeUrl = currentCostume && currentCostume.asset ? getCostumeUrl(currentCostume.asset) : null;

        return (
            <Box className={styles.editorWindowPreview}>
                <div className={styles.editorWindowPreviewTitle}>
                    {getTargetDisplayName(session.targetId)}
                </div>
                <div className={styles.editorWindowPreviewBody}>
                    <div className={styles.editorWindowPreviewImageFrame}>
                        {costumeUrl ? (
                            <img
                                alt={currentCostume.name}
                                className={styles.editorWindowPreviewImage}
                                draggable={false}
                                src={costumeUrl}
                            />
                        ) : (
                            <div className={styles.editorWindowPreviewEmpty}>
                                {intl.formatMessage(messages.editorWindowNoPreview)}
                            </div>
                        )}
                    </div>
                    <div className={styles.editorWindowPreviewMeta}>
                        <div className={styles.editorWindowPreviewSubtitle}>
                            {currentCostume ? currentCostume.name : intl.formatMessage(messages.editorWindowNoPreview)}
                        </div>
                        <div className={styles.editorWindowPreviewHint}>
                            {intl.formatMessage(messages.editorWindowPreviewHint)}
                        </div>
                    </div>
                </div>
            </Box>
        );
    }, [getTargetById, getTargetDisplayName, intl]);

    const renderEditorWindows = React.useCallback(stageSize => {
        const activeSession = editorWindowSessions.find(session => session.id === activeEditorWindowId) || null;
        const inactiveWindows = editorWindowSessions
            .filter(session => session.id !== activeEditorWindowId)
            .map(session => (
                <DraggableWindow
                    key={session.id}
                    allowMaximize
                    allowMinimize={false}
                    className={styles.editorDraggableWindow}
                    defaultPosition={session.position}
                    defaultSize={session.size}
                    enableStatePersistence={false}
                    headerActions={renderEditorWindowHeaderActions(session)}
                    isFullScreen={session.isFullScreen}
                    isMinimized={session.isMinimized}
                    maxSize={EDITOR_WINDOW_MAX_SIZE}
                    minSize={EDITOR_WINDOW_MIN_SIZE}
                    onActivate={activateEditorWindow}
                    onClose={handleEditorWindowClose}
                    onDragStop={handleEditorWindowPositionChange}
                    onFullScreenToggle={handleEditorWindowFullScreenToggle}
                    onMinimizeToggle={handleEditorWindowMinimizeToggle}
                    onResizeStop={handleEditorWindowSizeChange}
                    position={session.position}
                    size={session.size}
                    title={renderEditorWindowTitle(session)}
                    windowId={session.id}
                    zIndex={session.zIndex}
                >
                    {renderEditorWindowPreview(session)}
                </DraggableWindow>
            ));

        if (!activeSession) {
            return inactiveWindows;
        }

        return inactiveWindows.concat(
                <DraggableWindow
                    key={activeSession.id}
                    allowMaximize
                    allowMinimize={false}
                    className={styles.editorDraggableWindow}
                defaultPosition={activeSession.position}
                defaultSize={activeSession.size}
                    enableStatePersistence={false}
                    headerActions={renderEditorWindowHeaderActions(activeSession)}
                    isFullScreen={activeSession.isFullScreen}
                    isMinimized={activeSession.isMinimized}
                    maxSize={EDITOR_WINDOW_MAX_SIZE}
                    minSize={EDITOR_WINDOW_MIN_SIZE}
                    onActivate={activateEditorWindow}
                    onClose={handleEditorWindowClose}
                    onContentResize={handleEditorWindowContentResize}
                    onDragStop={handleEditorWindowPositionChange}
                    onFullScreenToggle={handleEditorWindowFullScreenToggle}
                    onMinimizeToggle={handleEditorWindowMinimizeToggle}
                    onResizeStop={handleEditorWindowSizeChange}
                    position={activeSession.position}
                size={activeSession.size}
                title={renderEditorWindowTitle(activeSession)}
                windowId={activeSession.id}
                zIndex={activeSession.zIndex}
            >
                <Box className={styles.editorWindowBody}>
                    {activeEditorSessionReady ? renderEditorWrapper(stageSize) : renderEditorWindowPreview(activeSession)}
                </Box>
            </DraggableWindow>
        );
    }, [
        activateEditorWindow,
        activeEditorSessionReady,
        activeEditorWindowId,
        editorWindowSessions,
        handleEditorWindowClose,
        handleEditorWindowContentResize,
        handleEditorWindowFullScreenToggle,
        handleEditorWindowMinimizeToggle,
        handleEditorWindowPositionChange,
        handleEditorWindowSizeChange,
        renderEditorWindowHeaderActions,
        renderEditorWindowPreview,
        renderEditorWindowTitle,
        theme.id
    ]);

    if (children) {
        return <Box {...componentProps}>{children}</Box>;
    }

    // 全局最小化窗口栏数据
    const minimizedWindows = [];
    if (stageWindowMinimized) {
        minimizedWindows.push({
            windowId: 'stage',
            title: 'Stage',
            icon: (
                <svg width="22" height="22" viewBox="0 0 20 20" fill="white">
                    <rect x="2" y="2" width="16" height="16" rx="2" stroke="white" strokeWidth="1" fill="none"/>
                    <rect x="6" y="6" width="8" height="8" fill="white"/>
                </svg>
            ),
            onRestore: () => setStageWindowMinimized(false)
        });
    }
    if (targetPaneWindowMinimized) {
        minimizedWindows.push({
            windowId: 'targets',
            title: 'Sprites',
            icon: (
                <svg width="22" height="22" viewBox="0 0 20 20" fill="white">
                    <circle cx="10" cy="6" r="3" fill="white"/>
                    <circle cx="5" cy="12" r="2.5" fill="white"/>
                    <circle cx="15" cy="12" r="2.5" fill="white"/>
                </svg>
            ),
            onRestore: () => setTargetPaneWindowMinimized(false)
        });
    }
    editorWindowSessions
        .filter(session => session.isMinimized)
        .forEach(session => {
            const iconSource = session.activeTabIndex === COSTUMES_TAB_INDEX ?
                costumesIcon() :
                (session.activeTabIndex === SOUNDS_TAB_INDEX ? soundsIcon() : codeIcon());
            minimizedWindows.push({
                windowId: session.id,
                title: getTargetDisplayName(session.targetId),
                icon: (
                    <img
                        alt=""
                        draggable={false}
                        src={iconSource}
                        style={{height: 18, width: 18}}
                    />
                ),
                onRestore: () => restoreEditorWindow(session.id)
            });
        });

    const tabClassNames = {
        tabs: styles.tabs,
        tab: classNames(tabStyles.reactTabsTab, styles.tab),
        tabList: classNames(tabStyles.reactTabsTabList, styles.tabList),
        tabPanel: classNames(tabStyles.reactTabsTabPanel, styles.tabPanel),
        tabPanelSelected: classNames(tabStyles.reactTabsTabPanelSelected, styles.isSelected),
        tabSelected: classNames(tabStyles.reactTabsTabSelected, styles.isSelected)
    };
    const hideFloatingWindows = loading || isCreating;
    const windowBackgroundActive = customUI && hasEditorBackgroundTarget(
        editorBackground,
        EDITOR_BACKGROUND_TARGETS.WINDOW
    );
    const effectiveMenuBarCollapsed = customUI && menuBarCollapsed;
    const editorAlertsClassName = classNames(styles.alertsContainer, {
        [styles.alertsContainerHidden]: effectiveMenuBarCollapsed
    });

    const unconstrainedWidth = (
        UNCONSTRAINED_NON_STAGE_WIDTH +
        FIXED_WIDTH +
        Math.max(0, customStageSize.width - FIXED_WIDTH)
    );
    return (<MediaQuery minWidth={unconstrainedWidth}>{isUnconstrained => {
        const stageSize = resolveStageSize(stageSizeMode, isUnconstrained);

        const alwaysEnabledModals = (
            <React.Fragment>
                <TWSecurityManager securityManager={securityManager} />
                <TWRestorePointManager />
                {usernameModalVisible && <TWUsernameModal />}
                {settingsModalVisible && <TWSettingsModal />}
                {customExtensionModalVisible && <TWCustomExtensionModal />}
                            {extensionImportMethodModalVisible && <TWExtensionImportModal vm={vm} />}
                            {fontsModalVisible && <TWFontsModal />}                {unknownPlatformModalVisible && <TWUnknownPlatformModal />}
                {invalidProjectModalVisible && <TWInvalidProjectModal />}
                {gitModalVisible && <TWGitModal onClose={onRequestCloseGitModal} />}
                <CollaborationContainer
                    vm={vm}
                    visible={collaborationModalVisible}
                    onRequestClose={onRequestCloseCollaborationModal}
                />
            </React.Fragment>
        );

        return isPlayerOnly ? (
            <React.Fragment>
                {/* TW: When the window is fullscreen, use an element to display the background color */}
                {/* The default color for transparency is inconsistent between browsers and there isn't an existing */}
                {/* element for us to style that fills the entire screen. */}
                {isWindowFullScreen ? (
                    <div
                        className={styles.fullscreenBackground}
                        style={{
                            backgroundColor: fullscreenBackgroundColor
                        }}
                    />
                ) : null}
                <StageWrapper
                    isFullScreen={isFullScreen}
                    isEmbedded={isEmbedded}
                    isRendererSupported={isRendererSupported()}
                    isRtl={isRtl}
                    loading={loading}
                    stageSize={STAGE_SIZE_MODES.full}
                    vm={vm}
                >
                    {alertsVisible ? (
                        <Alerts className={styles.alertsContainer} />
                    ) : null}
                </StageWrapper>
                {alwaysEnabledModals}
            </React.Fragment>
        ) : (
            <Box
                className={styles.pageWrapper}
                dir={isRtl ? 'rtl' : 'ltr'}
                style={{
                    minWidth: 1024 + Math.max(0, customStageSize.width - 480),
                    minHeight: 640 + Math.max(0, customStageSize.height - 360)
                }}
                {...componentProps}
            >
                {alwaysEnabledModals}
                {telemetryModalVisible ? (
                    <TelemetryModal
                        isRtl={isRtl}
                        isTelemetryEnabled={isTelemetryEnabled}
                        onCancel={onTelemetryModalCancel}
                        onOptIn={onTelemetryModalOptIn}
                        onOptOut={onTelemetryModalOptOut}
                        onRequestClose={onRequestCloseTelemetryModal}
                        onShowPrivacyPolicy={onShowPrivacyPolicy}
                    />
                ) : null}
                {loading ? (
                    <Loader isFullScreen />
                ) : null}
                {isCreating ? (
                    <Loader
                        isFullScreen
                        messageId="gui.loader.creating"
                    />
                ) : null}
                {isBrowserSupported() ? null : (
                    <BrowserModal
                        isRtl={isRtl}
                        onClickDesktopSettings={onClickDesktopSettings}
                    />
                )}
                {tipsLibraryVisible ? (
                    <TipsLibrary />
                ) : null}
                {cardsVisible ? (
                    <Cards />
                ) : null}
                {alertsVisible ? (
                    <Alerts className={editorAlertsClassName} />
                ) : null}
                {connectionModalVisible ? (
                    <ConnectionModal
                        vm={vm}
                    />
                ) : null}
                {costumeLibraryVisible ? (
                    <CostumeLibrary
                        vm={vm}
                        onRequestClose={onRequestCloseCostumeLibrary}
                    />
                ) : null}
                {backdropLibraryVisible ? (
                    <BackdropLibrary
                        vm={vm}
                        onRequestClose={onRequestCloseBackdropLibrary}
                    />
                ) : null}
                <MenuBar
                    accountNavOpen={accountNavOpen}
                    authorId={authorId}
                    authorThumbnailUrl={authorThumbnailUrl}
                    authorUsername={authorUsername}
                    canChangeLanguage={canChangeLanguage}
                    canChangeTheme={canChangeTheme}
                    canCollapseMenuBar={customUI}
                    canCreateCopy={canCreateCopy}
                    canCreateNew={canCreateNew}
                    canEditTitle={canEditTitle}
                    canManageFiles={canManageFiles}
                    canRemix={canRemix}
                    canSave={canSave}
                    canShare={canShare}
                    className={classNames(styles.menuBarPosition, {
                        [styles.fullscreenMenuBar]: isFullScreen,
                        [styles['menu-bar-position-custom-ui']]: customUI
                    })}
                    enableCommunity={enableCommunity}
                    isShared={isShared}
                    isTotallyNormal={isTotallyNormal}
                    logo={logo}
                    renderLogin={renderLogin}
                    showComingSoon={showComingSoon}
                    showOpenFilePicker={showOpenFilePicker}
                    showSaveFilePicker={showSaveFilePicker}
                    onClickAbout={onClickAbout}
                    onClickAccountNav={onClickAccountNav}
                    onClickAddonSettings={onClickAddonSettings}
                    onClickDesktopSettings={onClickDesktopSettings}
                    onClickNewWindow={onClickNewWindow}
                    onClickPackager={onClickPackager}
                    onClickLogo={onClickLogo}
                    onCloseAccountNav={onCloseAccountNav}
                    onLogOut={onLogOut}
                    onMenuBarCollapseChange={handleMenuBarCollapseChange}
                    onOpenRegistration={onOpenRegistration}
                    onProjectTelemetryEvent={onProjectTelemetryEvent}
                    onSeeCommunity={onSeeCommunity}
                    onShare={onShare}
                    onStartSelectingFileUpload={onStartSelectingFileUpload}
                    onToggleLoginOpen={onToggleLoginOpen}
                />


                <Box
                    className={classNames(styles.bodyWrapper, {
                        [styles['body-wrapper-custom-ui']]: customUI,
                        [styles.bodyWrapperMenuCollapsed]: effectiveMenuBarCollapsed
                    })}
                >
                    <Box className={styles.flexWrapper}>
                        {windowBackgroundActive ? (
                            <div
                                className={styles.windowBackgroundLayer}
                                style={getEditorBackgroundStyle(editorBackground)}
                            />
                        ) : null}
                        {!customUI ? renderEditorWrapper(stageSize) : null}

                        {props.customUI ? (
                        <>
                            <Box
                                className={classNames(styles.editorDesktop, {
                                    [styles['editor-desktop-custom-ui']]: customUI
                                })}
                                componentRef={editorDesktopRef}
                            >
                                {!hideFloatingWindows && (
                                    editorWindowSessions.length ? renderEditorWindows(stageSize) : null
                                )}
                            </Box>
                            {!hideFloatingWindows && !stageWindowMinimized && (
                                <DraggableWindow
                                    windowId="stage"
                                    title="Stage"
                                    defaultPosition={stageWindowPosition}
                                    defaultSize={stageWindowSize}
                                    minSize={{width: 74, height: 25}}
                                    maxSize={{width: 960+4, height: 720+75}}
                                    allowResize={true}
                                    allowMaximize={false}
                                    onContentResize={handleStageWindowContentResize}
                                    onDragStop={(id, position) => setStageWindowPosition(position)}
                                    onResizeStop={(id, size) => setStageWindowSize(size)}
                                    onMinimizeToggle={(id, minimized) => setStageWindowMinimized(minimized)}
                                    zIndex={isFullScreen ? 500 : STAGE_WINDOW_Z_INDEX}
                                    enableStatePersistence={true}
                                >
                                    <StageWrapper
                                        containerSize={stageWindowContentSize}
                                        customStageSize={customStageSize}
                                        fitToContainer={stageWindowAutoFit}
                                        isFullScreen={isFullScreen}
                                        isRendererSupported={isRendererSupported()}
                                        isRtl={isRtl}
                                        onRequestSelectTarget={handleEditorTargetSelection}
                                        onToggleAutoFit={handleToggleStageWindowAutoFit}
                                        showAutoFitButton
                                        stageSize={stageSize}
                                        stageWindowAutoFit={stageWindowAutoFit}
                                        vm={vm}
                                    />
                                </DraggableWindow>
                            )}
                            {!hideFloatingWindows && !targetPaneWindowMinimized && (
                                <DraggableWindow
                                    windowId="targets"
                                    title="Sprites"
                                    defaultPosition={targetPaneWindowPosition}
                                    defaultSize={targetPaneWindowSize}
                                    minSize={{width: 471, height: 211}}
                                    maxSize={{width: 600, height: 800}}
                                    onDragStop={(id, position) => setTargetPaneWindowPosition(position)}
                                    onResizeStop={(id, size) => setTargetPaneWindowSize(size)}
                                    onMinimizeToggle={(id, minimized) => setTargetPaneWindowMinimized(minimized)}
                                    zIndex={TARGET_PANE_WINDOW_Z_INDEX}
                                    enableStatePersistence={true}
                                >
                                    <TargetPane
                                        onRequestSelectTarget={handleEditorTargetSelection}
                                        stageSize={stageSize}
                                        vm={vm}
                                    />
                                </DraggableWindow>
                            )}
                {/* 全局唯一最小化栏 */}
                {!hideFloatingWindows ? <MinimizedBar windows={minimizedWindows} /> : null}
                        </>
                        ) : (
                        /* 原版内嵌布局（使用原始样式容器） */
                        <Box className={styles.stageAndTargetWrapper}>
                            <StageWrapper
                                isFullScreen={isFullScreen}
                                isRendererSupported={isRendererSupported()}
                                isRtl={isRtl}
                                loading={loading}
                                stageSize={stageSize}
                                vm={vm}
                            >
                                {alertsVisible ? (
                                    <Alerts className={editorAlertsClassName} />
                                ) : null}
                            </StageWrapper>
                            <Box className={styles.targetWrapper}>
                                <TargetPane
                                    stageSize={stageSize}
                                    vm={vm}
                                />
                            </Box>
                        </Box>
                        )}
                    </Box>
                </Box>
                <DragLayer />

            </Box>
        );
    }}</MediaQuery>);
};

GUIComponent.propTypes = {
    accountNavOpen: PropTypes.bool,
    activeTabIndex: PropTypes.number,
    authorId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    authorThumbnailUrl: PropTypes.string,
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    backdropLibraryVisible: PropTypes.bool,
    backpackHost: PropTypes.string,
    backpackVisible: PropTypes.bool,
    basePath: PropTypes.string,
    blocksTabVisible: PropTypes.bool,
    blocksId: PropTypes.string,
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    canCreateCopy: PropTypes.bool,
    canCreateNew: PropTypes.bool,
    canEditTitle: PropTypes.bool,
    canManageFiles: PropTypes.bool,
    canRemix: PropTypes.bool,
    canSave: PropTypes.bool,
    canShare: PropTypes.bool,
    canUseCloud: PropTypes.bool,
    cardsVisible: PropTypes.bool,
    children: PropTypes.node,
    costumeLibraryVisible: PropTypes.bool,
    costumesTabVisible: PropTypes.bool,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    customUI: PropTypes.bool,
    editorBackground: PropTypes.shape({
        image: PropTypes.string,
        blur: PropTypes.number,
        target: PropTypes.string
    }),
    editingTargetId: PropTypes.string,
    enableCommunity: PropTypes.bool,
    intl: intlShape.isRequired,
    isCreating: PropTypes.bool,
    isEmbedded: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isPlayerOnly: PropTypes.bool,
    isRtl: PropTypes.bool,
    isShared: PropTypes.bool,
    isWindowFullScreen: PropTypes.bool,
    isTotallyNormal: PropTypes.bool,
    loading: PropTypes.bool,
    logo: PropTypes.string,
    onActivateCostumesTab: PropTypes.func,
    onActivateSoundsTab: PropTypes.func,
    onActivateTab: PropTypes.func,
    onClickAccountNav: PropTypes.func,
    onClickAddonSettings: PropTypes.func,
    onClickDesktopSettings: PropTypes.func,
    onClickNewWindow: PropTypes.func,
    onClickPackager: PropTypes.func,
    onClickLogo: PropTypes.func,
    onCloseAccountNav: PropTypes.func,
    onExtensionButtonClick: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onOpenExtensionImportMethodModal: PropTypes.func,
    onSetSelectedExtension: PropTypes.func,
    onLogOut: PropTypes.func,
    onOpenRegistration: PropTypes.func,
    onRequestCloseBackdropLibrary: PropTypes.func,
    onRequestCloseCostumeLibrary: PropTypes.func,
    onRequestCloseTelemetryModal: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onShare: PropTypes.func,
    onShowPrivacyPolicy: PropTypes.func,
    onStartSelectingFileUpload: PropTypes.func,
    onTabSelect: PropTypes.func,
    onTelemetryModalCancel: PropTypes.func,
    onTelemetryModalOptIn: PropTypes.func,
    onTelemetryModalOptOut: PropTypes.func,
    onToggleLoginOpen: PropTypes.func,
    renderLogin: PropTypes.func,
    securityManager: PropTypes.shape({}),
    showComingSoon: PropTypes.bool,
    showOpenFilePicker: PropTypes.func,
    showSaveFilePicker: PropTypes.func,
    soundsTabVisible: PropTypes.bool,
    stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES)),
    stage: PropTypes.shape({
        id: PropTypes.string
    }),
    sprites: PropTypes.objectOf(PropTypes.shape({
        id: PropTypes.string
    })),
    targetIsStage: PropTypes.bool,
    telemetryModalVisible: PropTypes.bool,
    theme: PropTypes.instanceOf(Theme),
    tipsLibraryVisible: PropTypes.bool,
    usernameModalVisible: PropTypes.bool,
    settingsModalVisible: PropTypes.bool,
    customExtensionModalVisible: PropTypes.bool,
    extensionImportMethodModalVisible: PropTypes.bool,
    fontsModalVisible: PropTypes.bool,
    unknownPlatformModalVisible: PropTypes.bool,
    invalidProjectModalVisible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};
GUIComponent.defaultProps = {
    backpackHost: null,
    backpackVisible: false,
    basePath: './',
    blocksId: 'original',
    canChangeLanguage: true,
    canChangeTheme: true,
    canCreateNew: false,
    canEditTitle: false,
    canManageFiles: true,
    canRemix: false,
    canSave: false,
    canCreateCopy: false,
    canShare: false,
    canUseCloud: false,
    enableCommunity: false,
    isCreating: false,
    isShared: false,
    isTotallyNormal: false,
    loading: false,
    showComingSoon: false,
    stageSizeMode: STAGE_SIZE_MODES.large
};

const mapStateToProps = state => ({
    customStageSize: state.scratchGui.customStageSize,
    editorBackground: state.scratchGui.tw.editorBackground,
    isWindowFullScreen: state.scratchGui.tw.isWindowFullScreen,
    customUI: !!state.scratchGui.tw.customUI,
    editingTargetId: state.scratchGui.targets.editingTarget,
    sprites: state.scratchGui.targets.sprites,
    stage: state.scratchGui.targets.stage,
    // This is the button's mode, as opposed to the actual current state
    blocksId: state.scratchGui.timeTravel.year.toString(),
    stageSizeMode: state.scratchGui.stageSize.stageSize,
    theme: state.scratchGui.theme.theme
});

export default injectIntl(connect(
    mapStateToProps
)(GUIComponent));
