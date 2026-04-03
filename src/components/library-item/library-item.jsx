import {FormattedMessage, intlShape, defineMessages} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';

import Box from '../box/box.jsx';
import PlayButton from '../../containers/play-button.jsx';
import styles from './library-item.css';
import classNames from 'classnames';

import bluetoothIconURL from './bluetooth.svg';
import internetConnectionIconURL from './internet-connection.svg';
import favoriteInactiveIcon from './favorite-inactive.svg';
import favoriteActiveIcon from './favorite-active.svg';

const messages = defineMessages({
    favorite: {
        defaultMessage: 'Favorite',
        description: 'Alt text of icon in costume, sound, and extension libraries to mark an item as favorite.',
        id: 'tw.favorite'
    },
    unfavorite: {
        defaultMessage: 'Unfavorite',
        description: 'Alt text of icon in costume, sound, and extension libraries to unmark an item as favorite.',
        id: 'tw.unfavorite'
    },
    select: {
        defaultMessage: 'Select',
        description: 'Tooltip for selecting a library item for batch actions.',
        id: 'tw.libraryItem.select'
    },
    unselect: {
        defaultMessage: 'Cancel selection',
        description: 'Tooltip for removing a library item from batch selection.',
        id: 'tw.libraryItem.unselect'
    }
});

/* eslint-disable react/prefer-stateless-function */
class LibraryItemComponent extends React.PureComponent {
    render () {
        const favoriteMessage = this.props.intl.formatMessage(
            this.props.favorite ? messages.unfavorite : messages.favorite
        );
        const selectionMessage = this.props.intl.formatMessage(
            this.props.isSelected ? messages.unselect : messages.select
        );
        const favorite = (
            <button
                className={classNames(styles.favoriteContainer, {[styles.active]: this.props.favorite})}
                onClick={this.props.onFavorite}
            >
                <img
                    src={this.props.favorite ? favoriteActiveIcon : favoriteInactiveIcon}
                    className={styles.favoriteIcon}
                    draggable={false}
                    alt={favoriteMessage}
                    title={favoriteMessage}
                />
            </button>
        );
        const selectionCheckbox = this.props.isSelectable ? (
            <button
                className={classNames(styles.selectionContainer, {
                    [styles.selectionActive]: this.props.isSelected
                })}
                onClick={this.props.onSelectionToggle}
                title={selectionMessage}
                aria-label={selectionMessage}
            >
                <span className={styles.selectionCheckbox}>
                    {this.props.isSelected ? <span className={styles.selectionCheckmark} /> : null}
                </span>
            </button>
        ) : null;
        const sourceBadge = this.props.sourceLabel ? (
            <span
                className={classNames(
                    styles.sourceBadge,
                    this.props.sourceTone ? styles[`sourceBadge${this.props.sourceTone}`] : null
                )}
            >
                {this.props.sourceLabel}
            </span>
        ) : null;
        const statusBadges = this.props.badges && this.props.badges.length ? (
            <div className={styles.badgeRow}>
                {this.props.badges.map(badge => (
                    <span key={badge.key || badge.label} className={styles.statusBadge}>
                        {badge.label}
                    </span>
                ))}
            </div>
        ) : null;
        const actionHint = this.props.actionLabel ? (
            <div className={styles.actionHint}>{this.props.actionLabel}</div>
        ) : null;

        return this.props.featured ? (
            <div
                className={classNames(
                    styles.libraryItem,
                    styles.featuredItem,
                    {
                        [styles.disabled]: this.props.disabled
                    },
                    typeof this.props.extensionId === 'string' ? styles.libraryItemExtension : null,
                    this.props.hidden ? styles.hidden : null
                )}
                onClick={this.props.onClick}
            >
                <div className={styles.featuredImageContainer}>
                    {sourceBadge}
                    {this.props.disabled ? (
                        <div className={styles.comingSoonText}>
                            <FormattedMessage
                                defaultMessage="Coming Soon"
                                description="Label for extensions that are not yet implemented"
                                id="gui.extensionLibrary.comingSoon"
                            />
                        </div>
                    ) : null}
                    <img
                        className={styles.featuredImage}
                        loading="lazy"
                        draggable={false}
                        src={this.props.iconURL}
                    />
                </div>
                {this.props.insetIconURL ? (
                    <div className={styles.libraryItemInsetImageContainer}>
                        <img
                            className={styles.libraryItemInsetImage}
                            src={this.props.insetIconURL}
                            draggable={false}
                        />
                    </div>
                ) : null}
                <div
                    className={typeof this.props.extensionId === 'string' ?
                        classNames(styles.featuredExtensionText, styles.featuredText) : styles.featuredText
                    }
                >
                    <span className={styles.libraryItemName}>{this.props.name}</span>
                    <span className={styles.featuredDescription}>{this.props.description}</span>
                    {statusBadges}
                    {actionHint}
                </div>

                {(this.props.docsURI || this.props.samples) && (
                    <div className={styles.extensionLinks}>
                        {this.props.docsURI && (
                            <a
                                href={this.props.docsURI}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <FormattedMessage
                                    defaultMessage="Documentation"
                                    // eslint-disable-next-line max-len
                                    description="Appears in the extension list. Links to additional extension documentation."
                                    id="tw.documentation"
                                />
                            </a>
                        )}

                        {this.props.samples && (
                            <a
                                href={this.props.samples[0].href}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <FormattedMessage
                                    defaultMessage="Sample project"
                                    // eslint-disable-next-line max-len
                                    description="Appears in the extension list. Links to a sample project for an extension."
                                    id="tw.sample"
                                />
                            </a>
                        )}
                    </div>
                )}

                {this.props.credits && this.props.credits.length > 0 && (
                    <div className={styles.extensionLinks}>
                        <div>
                            <FormattedMessage
                                defaultMessage="Created by:"
                                description="Appears in the extension list. Followed by a list of names."
                                id="tw.createdBy"
                            />
                            {' '}
                            {this.props.credits.map((credit, index) => (
                                <React.Fragment key={index}>
                                    {credit}
                                    {index !== this.props.credits.length - 1 && (
                                        ', '
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}

                {this.props.bluetoothRequired || this.props.internetConnectionRequired || this.props.collaborator ? (
                    <div className={styles.featuredExtensionMetadata}>
                        <div className={styles.featuredExtensionRequirement}>
                            {this.props.bluetoothRequired || this.props.internetConnectionRequired ? (
                                <div>
                                    <div>
                                        <FormattedMessage
                                            defaultMessage="Requires"
                                            description="Label for extension hardware requirements"
                                            id="gui.extensionLibrary.requires"
                                        />
                                    </div>
                                    <div
                                        className={styles.featuredExtensionMetadataDetail}
                                    >
                                        {this.props.bluetoothRequired ? (
                                            <img
                                                src={bluetoothIconURL}
                                                draggable={false}
                                            />
                                        ) : null}
                                        {this.props.internetConnectionRequired ? (
                                            <img
                                                src={internetConnectionIconURL}
                                                draggable={false}
                                            />
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        <div className={styles.featuredExtensionCollaboration}>
                            {this.props.collaborator ? (
                                <div>
                                    <div>
                                        <FormattedMessage
                                            defaultMessage="Collaboration with"
                                            description="Label for extension collaboration"
                                            id="gui.extensionLibrary.collaboration"
                                        />
                                    </div>
                                    <div
                                        className={styles.featuredExtensionMetadataDetail}
                                    >
                                        {this.props.collaborator}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                {favorite}
                {selectionCheckbox}
            </div>
        ) : (
            <Box
                className={classNames(
                    styles.libraryItem, {
                        [styles.hidden]: this.props.hidden
                    }
                )}
                role="button"
                tabIndex="0"
                onBlur={this.props.onBlur}
                onClick={this.props.onClick}
                onFocus={this.props.onFocus}
                onKeyPress={this.props.onKeyPress}
                onMouseEnter={this.props.showPlayButton ? null : this.props.onMouseEnter}
                onMouseLeave={this.props.showPlayButton ? null : this.props.onMouseLeave}
            >
                {/* Layers of wrapping is to prevent layout thrashing on animation */}
                <Box className={styles.libraryItemImageContainerWrapper}>
                    <Box
                        className={styles.libraryItemImageContainer}
                        onMouseEnter={this.props.showPlayButton ? this.props.onMouseEnter : null}
                        onMouseLeave={this.props.showPlayButton ? this.props.onMouseLeave : null}
                    >
                        <img
                            className={styles.libraryItemImage}
                            loading="lazy"
                            src={this.props.iconURL}
                            draggable={false}
                        />
                        {sourceBadge}
                    </Box>
                </Box>
                <span className={styles.libraryItemName}>{this.props.name}</span>
                {statusBadges}
                {actionHint}
                {this.props.showPlayButton ? (
                    <PlayButton
                        isPlaying={this.props.isPlaying}
                        onPlay={this.props.onPlay}
                        onStop={this.props.onStop}
                    />
                ) : null}

                {favorite}
                {selectionCheckbox}
            </Box>
        );
    }
}
/* eslint-enable react/prefer-stateless-function */


LibraryItemComponent.propTypes = {
    intl: intlShape,
    bluetoothRequired: PropTypes.bool,
    collaborator: PropTypes.string,
    description: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.node
    ]),
    disabled: PropTypes.bool,
    extensionId: PropTypes.string,
    featured: PropTypes.bool,
    hidden: PropTypes.bool,
    iconURL: PropTypes.string,
    insetIconURL: PropTypes.string,
    internetConnectionRequired: PropTypes.bool,
    isPlaying: PropTypes.bool,
    isSelectable: PropTypes.bool,
    isSelected: PropTypes.bool,
    name: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.node
    ]),
    credits: PropTypes.arrayOf(PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.node
    ])),
    docsURI: PropTypes.string,
    samples: PropTypes.arrayOf(PropTypes.shape({
        href: PropTypes.string,
        text: PropTypes.string
    })),
    favorite: PropTypes.bool,
    onFavorite: PropTypes.func,
    onBlur: PropTypes.func.isRequired,
    onClick: PropTypes.func.isRequired,
    onFocus: PropTypes.func.isRequired,
    onKeyPress: PropTypes.func.isRequired,
    onMouseEnter: PropTypes.func.isRequired,
    onMouseLeave: PropTypes.func.isRequired,
    onPlay: PropTypes.func.isRequired,
    onSelectionToggle: PropTypes.func,
    onStop: PropTypes.func.isRequired,
    showPlayButton: PropTypes.bool,
    actionLabel: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.node
    ]),
    badges: PropTypes.arrayOf(PropTypes.shape({
        key: PropTypes.string,
        label: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.node
        ])
    })),
    sourceLabel: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.node
    ]),
    sourceTone: PropTypes.string
};

LibraryItemComponent.defaultProps = {
    disabled: false,
    showPlayButton: false
};

export default LibraryItemComponent;
