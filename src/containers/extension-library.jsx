import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import log from '../lib/log';

import extensionLibraryContent, {
    galleryError,
    galleryLoading,
    galleryMore
} from '../lib/libraries/extensions/index.jsx';
import extensionTags from '../lib/libraries/tw-extension-tags';

import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';
import {length} from 'file-loader';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
    }
});

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
    // 如果是分割线，直接返回
    if (extension === '---') {
        return extension;
    }
    // 处理扩展对象
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
    // 辅助函数：安全获取数据
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

    // 并行执行所有fetch请求
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

    // 合并所有数据
    const result = [];
    // 扩展来源列表，方便以后添加新的来源
    const sources = [
        { data: twdata, name: 'turbowarp' },
        { data: ztdata, name: 'ztengine' },
        { data: pmdata, name: 'penguinmod' },
        { data: mistdata, name: 'mist' },
        { data: spdata, name: 'sharkpool' }
    ];
    
    // 遍历所有来源，添加扩展和分割线
    for (let i = 0; i < sources.length; i++) {
        const { data } = sources[i];
        if (data.length > 0) {
            result.push(...data);
            // 不是最后一个来源且有数据时，添加分割线
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
            'handleItemSelect'
        ]);
        this.state = {
            gallery: cachedGallery,
            galleryError: null,
            galleryTimedOut: false
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
    handleItemSelect (item) {
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
            this.props.onEnableProcedureReturns();
            this.props.onCategorySelected('myBlocks');
            return;
        }

        if (item.disabled) {
            return;
        }

        // 显示导入方式选择模态框
        if (this.props.onSetSelectedExtension && this.props.onOpenExtensionImportMethodModal) {
            this.props.onSetSelectedExtension({
                extensionId,
                extensionURL
            });
            this.props.onOpenExtensionImportMethodModal();
        } else {
            // 回退到原来的行为
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
    render () {
        let library = null;
        if (this.state.gallery || this.state.galleryError || this.state.galleryTimedOut) {
            library = extensionLibraryContent.map(toLibraryItem);
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
        }

        return (
            <LibraryComponent
                data={library}
                filterable
                persistableKey="extensionId"
                id="extensionLibrary"
                tags={extensionTags}
                title={this.props.intl.formatMessage(messages.extensionTitle)}
                visible={this.props.visible}
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
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

export default injectIntl(ExtensionLibrary);
