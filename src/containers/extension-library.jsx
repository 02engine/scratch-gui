import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape, FormattedMessage} from 'react-intl';
import log from '../lib/log';

import extensionLibraryContent, {
    galleryError,
    galleryLoading,
    galleryMore
} from '../lib/libraries/extensions/index.jsx';
import extensionTags from '../lib/libraries/tw-extension-tags';

import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';
import libraryStyles from '../components/library/library.css';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
    },
    batchImport: {
        defaultMessage: '批量导入 {count} 个扩展',
        description: 'Button label for importing multiple selected extensions',
        id: 'tw.extensionLibrary.batchImport'
    }
});

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

const translateGalleryItem = (extension, locale) => {
    if (extension === '---') {
        return extension;
    }
    // 澶勭悊鎵╁睍瀵硅薄
    return {
        ...extension,
        name: extension.nameTranslations?.[locale] || extension.name,
        description: extension.descriptionTranslations?.[locale] || extension.description
    };
};

let cachedGallery = null;

const fetchPenguinModLibrary = async () => {
    try {
        const module = await import(
            /* webpackIgnore: true */
            '/penguinmod/extensions.js'
        );

        const extensions = module.default;

        return extensions.map(extension => ({
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
        console.error('[PenguinMod] Failed to load gallery:', err);
        return [];
    }
};


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
            console.error(`Failed to fetch from ${url}:`, error);
            return defaultData;
        }
    };

    // 骞惰鎵ц鎵€鏈塮etch璇锋眰
    const [ztdata, twdata, mistdata, spdata, pmdata] = await Promise.all([
        // 02engine
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
                            <a
                                href={credit.link}
                                target="_blank"
                                rel="noreferrer"
                                key={credit.name}
                            >
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

        // turbowarp
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
                            <a
                                href={credit.link}
                                target="_blank"
                                rel="noreferrer"
                                key={credit.name}
                            >
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

        // Mist
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
                            <a
                                href={credit.link}
                                target="_blank"
                                rel="noreferrer"
                                key={credit.name}
                            >
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

        // sharkpool
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
                featured: true,
                originalData: {
                    creator: extension.creator,
                    status: extension.status,
                    date: extension.date
                }
            })),
            []
        ),
        // PenguinMod
        await fetchPenguinModLibrary()
    ]);

    const result = [];
    const sources = [
        { data: twdata, name: 'turbowarp' },
        { data: ztdata, name: 'ztengine' },
        { data: pmdata, name: 'penguinmod' },
        { data: mistdata, name: 'mist' },
        { data: spdata, name: 'sharkpool' }
    ];
    
    // 閬嶅巻鎵€鏈夋潵婧愶紝娣诲姞鎵╁睍鍜屽垎鍓茬嚎
    for (let i = 0; i < sources.length; i++) {
        const { data } = sources[i];
        if (data.length > 0) {
            result.push(...data);
            // 涓嶆槸鏈€鍚庝竴涓潵婧愪笖鏈夋暟鎹椂锛屾坊鍔犲垎鍓茬嚎
            if (i < sources.length - 1) {
                result.push('---');
            }
        }
    }
    
    return result;
};

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'executeItemAction',
            'getBatchSelectableItems',
            'getLibraryItems',
            'handleBatchImport',
            'handleEnableProcedureReturns',
            'handleItemSelect',
            'handleSelectionToggle',
            'isItemSelectable',
            'isItemSelected'
        ]);
        this.state = {
            gallery: cachedGallery,
            galleryError: null,
            galleryTimedOut: false,
            selectedItemKeys: []
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

        // 鏄剧ず瀵煎叆鏂瑰紡閫夋嫨妯℃€佹
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
        } else {
            // 鍥為€€鍒板師鏉ョ殑琛屼负
            if (this.props.vm.extensionManager.isExtensionLoaded(extensionId)) {
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
    isItemSelectable (item) {
        return isBatchSelectableItem(item);
    }
    isItemSelected (item) {
        return this.state.selectedItemKeys.includes(getItemSelectionKey(item));
    }
    getLibraryItems () {
        const library = extensionLibraryContent.map(toLibraryItem);
        library.push('---');
        if (this.state.gallery) {
            library.push(toLibraryItem(galleryMore));
            const locale = this.props.intl.locale;
            library.push(
                ...this.state.gallery
                    .map(i => translateGalleryItem(i, locale))
                    .map(toLibraryItem)
            );
        } else if (this.state.galleryError) {
            library.push(toLibraryItem(galleryError));
        } else {
            library.push(toLibraryItem(galleryLoading));
        }
        return library;
    }
    getBatchSelectableItems () {
        return this.getLibraryItems().filter(isBatchSelectableItem);
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
    render () {
        let library = null;
        if (this.state.gallery || this.state.galleryError || this.state.galleryTimedOut) {
            library = this.getLibraryItems();
        }

        return (
            <LibraryComponent
                data={library}
                filterable
                headerAction={this.state.selectedItemKeys.length > 0 ? (
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
                ) : null}
                persistableKey="extensionId"
                id="extensionLibrary"
                isItemSelectable={this.isItemSelectable}
                isItemSelected={this.isItemSelected}
                tags={extensionTags}
                title={this.props.intl.formatMessage(messages.extensionTitle)}
                visible={this.props.visible}
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
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

export default injectIntl(ExtensionLibrary);

