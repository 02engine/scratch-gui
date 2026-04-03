import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape, FormattedMessage} from 'react-intl';

import extensionLibraryContent, {
    galleryError,
    galleryLoading,
    galleryMore
} from '../lib/libraries/extensions/index.jsx';
import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';
import libraryStyles from '../components/library/library.css';
import {APP_NAME} from '../lib/brand.js';
import log from '../lib/log';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
    },
    batchImport: {
        defaultMessage: 'Batch import {count} extensions',
        description: 'Button label for importing multiple selected extensions',
        id: 'tw.extensionLibrary.batchImport'
    },
    clearSelection: {
        defaultMessage: 'Clear selection',
        description: 'Button label for clearing selected extensions from the batch queue',
        id: 'tw.extensionLibrary.clearSelection'
    },
    sourcesTitle: {
        defaultMessage: 'Sources',
        description: 'Sidebar title in the extension library',
        id: 'tw.extensionLibrary.sourcesTitle'
    },
    allSources: {
        defaultMessage: 'All',
        description: 'Label for the all-sources filter in the extension library',
        id: 'tw.extensionLibrary.source.all'
    },
    sourceScratch: {
        defaultMessage: 'Official Scratch',
        description: 'Label for the Scratch source filter in the extension library',
        id: 'tw.extensionLibrary.source.scratch'
    },
    source02Engine: {
        defaultMessage: '02Engine',
        description: 'Label for the 02Engine source filter in the extension library',
        id: 'tw.extensionLibrary.source.02engine'
    },
    sourceTurboWarp: {
        defaultMessage: 'TurboWarp',
        description: 'Label for the TurboWarp source filter in the extension library',
        id: 'tw.extensionLibrary.source.tw'
    },
    sourcePenguinMod: {
        defaultMessage: 'PenguinMod',
        description: 'Label for the PenguinMod source filter in the extension library',
        id: 'tw.extensionLibrary.source.pm'
    },
    sourceMist: {
        defaultMessage: 'Mist',
        description: 'Label for the Mist source filter in the extension library',
        id: 'tw.extensionLibrary.source.mist'
    },
    sourceSharkPool: {
        defaultMessage: 'SharkPool',
        description: 'Label for the SharkPool source filter in the extension library',
        id: 'tw.extensionLibrary.source.sharkpool'
    },
    sourceOther: {
        defaultMessage: 'Other',
        description: 'Label for the Other source filter in the extension library',
        id: 'tw.extensionLibrary.source.other'
    },
    sourceCustom: {
        defaultMessage: 'Custom',
        description: 'Label for custom extension items in the extension library',
        id: 'tw.extensionLibrary.source.custom'
    },
    sourceBuiltIn: {
        defaultMessage: 'Built-in',
        description: 'Label for special built-in feature items in the extension library',
        id: 'tw.extensionLibrary.source.builtin'
    },
    quickFavorites: {
        defaultMessage: 'Favorites',
        description: 'Quick filter label for favorite extensions',
        id: 'tw.extensionLibrary.quickFilter.favorites'
    },
    quickSelected: {
        defaultMessage: 'Selected',
        description: 'Quick filter label for selected extensions',
        id: 'tw.extensionLibrary.quickFilter.selected'
    },
    quickCompatible: {
        defaultMessage: 'Scratch-compatible',
        description: 'Quick filter label for Scratch-compatible extensions',
        id: 'tw.extensionLibrary.quickFilter.compatible'
    },
    quickNative: {
        defaultMessage: 'Native only',
        description: 'Quick filter label for native extensions',
        id: 'tw.extensionLibrary.quickFilter.native'
    },
    quickCustom: {
        defaultMessage: 'Custom only',
        description: 'Quick filter label for custom extensions',
        id: 'tw.extensionLibrary.quickFilter.custom'
    },
    commonSection: {
        defaultMessage: 'Favorites',
        description: 'Section title for favorite extensions',
        id: 'tw.extensionLibrary.section.common'
    },
    sourceSection: {
        defaultMessage: '{source} Extensions',
        description: 'Section title for a source group in the extension library',
        id: 'tw.extensionLibrary.section.source'
    },
    moreSection: {
        defaultMessage: 'More from {source}',
        description: 'Section title for remaining source extensions after the common section',
        id: 'tw.extensionLibrary.section.more'
    },
    emptyTitle: {
        defaultMessage: 'No extensions match those filters',
        description: 'Empty state title in the extension library',
        id: 'tw.extensionLibrary.emptyTitle'
    },
    emptyDescription: {
        defaultMessage: 'Try another source, clear a filter, or search for a different keyword.',
        description: 'Empty state description in the extension library',
        id: 'tw.extensionLibrary.emptyDescription'
    },
    clearFilters: {
        defaultMessage: 'Clear filters',
        description: 'Button label to clear extension library filters',
        id: 'tw.extensionLibrary.clearFilters'
    },
    badgeIncompatible: {
        defaultMessage: 'Not Scratch-compatible',
        description: 'Status badge for incompatible extensions',
        id: 'tw.extensionLibrary.badge.incompatible'
    },
    badgeNative: {
        defaultMessage: 'Native',
        description: 'Status badge for native extensions',
        id: 'tw.extensionLibrary.badge.native'
    },
    badgeBatch: {
        defaultMessage: 'Batch',
        description: 'Status badge for extensions that support batch selection',
        id: 'tw.extensionLibrary.badge.batch'
    },
    openCustomLoader: {
        defaultMessage: 'Open custom loader',
        description: 'Action hint for the custom extension item',
        id: 'tw.extensionLibrary.action.custom'
    },
    openWebsite: {
        defaultMessage: 'Open website',
        description: 'Action hint for extension library website links',
        id: 'tw.extensionLibrary.action.website'
    },
    enableFeature: {
        defaultMessage: 'Enable feature',
        description: 'Action hint for special extension actions',
        id: 'tw.extensionLibrary.action.enableFeature'
    },
    importExtension: {
        defaultMessage: 'Click to import',
        description: 'Action hint for importing an extension',
        id: 'tw.extensionLibrary.action.import'
    }
});

const SOURCE_KEYS = {
    ALL: 'all',
    SCRATCH: 'scratch',
    ENGINE: '02engine',
    TW: 'tw',
    PM: 'pm',
    MIST: 'mist',
    SHARKPOOL: 'sharkpool',
    OTHER: 'other',
    CUSTOM: 'custom',
    SPECIAL: 'special'
};

const SOURCE_NAV_ORDER = [
    SOURCE_KEYS.ALL,
    SOURCE_KEYS.SCRATCH,
    SOURCE_KEYS.ENGINE,
    SOURCE_KEYS.TW,
    SOURCE_KEYS.PM,
    SOURCE_KEYS.MIST,
    SOURCE_KEYS.SHARKPOOL,
    SOURCE_KEYS.OTHER
];

const FAVORITES_STORAGE_KEY = 'tw:library-favorites:extensionLibrary';

const getItemSelectionKey = item => item.extensionURL || item.extensionId;
const isBatchSelectableItem = item => {
    if (!item || item === '---' || item.disabled || item.href || !item.extensionId) {
        return false;
    }
    return item.extensionId !== 'custom_extension';
};
const supportsTextImport = item => Boolean(item && item.extensionURL);

const toBatchItem = item => {
    if (item.extensionId === 'procedures_enable_return') {
        return {
            kind: 'procedure-returns',
            extensionId: item.extensionId,
            displayName: typeof item.name === 'string' ? item.name : item.extensionId
        };
    }
    if (!supportsTextImport(item)) {
        return {
            kind: 'native-extension',
            extensionId: item.extensionId,
            extensionURL: item.extensionId,
            displayName: typeof item.name === 'string' ? item.name : item.extensionId
        };
    }
    return {
        kind: 'extension-url',
        extensionId: item.extensionId,
        extensionURL: item.extensionURL || item.extensionId,
        displayName: typeof item.name === 'string' ? item.name : item.extensionId
    };
};

const toLibraryItem = extension => {
    if (typeof extension === 'object') {
        return ({
            rawURL: extension.iconURL || extensionIcon,
            ...extension
        });
    }
    return extension;
};

const normalizeMatchValue = value => {
    if (!value) return '';
    return String(value)
        .toLowerCase()
        .replace(/\.js$/i, '')
        .replace(/[^a-z0-9]+/g, '');
};

const getURLStem = value => {
    if (!value || typeof value !== 'string' || value.startsWith('data:')) {
        return '';
    }
    try {
        const parsed = new URL(value);
        const segments = parsed.pathname.split('/').filter(Boolean);
        return segments.length ? segments[segments.length - 1].replace(/\.js$/i, '') : '';
    } catch (error) {
        return '';
    }
};

const getNameText = (intl, value) => {
    if (typeof value === 'string') {
        return value;
    }
    if (React.isValidElement(value) && value.props) {
        return intl.formatMessage(value.props, {APP_NAME});
    }
    return '';
};

const fetchPenguinModLibrary = async () => {
    try {
        const module = await import(
            /* webpackIgnore: true */
            '/penguinmod/extensions.js'
        );
        return module.default.map(extension => ({
            name: extension.name,
            nameTranslations: {},
            description: extension.description,
            descriptionTranslations: {},
            extensionId: extension.name,
            extensionURL: `https://extensions.penguinmod.com/extensions/${extension.code}`,
            iconURL: `https://extensions.penguinmod.com/images/${extension.banner || 'images/unknown.svg'}`,
            tags: ['pm'],
            credits: [extension.creator],
            docsURI: null,
            samples: null,
            incompatibleWithScratch: false,
            featured: true
        }));
    } catch (err) {
        log.error(err);
        return [];
    }
};

let cachedGallery = null;

const fetchLibrary = async () => {
    const safeFetch = async (url, processor, defaultData = []) => {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            const data = await res.json();
            return processor(data);
        } catch (error) {
            log.error(error);
            return defaultData;
        }
    };

    const [engineData, twData, mistData, sharkPoolData, penguinModData] = await Promise.all([
        safeFetch(
            'https://extensions.02engine.02studio.xyz/extensions.json',
            data => data.extensions.map(extension => ({
                name: extension.name,
                nameTranslations: extension.nameTranslations || {},
                description: extension.description,
                descriptionTranslations: extension.descriptionTranslations || {},
                extensionId: extension.id,
                extensionURL: `https://extensions.02engine.02studio.xyz/extension/${extension.slug}.js`,
                iconURL: `https://extensions.02engine.02studio.xyz/image/${extension.image || 'images/unknown.svg'}`,
                tags: ['ztengine'],
                credits: [
                    ...(extension.original || []),
                    ...(extension.by || [])
                ].map(credit => {
                    if (credit.link) {
                        return (
                            <a href={credit.link} target="_blank" rel="noreferrer" key={credit.name}>
                                {credit.name}
                            </a>
                        );
                    }
                    return credit.name;
                }),
                docsURI: null,
                samples: extension.samples ? extension.samples.map(sample => ({
                    href: `${process.env.ROOT}editor?project_url=https://extensions.02engine.02studio.xyz/samples/${encodeURIComponent(sample)}.sb3`,
                    text: sample
                })) : null,
                incompatibleWithScratch: !extension.scratchCompatible,
                featured: true
            })),
            []
        ),
        safeFetch(
            'https://extensions.turbowarp.org/generated-metadata/extensions-v0.json',
            data => data.extensions.map(extension => ({
                name: extension.name,
                nameTranslations: extension.nameTranslations || {},
                description: extension.description,
                descriptionTranslations: extension.descriptionTranslations || {},
                extensionId: extension.id,
                extensionURL: `https://extensions.turbowarp.org/${extension.slug}.js`,
                iconURL: `https://extensions.turbowarp.org/${extension.image || 'images/unknown.svg'}`,
                tags: ['tw'],
                credits: [
                    ...(extension.original || []),
                    ...(extension.by || [])
                ].map(credit => {
                    if (credit.link) {
                        return (
                            <a href={credit.link} target="_blank" rel="noreferrer" key={credit.name}>
                                {credit.name}
                            </a>
                        );
                    }
                    return credit.name;
                }),
                docsURI: extension.docs ? `https://extensions.turbowarp.org/${extension.slug}` : null,
                samples: extension.samples ? extension.samples.map(sample => ({
                    href: `${process.env.ROOT}editor?project_url=https://extensions.turbowarp.org/samples/${encodeURIComponent(sample)}.sb3`,
                    text: sample
                })) : null,
                incompatibleWithScratch: !extension.scratchCompatible,
                featured: true
            })),
            []
        ),
        safeFetch(
            'https://mistiumextensions.02studio.xyz/generated-metadata/extensions-v0.json',
            data => data.extensions.map(extension => ({
                name: extension.name,
                nameTranslations: extension.nameTranslations || {},
                description: extension.description,
                descriptionTranslations: extension.descriptionTranslations || {},
                extensionId: extension.id,
                extensionURL: `https://mistiumextensions.02studio.xyz/featured/${extension.name}.js`,
                iconURL: `https://mistiumextensions.02studio.xyz/${extension.image || 'images/unknown.svg'}`,
                tags: ['mist'],
                credits: [
                    ...(extension.original || []),
                    ...(extension.by || [])
                ].map(credit => {
                    if (credit.link) {
                        return (
                            <a href={credit.link} target="_blank" rel="noreferrer" key={credit.name}>
                                {credit.name}
                            </a>
                        );
                    }
                    return credit.name;
                }),
                docsURI: null,
                samples: extension.samples ? extension.samples.map(sample => ({
                    href: `${process.env.ROOT}editor?project_url=https://extensions.turbowarp.org/samples/${encodeURIComponent(sample)}.sb3`,
                    text: sample
                })) : null,
                incompatibleWithScratch: !extension.scratchCompatible,
                featured: true
            })),
            []
        ),
        safeFetch(
            'https://sharkpoolextensions.02studio.xyz/Gallery%20Files/Extension-Keys.json',
            data => Object.entries(data.extensions).map(([slug, extension]) => ({
                name: slug,
                nameTranslations: {},
                description: extension.desc,
                descriptionTranslations: {},
                extensionId: slug,
                extensionURL: `https://sharkpoolextensions.02studio.xyz/extension-code/${extension.url}`,
                iconURL: `https://sharkpoolextensions.02studio.xyz/extension-thumbs/${extension.banner || 'images/unknown.svg'}`,
                tags: [...extension.tags, 'sp'],
                credits: extension.creator.split(', ').map(creator => {
                    const match = creator.match(/(.+?)(?:\s*\((.+)\))?$/);
                    const name = match[1];
                    const role = match[2] || '';
                    return role ? `${name} (${role})` : name;
                }),
                docsURI: null,
                samples: null,
                incompatibleWithScratch: false,
                featured: true
            })),
            []
        ),
        fetchPenguinModLibrary()
    ]);

    return [
        ...engineData,
        ...twData,
        ...penguinModData,
        ...mistData,
        ...sharkPoolData
    ];
};

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'executeItemAction',
            'getActionLabel',
            'getBatchSelectableItems',
            'getCardProps',
            'getLibraryItems',
            'getNormalizedItems',
            'getQuickFilterButtons',
            'getSidebar',
            'getSourceCounts',
            'getSourceLabel',
            'getSections',
            'handleBatchImport',
            'handleClearFilters',
            'handleClearQuery',
            'handleClearSelection',
            'handleEnableProcedureReturns',
            'handleFavoritesChange',
            'handleItemSelect',
            'handleQueryChange',
            'handleSelectionToggle',
            'handleSourceSelect',
            'handleToggleQuickFilter',
            'isItemSelectable',
            'isItemSelected',
            'matchesQuickFilters',
            'matchesSearch',
            'matchesSource',
            'readFavoritesFromStorage',
            'renderEmptyState',
            'sortItems'
        ]);
        this.state = {
            favorites: this.readFavoritesFromStorage(),
            gallery: cachedGallery,
            galleryError: null,
            galleryTimedOut: false,
            query: '',
            quickFilters: {
                favorites: false,
                selected: false,
                compatible: false,
                native: false,
                custom: false
            },
            selectedItemKeys: [],
            selectedSource: SOURCE_KEYS.ALL
        };
    }
    componentDidMount () {
        if (!this.state.gallery) {
            const timeout = setTimeout(() => {
                this.setState({
                    galleryTimedOut: true
                });
            }, 750);

            fetchLibrary()
                .then(gallery => {
                    cachedGallery = gallery;
                    this.setState({
                        gallery
                    });
                    clearTimeout(timeout);
                })
                .catch(error => {
                    log.error(error);
                    this.setState({
                        galleryError: error
                    });
                    clearTimeout(timeout);
                });
        }
    }
    readFavoritesFromStorage () {
        let data;
        try {
            data = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY));
        } catch (error) {
            data = [];
        }
        return Array.isArray(data) ? data : [];
    }
    getSourceLabel (sourceKey) {
        const sourceMessages = {
            [SOURCE_KEYS.ALL]: messages.allSources,
            [SOURCE_KEYS.SCRATCH]: messages.sourceScratch,
            [SOURCE_KEYS.ENGINE]: messages.source02Engine,
            [SOURCE_KEYS.TW]: messages.sourceTurboWarp,
            [SOURCE_KEYS.PM]: messages.sourcePenguinMod,
            [SOURCE_KEYS.MIST]: messages.sourceMist,
            [SOURCE_KEYS.SHARKPOOL]: messages.sourceSharkPool,
            [SOURCE_KEYS.OTHER]: messages.sourceOther,
            [SOURCE_KEYS.CUSTOM]: messages.sourceCustom,
            [SOURCE_KEYS.SPECIAL]: messages.sourceBuiltIn
        };
        return this.props.intl.formatMessage(sourceMessages[sourceKey] || messages.sourceOther);
    }
    getLibraryItems () {
        const baseLibrary = extensionLibraryContent.map(toLibraryItem);
        if (this.state.gallery) {
            return [
                ...baseLibrary,
                toLibraryItem(galleryMore),
                ...this.state.gallery.map(toLibraryItem)
            ];
        }
        if (this.state.galleryError) {
            return [
                ...baseLibrary,
                toLibraryItem(galleryError)
            ];
        }
        return [
            ...baseLibrary,
            toLibraryItem(galleryLoading)
        ];
    }
    getNormalizedItems () {
        const library = this.getLibraryItems();
        if (!library) {
            return [];
        }
        const loadedExtensionURLs = this.props.vm.extensionManager.getExtensionURLs ?
            this.props.vm.extensionManager.getExtensionURLs() :
            {};
        const loadedURLValues = new Set(Object.values(loadedExtensionURLs));
        const loadedIds = new Set([
            ...Object.keys(loadedExtensionURLs),
            ...Array.from(this.props.vm.extensionManager._loadedExtensions?.keys?.() || [])
        ]);
        const loadedEntries = Array.from(loadedIds).map(loadedId => ({
            id: loadedId,
            normalizedId: normalizeMatchValue(loadedId),
            normalizedURLStem: normalizeMatchValue(getURLStem(loadedExtensionURLs[loadedId]))
        }));
        return library
            .filter(item => item && item !== '---')
            .map((item, originalIndex) => {
                const extensionId = item.extensionId || '';
                let source = SOURCE_KEYS.OTHER;
                if (extensionId === 'custom_extension') {
                    source = SOURCE_KEYS.CUSTOM;
                } else if (extensionId === 'procedures_enable_return') {
                    source = SOURCE_KEYS.SPECIAL;
                } else if (item.tags && item.tags.includes('scratch')) {
                    source = SOURCE_KEYS.SCRATCH;
                } else if (item.tags && item.tags.includes('ztengine')) {
                    source = SOURCE_KEYS.ENGINE;
                } else if (item.tags && item.tags.includes('pm')) {
                    source = SOURCE_KEYS.PM;
                } else if (item.tags && item.tags.includes('mist')) {
                    source = SOURCE_KEYS.MIST;
                } else if (item.tags && item.tags.includes('sp')) {
                    source = SOURCE_KEYS.SHARKPOOL;
                } else if (item.tags && item.tags.includes('tw')) {
                    source = SOURCE_KEYS.TW;
                }

                const isCustomLoad = extensionId === 'custom_extension';
                const isSpecialAction = extensionId === 'procedures_enable_return';
                const isNative = Boolean(extensionId && !item.extensionURL && !item.href && !isCustomLoad && !isSpecialAction);
                const candidateValues = new Set([
                    normalizeMatchValue(extensionId),
                    normalizeMatchValue(getNameText(this.props.intl, item.name)),
                    normalizeMatchValue(getURLStem(item.extensionURL))
                ].filter(Boolean));
                const fuzzyInstalled = loadedEntries.some(loadedEntry => (
                    candidateValues.has(loadedEntry.normalizedId) ||
                    candidateValues.has(loadedEntry.normalizedURLStem)
                ));
                const isInstalled = Boolean(
                    extensionId &&
                    !item.href &&
                    !item.disabled &&
                    !isSpecialAction &&
                    (
                        this.props.vm.extensionManager.isExtensionLoaded(extensionId) ||
                        loadedIds.has(extensionId) ||
                        (item.extensionURL && loadedURLValues.has(item.extensionURL)) ||
                        fuzzyInstalled
                    )
                );
                const sourceLabel = this.getSourceLabel(source);
                const textParts = [];
                textParts.push(getNameText(this.props.intl, item.name));
                if (typeof item.description === 'string') {
                    textParts.push(item.description);
                } else if (React.isValidElement(item.description) && item.description.props) {
                    textParts.push(this.props.intl.formatMessage(item.description.props, {APP_NAME}));
                }
                if (Array.isArray(item.tags)) {
                    textParts.push(...item.tags);
                }
                if (Array.isArray(item.credits)) {
                    textParts.push(...item.credits.map(credit => {
                        if (typeof credit === 'string') {
                            return credit;
                        }
                        if (React.isValidElement(credit) && typeof credit.props?.children === 'string') {
                            return credit.props.children;
                        }
                        return '';
                    }));
                }
                textParts.push(sourceLabel);

                return {
                    ...item,
                    favoriteKey: item.extensionURL || item.extensionId,
                    isBatchSelectable: isBatchSelectableItem(item),
                    isCompatible: !item.incompatibleWithScratch,
                    isCustomLoad,
                    isInstalled,
                    isNative,
                    originalIndex,
                    isSpecialAction,
                    searchText: textParts.join('\n').toLowerCase(),
                    source,
                    sourceLabel
                };
            });
    }
    getBatchSelectableItems () {
        return this.getNormalizedItems().filter(item => item.isBatchSelectable);
    }
    handleEnableProcedureReturns () {
        if (this.props.onEnableProcedureReturns) {
            this.props.onEnableProcedureReturns();
            if (this.props.onCategorySelected) {
                this.props.onCategorySelected('myBlocks');
            }
            return;
        }
        if (window.__twEnableProcedureReturns) {
            window.__twEnableProcedureReturns();
            return;
        }
        const Blockly = window.ScratchBlocks || window.Blockly;
        const workspace = Blockly && Blockly.getMainWorkspace ? Blockly.getMainWorkspace() : null;
        if (workspace && workspace.enableProcedureReturns) {
            workspace.enableProcedureReturns();
            if (workspace.refreshToolboxSelection_) {
                workspace.refreshToolboxSelection_();
            }
        }
        if (this.props.onCategorySelected) {
            this.props.onCategorySelected('myBlocks');
        }
    }
    executeItemAction (item, {useImportModal}) {
        if (item.href) {
            return;
        }

        const extensionId = item.extensionId;
        const extensionURL = item.extensionURL || extensionId;

        if (extensionId === 'custom_extension') {
            this.props.onOpenCustomExtensionModal();
            return;
        }

        if (extensionId === 'procedures_enable_return') {
            this.handleEnableProcedureReturns();
            return;
        }

        if (item.disabled) {
            return;
        }

        if (
            useImportModal &&
            supportsTextImport(item) &&
            this.props.onSetSelectedExtension &&
            this.props.onOpenExtensionImportMethodModal
        ) {
            if (this.props.onSetSelectedExtensions) {
                this.props.onSetSelectedExtensions([]);
            }
            this.props.onSetSelectedExtension({
                extensionId,
                extensionURL
            });
            this.props.onOpenExtensionImportMethodModal();
        } else if (this.props.vm.extensionManager.isExtensionLoaded(extensionId)) {
            this.props.onCategorySelected(extensionId);
        } else {
            this.props.vm.extensionManager.loadExtensionURL(extensionURL)
                .then(() => {
                    this.props.onCategorySelected(extensionId);
                })
                .catch(err => {
                    log.error(err);
                    // eslint-disable-next-line no-alert
                    alert(err);
                });
        }
    }
    handleItemSelect (item) {
        this.executeItemAction(item, {useImportModal: true});
    }
    handleSelectionToggle (item) {
        const selectionKey = getItemSelectionKey(item);
        this.setState(prevState => ({
            selectedItemKeys: prevState.selectedItemKeys.includes(selectionKey) ?
                prevState.selectedItemKeys.filter(key => key !== selectionKey) :
                [...prevState.selectedItemKeys, selectionKey]
        }));
    }
    handleBatchImport () {
        const selectedExtensions = this.getBatchSelectableItems()
            .filter(item => this.state.selectedItemKeys.includes(getItemSelectionKey(item)))
            .map(toBatchItem);
        if (!selectedExtensions.length) {
            return;
        }
        if (this.props.onSetSelectedExtension) {
            this.props.onSetSelectedExtension(null);
        }
        this.props.onSetSelectedExtensions(selectedExtensions);
        this.props.onOpenExtensionImportMethodModal();
    }
    handleClearSelection () {
        this.setState({
            selectedItemKeys: []
        });
    }
    handleFavoritesChange (favorites) {
        this.setState({
            favorites
        });
    }
    handleSourceSelect (selectedSource) {
        this.setState({
            selectedSource
        });
    }
    handleQueryChange (query) {
        this.setState({
            query
        });
    }
    handleToggleQuickFilter (filterKey) {
        this.setState(prevState => ({
            quickFilters: {
                ...prevState.quickFilters,
                [filterKey]: !prevState.quickFilters[filterKey]
            }
        }));
    }
    handleClearQuery () {
        this.setState({
            query: ''
        });
    }
    handleClearFilters () {
        this.setState({
            query: '',
            quickFilters: {
                favorites: false,
                selected: false,
                compatible: false,
                native: false,
                custom: false
            },
            selectedSource: SOURCE_KEYS.ALL
        });
    }
    isItemSelectable (item) {
        return item.isBatchSelectable;
    }
    isItemSelected (item) {
        return this.state.selectedItemKeys.includes(getItemSelectionKey(item));
    }
    matchesSource (item, sourceKey) {
        if (sourceKey === SOURCE_KEYS.ALL) {
            return true;
        }
        if (sourceKey === SOURCE_KEYS.OTHER) {
            return ![
                SOURCE_KEYS.SCRATCH,
                SOURCE_KEYS.ENGINE,
                SOURCE_KEYS.TW,
                SOURCE_KEYS.PM,
                SOURCE_KEYS.MIST,
                SOURCE_KEYS.SHARKPOOL
            ].includes(item.source);
        }
        return item.source === sourceKey;
    }
    matchesQuickFilters (item) {
        const filters = this.state.quickFilters;
        const selectionKey = getItemSelectionKey(item);
        if (filters.favorites && !this.state.favorites.includes(selectionKey)) {
            return false;
        }
        if (filters.selected && !this.state.selectedItemKeys.includes(selectionKey)) {
            return false;
        }
        if (filters.compatible && !item.isCompatible) {
            return false;
        }
        if (filters.native && !item.isNative) {
            return false;
        }
        if (filters.custom && !item.isCustomLoad) {
            return false;
        }
        return true;
    }
    matchesSearch (item) {
        if (!this.state.query) {
            return true;
        }
        return item.searchText.includes(this.state.query.toLowerCase());
    }
    sortItems (a, b) {
        return a.originalIndex - b.originalIndex;
    }
    getSourceCounts (items) {
        const counts = {
            [SOURCE_KEYS.ALL]: items.length,
            [SOURCE_KEYS.SCRATCH]: 0,
            [SOURCE_KEYS.ENGINE]: 0,
            [SOURCE_KEYS.TW]: 0,
            [SOURCE_KEYS.PM]: 0,
            [SOURCE_KEYS.MIST]: 0,
            [SOURCE_KEYS.SHARKPOOL]: 0,
            [SOURCE_KEYS.OTHER]: 0
        };
        for (const item of items) {
            if (this.matchesSource(item, SOURCE_KEYS.OTHER)) {
                counts[SOURCE_KEYS.OTHER] += 1;
            } else if (counts[item.source] !== undefined) {
                counts[item.source] += 1;
            }
        }
        return counts;
    }
    getSections () {
        const normalized = this.getNormalizedItems()
            .filter(item => this.matchesQuickFilters(item) && this.matchesSearch(item));
        const visibleItems = normalized
            .filter(item => this.matchesSource(item, this.state.selectedSource))
            .sort(this.sortItems);
        const commonItems = visibleItems.filter(item => {
            const selectionKey = getItemSelectionKey(item);
            return this.state.favorites.includes(selectionKey);
        });
        const commonKeys = new Set(commonItems.map(getItemSelectionKey));
        const remainingItems = visibleItems.filter(item => !commonKeys.has(getItemSelectionKey(item)));
        const sections = [];

        if (commonItems.length) {
            sections.push({
                key: 'common',
                title: this.props.intl.formatMessage(messages.commonSection),
                items: commonItems
            });
        }

        if (this.state.selectedSource === SOURCE_KEYS.ALL) {
            for (const sourceKey of SOURCE_NAV_ORDER.slice(1)) {
                const sourceItems = remainingItems.filter(item => this.matchesSource(item, sourceKey));
                if (!sourceItems.length) {
                    continue;
                }
                sections.push({
                    key: `source-${sourceKey}`,
                    title: this.props.intl.formatMessage(messages.sourceSection, {
                        source: this.getSourceLabel(sourceKey)
                    }),
                    items: sourceItems
                });
            }
        } else if (remainingItems.length) {
            sections.push({
                key: `source-${this.state.selectedSource}`,
                title: this.props.intl.formatMessage(messages.moreSection, {
                    source: this.getSourceLabel(this.state.selectedSource)
                }),
                items: remainingItems
            });
        }

        return {
            counts: this.getSourceCounts(normalized),
            sections
        };
    }
    getActionLabel (item) {
        if (item.isCustomLoad) {
            return <FormattedMessage {...messages.openCustomLoader} />;
        }
        if (item.href) {
            return <FormattedMessage {...messages.openWebsite} />;
        }
        if (item.isSpecialAction) {
            return <FormattedMessage {...messages.enableFeature} />;
        }
        return <FormattedMessage {...messages.importExtension} />;
    }
    getCardProps (item) {
        const badges = [];
        if (!item.isCompatible) {
            badges.push({
                key: 'incompatible',
                label: <FormattedMessage {...messages.badgeIncompatible} />
            });
        }
        if (item.isNative) {
            badges.push({
                key: 'native',
                label: <FormattedMessage {...messages.badgeNative} />
            });
        }
        if (item.isBatchSelectable) {
            badges.push({
                key: 'batch',
                label: <FormattedMessage {...messages.badgeBatch} />
            });
        }

        const sourceToneMap = {
            [SOURCE_KEYS.SCRATCH]: 'Scratch',
            [SOURCE_KEYS.ENGINE]: '02engine',
            [SOURCE_KEYS.TW]: 'Tw',
            [SOURCE_KEYS.PM]: 'Pm',
            [SOURCE_KEYS.MIST]: 'Mist',
            [SOURCE_KEYS.SHARKPOOL]: 'Sharkpool',
            [SOURCE_KEYS.CUSTOM]: 'Custom',
            [SOURCE_KEYS.SPECIAL]: 'Special',
            [SOURCE_KEYS.OTHER]: 'Other'
        };

        return {
            actionLabel: this.getActionLabel(item),
            badges,
            sourceLabel: item.sourceLabel,
            sourceTone: sourceToneMap[item.source] || 'Other'
        };
    }
    getSidebar (counts) {
        return (
            <React.Fragment>
                <div className={libraryStyles.sidebarTitle}>
                    <FormattedMessage {...messages.sourcesTitle} />
                </div>
                <div className={libraryStyles.sidebarNav}>
                    {SOURCE_NAV_ORDER.map(sourceKey => (
                        <button
                            key={sourceKey}
                            type="button"
                            className={[
                                libraryStyles.sidebarButton,
                                this.state.selectedSource === sourceKey ? libraryStyles.sidebarButtonActive : ''
                            ].join(' ')}
                            onClick={() => this.handleSourceSelect(sourceKey)}
                        >
                            <div className={libraryStyles.sidebarButtonLabel}>
                                {this.getSourceLabel(sourceKey)}
                            </div>
                            <span className={libraryStyles.sidebarButtonCount}>
                                {counts[sourceKey] || 0}
                            </span>
                        </button>
                    ))}
                </div>
            </React.Fragment>
        );
    }
    getQuickFilterButtons () {
        const quickFilterConfig = [
            ['favorites', messages.quickFavorites],
            ['selected', messages.quickSelected],
            ['compatible', messages.quickCompatible],
            ['native', messages.quickNative],
            ['custom', messages.quickCustom]
        ];
        return quickFilterConfig.map(([key, message]) => (
            <button
                key={key}
                type="button"
                className={[
                    libraryStyles.quickFilterButton,
                    this.state.quickFilters[key] ? libraryStyles.quickFilterButtonActive : ''
                ].join(' ')}
                onClick={() => this.handleToggleQuickFilter(key)}
            >
                {this.props.intl.formatMessage(message)}
            </button>
        ));
    }
    renderEmptyState () {
        return (
            <div className={libraryStyles.emptyState}>
                <div className={libraryStyles.emptyStateTitle}>
                    <FormattedMessage {...messages.emptyTitle} />
                </div>
                <div className={libraryStyles.emptyStateDescription}>
                    <FormattedMessage {...messages.emptyDescription} />
                </div>
                <button
                    type="button"
                    className={libraryStyles.headerSecondaryButton}
                    onClick={this.handleClearFilters}
                >
                    <FormattedMessage {...messages.clearFilters} />
                </button>
            </div>
        );
    }
    render () {
        const library = this.getLibraryItems();
        const {counts, sections} = this.getSections();

        return (
            <LibraryComponent
                contentKey={[
                    this.state.query,
                    this.state.selectedSource,
                    ...Object.keys(this.state.quickFilters)
                        .filter(key => this.state.quickFilters[key])
                ].join(':')}
                data={library}
                emptyState={this.renderEmptyState()}
                favorites={this.state.favorites}
                filterQuery={this.state.query}
                filterable
                getItemProps={this.getCardProps}
                headerAction={this.state.selectedItemKeys.length > 0 ? (
                    <React.Fragment>
                        <button
                            type="button"
                            className={libraryStyles.headerSecondaryButton}
                            onClick={this.handleClearSelection}
                        >
                            <FormattedMessage {...messages.clearSelection} />
                        </button>
                        <button
                            type="button"
                            className={libraryStyles.headerActionButton}
                            onClick={this.handleBatchImport}
                        >
                            <FormattedMessage
                                {...messages.batchImport}
                                values={{count: this.state.selectedItemKeys.length}}
                            />
                        </button>
                    </React.Fragment>
                ) : null}
                id="extensionLibrary"
                isItemSelectable={this.isItemSelectable}
                isItemSelected={this.isItemSelected}
                persistableKey="favoriteKey"
                quickFilters={this.getQuickFilterButtons()}
                sections={library ? sections : []}
                sidebar={this.getSidebar(counts)}
                title={this.props.intl.formatMessage(messages.extensionTitle)}
                visible={this.props.visible}
                onFavoritesChange={this.handleFavoritesChange}
                onFilterQueryChange={this.handleQueryChange}
                onFilterQueryClear={this.handleClearQuery}
                onItemSelectionToggle={this.handleSelectionToggle}
                onItemSelected={this.handleItemSelect}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

ExtensionLibrary.propTypes = {
    intl: intlShape.isRequired,
    onCategorySelected: PropTypes.func,
    onEnableProcedureReturns: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onOpenExtensionImportMethodModal: PropTypes.func,
    onRequestClose: PropTypes.func,
    onSetSelectedExtension: PropTypes.func,
    onSetSelectedExtensions: PropTypes.func,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default injectIntl(ExtensionLibrary);
