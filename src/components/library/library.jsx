import classNames from 'classnames';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import LibraryItem from '../../containers/library-item.jsx';
import Modal from '../../containers/modal.jsx';
import Divider from '../divider/divider.jsx';
import Filter from '../filter/filter.jsx';
import TagButton from '../../containers/tag-button.jsx';
import Spinner from '../spinner/spinner.jsx';
import Separator from '../tw-extension-separator/separator.jsx';
import RemovedTrademarks from '../tw-removed-trademarks/removed-trademarks.jsx';
import {APP_NAME} from '../../lib/brand.js';

import styles from './library.css';

const messages = defineMessages({
    filterPlaceholder: {
        id: 'gui.library.filterPlaceholder',
        defaultMessage: 'Search',
        description: 'Placeholder text for library search field'
    },
    allTag: {
        id: 'gui.library.allTag',
        defaultMessage: 'All',
        description: 'Label for library tag to revert to all items after filtering by tag.'
    }
});

const ALL_TAG = {tag: 'all', intlLabel: messages.allTag};
const tagListPrefix = [ALL_TAG];

class LibraryComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'getDisplayData',
            'getFilteredData',
            'getFavorites',
            'getFilterQuery',
            'getItemExtraProps',
            'handleClose',
            'handleFilterChange',
            'handleFilterClear',
            'handleMouseEnter',
            'handleMouseLeave',
            'handleItemSelectionToggle',
            'handlePlayingEnd',
            'handleSelect',
            'handleFavorite',
            'handleTagClick',
            'renderLibraryItem',
            'renderSections',
            'scrollToTop',
            'setFilteredDataRef'
        ]);
        const favorites = this.readFavoritesFromStorage();
        this.state = {
            playingItem: null,
            filterQuery: '',
            selectedTag: ALL_TAG.tag,
            canDisplay: false,
            favorites,
            initialFavorites: favorites
        };
    }
    componentDidMount () {
        setTimeout(() => {
            this.setState({
                canDisplay: true
            });
        });
        if (this.props.setStopHandler) this.props.setStopHandler(this.handlePlayingEnd);
    }
    componentDidUpdate (prevProps, prevState) {
        const prevFilterQuery = typeof prevProps.filterQuery === 'string' ?
            prevProps.filterQuery :
            prevState.filterQuery;
        const nextFilterQuery = this.getFilterQuery();
        if (
            prevFilterQuery !== nextFilterQuery ||
            prevState.selectedTag !== this.state.selectedTag ||
            prevProps.contentKey !== this.props.contentKey
        ) {
            this.scrollToTop();
        }

        const prevFavorites = typeof prevProps.favorites !== 'undefined' ?
            prevProps.favorites :
            prevState.favorites;
        const nextFavorites = this.getFavorites();
        if (JSON.stringify(prevFavorites) !== JSON.stringify(nextFavorites)) {
            try {
                localStorage.setItem(this.getFavoriteStorageKey(), JSON.stringify(nextFavorites));
            } catch (error) {
                // ignore
            }
        }
    }
    getFavoriteStorageKey () {
        return `tw:library-favorites:${this.props.id}`;
    }
    getFavorites () {
        return Array.isArray(this.props.favorites) ? this.props.favorites : this.state.favorites;
    }
    getFilterQuery () {
        return typeof this.props.filterQuery === 'string' ? this.props.filterQuery : this.state.filterQuery;
    }
    getItemExtraProps (dataItem) {
        return this.props.getItemProps ? this.props.getItemProps(dataItem) : {};
    }
    getDisplayData () {
        if (this.props.sections) {
            return this.props.sections.reduce((items, section) => items.concat(section.items), []);
        }
        return this.getFilteredData();
    }
    handleSelect (id) {
        this.handleClose();
        this.props.onItemSelected(this.getDisplayData()[id]);
    }
    handleItemSelectionToggle (id) {
        if (this.props.onItemSelectionToggle) {
            this.props.onItemSelectionToggle(this.getDisplayData()[id]);
        }
    }
    readFavoritesFromStorage () {
        let data;
        try {
            data = JSON.parse(localStorage.getItem(this.getFavoriteStorageKey()));
        } catch (error) {
            // ignore
        }
        if (!Array.isArray(data)) {
            data = [];
        }
        return data;
    }
    handleFavorite (id) {
        const data = this.getDisplayData()[id];
        const key = data[this.props.persistableKey];
        const favorites = this.getFavorites();
        const nextFavorites = favorites.includes(key) ? (
            favorites.filter(i => i !== key)
        ) : (
            [...favorites, key]
        );
        if (this.props.onFavoritesChange) {
            this.props.onFavoritesChange(nextFavorites);
        } else {
            this.setState({favorites: nextFavorites});
        }
    }
    handleClose () {
        this.props.onRequestClose();
    }
    handleTagClick (tag) {
        if (this.state.playingItem === null) {
            this.setState({
                filterQuery: '',
                selectedTag: tag.toLowerCase()
            });
        } else {
            this.props.onItemMouseLeave(this.getFilteredData()[this.state.playingItem]);
            this.setState({
                filterQuery: '',
                playingItem: null,
                selectedTag: tag.toLowerCase()
            });
        }
    }
    handleMouseEnter (id) {
        if (this.props.onItemMouseEnter && this.state.playingItem !== id) {
            this.props.onItemMouseEnter(this.getDisplayData()[id]);
            this.setState({
                playingItem: id
            });
        }
    }
    handleMouseLeave (id) {
        if (this.props.onItemMouseLeave) {
            this.props.onItemMouseLeave(this.getDisplayData()[id]);
            this.setState({
                playingItem: null
            });
        }
    }
    handlePlayingEnd () {
        if (this.state.playingItem !== null) {
            this.setState({
                playingItem: null
            });
        }
    }
    handleFilterChange (event) {
        if (this.state.playingItem !== null) {
            this.props.onItemMouseLeave(this.getDisplayData()[this.state.playingItem]);
            this.setState({
                playingItem: null
            });
        }
        if (this.props.onFilterQueryChange) {
            this.props.onFilterQueryChange(event.target.value);
        } else {
            this.setState({
                filterQuery: event.target.value,
                selectedTag: ALL_TAG.tag
            });
        }
    }
    handleFilterClear () {
        if (this.props.onFilterQueryClear) {
            this.props.onFilterQueryClear();
        } else if (this.props.onFilterQueryChange) {
            this.props.onFilterQueryChange('');
        } else {
            this.setState({filterQuery: ''});
        }
    }
    getFilteredData () {
        const favorites = this.getFavorites();
        const filterQuery = this.getFilterQuery();

        if (this.state.selectedTag === 'all' && !filterQuery) {
            const favoriteItems = this.props.data
                .filter(dataItem => (
                    dataItem !== '---' &&
                    this.state.initialFavorites.includes(dataItem[this.props.persistableKey])
                ))
                .map(dataItem => ({
                    ...dataItem,
                    key: `favorite-${dataItem[this.props.persistableKey]}`
                }));

            if (favoriteItems.length) {
                favoriteItems.push('---');
            }

            return [
                ...favoriteItems,
                ...this.props.data
            ];
        }

        const favoriteItems = [];
        const nonFavoriteItems = [];
        for (const dataItem of this.props.data) {
            if (dataItem === '---') {
                continue;
            }
            if (favorites.includes(dataItem[this.props.persistableKey])) {
                favoriteItems.push(dataItem);
            } else {
                nonFavoriteItems.push(dataItem);
            }
        }

        let filteredItems = favoriteItems.concat(nonFavoriteItems);

        if (this.state.selectedTag !== 'all') {
            filteredItems = filteredItems.filter(dataItem => (
                dataItem.tags &&
                dataItem.tags.map(i => i.toLowerCase()).includes(this.state.selectedTag)
            ));
        }

        if (filterQuery) {
            filteredItems = filteredItems.filter(dataItem => {
                const search = [...dataItem.tags];
                if (dataItem.name) {
                    if (typeof dataItem.name === 'string') {
                        search.push(dataItem.name);
                    } else {
                        search.push(this.props.intl.formatMessage(dataItem.name.props, {
                            APP_NAME
                        }));
                    }
                }
                if (dataItem.description) {
                    search.push(dataItem.description);
                }
                return search
                    .join('\n')
                    .toLowerCase()
                    .includes(filterQuery.toLowerCase());
            });
        }

        return filteredItems;
    }
    scrollToTop () {
        if (this.filteredDataRef) {
            this.filteredDataRef.scrollTop = 0;
        }
    }
    setFilteredDataRef (ref) {
        this.filteredDataRef = ref;
    }
    renderLibraryItem (dataItem, index) {
        return (
            <LibraryItem
                bluetoothRequired={dataItem.bluetoothRequired}
                collaborator={dataItem.collaborator}
                description={dataItem.description}
                disabled={dataItem.disabled}
                extensionId={dataItem.extensionId}
                href={dataItem.href}
                featured={dataItem.featured}
                hidden={dataItem.hidden}
                iconMd5={dataItem.costumes ? dataItem.costumes[0].md5ext : dataItem.md5ext}
                iconRawURL={dataItem.rawURL}
                icons={dataItem.costumes}
                id={index}
                incompatibleWithScratch={dataItem.incompatibleWithScratch}
                favorite={this.getFavorites().includes(dataItem[this.props.persistableKey])}
                onFavorite={this.handleFavorite}
                insetIconURL={dataItem.insetIconURL}
                internetConnectionRequired={dataItem.internetConnectionRequired}
                isPlaying={this.state.playingItem === index}
                isSelectable={this.props.isItemSelectable && this.props.isItemSelectable(dataItem)}
                isSelected={this.props.isItemSelected && this.props.isItemSelected(dataItem)}
                key={dataItem.key || (
                    typeof dataItem.name === 'string' ?
                        dataItem.name :
                        dataItem.rawURL
                )}
                name={dataItem.name}
                credits={dataItem.credits}
                samples={dataItem.samples}
                docsURI={dataItem.docsURI}
                showPlayButton={this.props.showPlayButton}
                onMouseEnter={this.handleMouseEnter}
                onMouseLeave={this.handleMouseLeave}
                onSelectionToggle={this.handleItemSelectionToggle}
                onSelect={this.handleSelect}
                {...this.getItemExtraProps(dataItem)}
            />
        );
    }
    renderSections () {
        let itemIndex = 0;
        return this.props.sections.map(section => {
            if (!section.items || !section.items.length) {
                return null;
            }
            return (
                <section className={styles.sectionBlock} key={section.key}>
                    <div className={styles.sectionHeader}>
                        <div className={styles.sectionTitle}>{section.title}</div>
                        <div className={styles.sectionCount}>{section.items.length}</div>
                    </div>
                    <div className={styles.sectionGrid}>
                        {section.items.map(item => {
                            const rendered = this.renderLibraryItem(item, itemIndex);
                            itemIndex += 1;
                            return rendered;
                        })}
                    </div>
                </section>
            );
        });
    }
    render () {
        const hasFilterBar = this.props.filterable || this.props.tags || this.props.quickFilters || this.props.headerAction;
        const filteredData = this.state.canDisplay && this.props.data && this.getFilteredData();
        const hasSectionItems = this.state.canDisplay &&
            this.props.sections &&
            this.props.sections.some(section => section.items.length > 0);

        return (
            <Modal
                className={styles.libraryModal}
                fullScreen
                contentLabel={this.props.title}
                id={this.props.id}
                onRequestClose={this.handleClose}
            >
                {hasFilterBar && (
                    <div className={styles.filterBar}>
                        {this.props.filterable && (
                            <Filter
                                className={classNames(
                                    styles.filterBarItem,
                                    styles.filter
                                )}
                                filterQuery={this.getFilterQuery()}
                                inputClassName={styles.filterInput}
                                placeholderText={this.props.intl.formatMessage(messages.filterPlaceholder)}
                                onChange={this.handleFilterChange}
                                onClear={this.handleFilterClear}
                            />
                        )}
                        {this.props.filterable && (this.props.tags || this.props.quickFilters) && (
                            <Divider className={classNames(styles.filterBarItem, styles.divider)} />
                        )}
                        {this.props.tags ? (
                            <div className={styles.tagWrapper}>
                                {tagListPrefix.concat(this.props.tags).map((tagProps, id) => (
                                    <TagButton
                                        active={this.state.selectedTag === tagProps.tag.toLowerCase()}
                                        className={classNames(
                                            styles.filterBarItem,
                                            styles.tagButton,
                                            tagProps.className
                                        )}
                                        key={`tag-button-${id}`}
                                        onClick={this.handleTagClick}
                                        {...tagProps}
                                    />
                                ))}
                            </div>
                        ) : null}
                        {this.props.quickFilters ? (
                            <div className={styles.quickFilters}>
                                {this.props.quickFilters}
                            </div>
                        ) : null}
                        {this.props.headerAction ? (
                            <div className={styles.headerAction}>
                                {this.props.headerAction}
                            </div>
                        ) : null}
                    </div>
                )}
                <div className={styles.libraryWorkspace}>
                    {this.props.sidebar ? (
                        <aside className={classNames(styles.librarySidebar, {
                            [styles.withFilterBarSidebar]: hasFilterBar
                        })}
                        >
                            {this.props.sidebar}
                        </aside>
                    ) : null}
                    <div className={styles.libraryMain}>
                        <div
                            className={classNames(styles.libraryScrollGrid, {
                                [styles.withFilterBar]: hasFilterBar,
                                [styles.sectionScrollGrid]: this.props.sections,
                                [styles.withSidebar]: this.props.sidebar
                            })}
                            ref={this.setFilteredDataRef}
                        >
                            {this.props.sections && this.state.canDisplay ? (
                                hasSectionItems ? this.renderSections() : this.props.emptyState
                            ) : null}
                            {!this.props.sections && filteredData && this.getFilteredData().map((dataItem, index) => (
                                dataItem === '---' ? (
                                    <Separator key={index} />
                                ) : this.renderLibraryItem(dataItem, index)
                            ))}
                            {!this.props.sections && filteredData && this.props.removedTrademarks && (
                                <React.Fragment>
                                    {filteredData.length > 0 && (
                                        <Separator />
                                    )}
                                    <RemovedTrademarks />
                                </React.Fragment>
                            )}
                            {!this.state.canDisplay && (
                                <div className={styles.spinnerWrapper}>
                                    <Spinner large />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Modal>
        );
    }
}

LibraryComponent.propTypes = {
    contentKey: PropTypes.string,
    data: PropTypes.arrayOf(PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.object
    ])),
    emptyState: PropTypes.node,
    favorites: PropTypes.arrayOf(PropTypes.string),
    filterQuery: PropTypes.string,
    filterable: PropTypes.bool,
    getItemProps: PropTypes.func,
    headerAction: PropTypes.node,
    id: PropTypes.string.isRequired,
    intl: intlShape.isRequired,
    isItemSelectable: PropTypes.func,
    isItemSelected: PropTypes.func,
    onFavoritesChange: PropTypes.func,
    onFilterQueryChange: PropTypes.func,
    onFilterQueryClear: PropTypes.func,
    onItemMouseEnter: PropTypes.func,
    onItemMouseLeave: PropTypes.func,
    onItemSelected: PropTypes.func.isRequired,
    onItemSelectionToggle: PropTypes.func,
    onRequestClose: PropTypes.func.isRequired,
    persistableKey: PropTypes.string,
    quickFilters: PropTypes.node,
    removedTrademarks: PropTypes.bool,
    sections: PropTypes.arrayOf(PropTypes.shape({
        items: PropTypes.arrayOf(PropTypes.object),
        key: PropTypes.string,
        title: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.node
        ])
    })),
    setStopHandler: PropTypes.func,
    showPlayButton: PropTypes.bool,
    sidebar: PropTypes.node,
    tags: PropTypes.arrayOf(PropTypes.shape({
        className: PropTypes.string,
        intlLabel: PropTypes.object,
        tag: PropTypes.string
    })),
    title: PropTypes.string.isRequired
};

LibraryComponent.defaultProps = {
    data: null,
    emptyState: null,
    favorites: undefined,
    filterQuery: undefined,
    filterable: false,
    getItemProps: null,
    headerAction: null,
    isItemSelectable: null,
    isItemSelected: null,
    onFavoritesChange: null,
    onFilterQueryChange: null,
    onFilterQueryClear: null,
    onItemMouseEnter: null,
    onItemMouseLeave: null,
    onItemSelectionToggle: null,
    persistableKey: 'name',
    quickFilters: null,
    removedTrademarks: false,
    sections: null,
    setStopHandler: null,
    showPlayButton: false,
    sidebar: null,
    tags: null,
    contentKey: null
};

export default injectIntl(LibraryComponent);
