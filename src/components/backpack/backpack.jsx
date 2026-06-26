import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import {FormattedMessage, defineMessages, injectIntl, intlShape} from 'react-intl';
import DragConstants from '../../lib/drag-constants';
import {ComingSoonTooltip} from '../coming-soon/coming-soon.jsx';
import SpriteSelectorItem from '../../containers/sprite-selector-item.jsx';
import styles from './backpack.css';
import menuStyles from '../context-menu/context-menu.css';

// TODO make sprite selector item not require onClick
const noop = () => {};

const dragTypeMap = { // Keys correspond with the backpack-server item types
    costume: DragConstants.BACKPACK_COSTUME,
    sound: DragConstants.BACKPACK_SOUND,
    script: DragConstants.BACKPACK_CODE,
    sprite: DragConstants.BACKPACK_SPRITE
};

const labelMap = defineMessages({
    costume: {
        id: 'gui.backpack.costumeLabel',
        defaultMessage: 'costume',
        description: 'Label for costume backpack item'
    },
    sound: {
        id: 'gui.backpack.soundLabel',
        defaultMessage: 'sound',
        description: 'Label for sound backpack item'
    },
    script: {
        id: 'gui.backpack.scriptLabel',
        defaultMessage: 'script',
        description: 'Label for script backpack item'
    },
    sprite: {
        id: 'gui.backpack.spriteLabel',
        defaultMessage: 'sprite',
        description: 'Label for sprite backpack item'
    }
});

const Backpack = ({
    blockDragOver,
    containerRef,
    contents,
    contextMenu,
    dragOver,
    error,
    expanded,
    intl,
    loading,
    onCloseContextMenu,
    onContextMenu,
    onContextMenuRef,
    showMore,
    onToggle,
    onDelete,
    onRename,
    onMouseEnter,
    onMouseLeave,
    onMore
}) => {
    const customMenu = contextMenu && typeof document !== 'undefined' ? ReactDOM.createPortal(
        <div
            className={classNames(menuStyles.contextMenu, styles.backpackContextMenu)}
            data-backpack-context-menu
            ref={onContextMenuRef}
            onContextMenu={event => event.preventDefault()}
            style={{
                left: contextMenu.x,
                position: 'fixed',
                top: contextMenu.y
            }}
        >
            {contextMenu.type !== 'sprite' ? (
                <button
                    className={classNames(menuStyles.menuItem, styles.backpackContextMenuButton)}
                    onMouseDown={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRename(contextMenu.id);
                    }}
                    type="button"
                >
                    <FormattedMessage
                        defaultMessage="rename"
                        description="Menu item to rename an item"
                        id="tw.spriteSelectorItem.rename"
                    />
                </button>
            ) : null}
            <button
                className={classNames(
                    menuStyles.menuItem,
                    menuStyles.menuItemBordered,
                    menuStyles.menuItemDanger,
                    styles.backpackContextMenuButton
                )}
                onMouseDown={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDelete(contextMenu.id);
                }}
                type="button"
            >
                <FormattedMessage
                    defaultMessage="delete"
                    description="Menu item to delete in the right click menu"
                    id="gui.spriteSelectorItem.contextMenuDelete"
                />
            </button>
        </div>,
        document.body
    ) : null;

    return (
        <div className={styles.backpackContainer}>
            <div
                className={styles.backpackHeader}
                onClick={onToggle}
            >
                {onToggle ? (
                    <FormattedMessage
                        defaultMessage="Backpack"
                        description="Button to open the backpack"
                        id="gui.backpack.header"
                    />
                ) : (
                    <ComingSoonTooltip
                        place="top"
                        tooltipId="backpack-tooltip"
                    >
                        <FormattedMessage
                            defaultMessage="Backpack"
                            description="Button to open the backpack"
                            id="gui.backpack.header"
                        />
                    </ComingSoonTooltip>
                )}
            </div>
            {expanded ? (
                <div
                    className={classNames(styles.backpackList, {
                        [styles.dragOver]: dragOver || blockDragOver
                    })}
                    ref={containerRef}
                    onClick={onCloseContextMenu}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    {/* eslint-disable-next-line no-negated-condition */}
                    {error !== false ? (
                        <div className={styles.statusMessage}>
                            <FormattedMessage
                                defaultMessage="Error loading backpack"
                                description="Error backpack message"
                                id="gui.backpack.errorBackpack"
                            />
                            <div className={styles.errorMessage}>{error}</div>
                        </div>
                    ) : (
                        loading ? (
                            <div className={styles.statusMessage}>
                                <FormattedMessage
                                    defaultMessage="Loading..."
                                    description="Loading backpack message"
                                    id="gui.backpack.loadingBackpack"
                                />
                            </div>
                        ) : (
                            contents.length > 0 ? (
                                <div className={styles.backpackListInner}>
                                    {contents.map(item => (
                                        <SpriteSelectorItem
                                            className={styles.backpackItem}
                                            costumeURL={item.thumbnailUrl}
                                            details={item.name}
                                            disableContextMenu
                                            dragPayload={item}
                                            dragType={dragTypeMap[item.type]}
                                            id={item.id}
                                            key={item.id}
                                            name={intl.formatMessage(labelMap[item.type])}
                                            selected={false}
                                            onClick={noop}
                                            onContextMenu={event => onContextMenu(item, event)}
                                        />
                                    ))}
                                    {showMore && (
                                        <button
                                            className={styles.more}
                                            onClick={onMore}
                                        >
                                            <FormattedMessage
                                                defaultMessage="More"
                                                description="Load more from backpack"
                                                id="gui.backpack.more"
                                            />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className={styles.statusMessage}>
                                    <FormattedMessage
                                        defaultMessage="Backpack is empty"
                                        description="Empty backpack message"
                                        id="gui.backpack.emptyBackpack"
                                    />
                                </div>
                            )
                        )
                    )}
                </div>
            ) : null}
            {customMenu}
        </div>
    );
};

Backpack.propTypes = {
    blockDragOver: PropTypes.bool,
    containerRef: PropTypes.func,
    contents: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        thumbnailUrl: PropTypes.string,
        type: PropTypes.string,
        name: PropTypes.string
    })),
    contextMenu: PropTypes.shape({
        id: PropTypes.string,
        type: PropTypes.string,
        x: PropTypes.number,
        y: PropTypes.number
    }),
    dragOver: PropTypes.bool,
    error: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
    expanded: PropTypes.bool,
    intl: intlShape,
    loading: PropTypes.bool,
    onCloseContextMenu: PropTypes.func,
    onContextMenu: PropTypes.func,
    onContextMenuRef: PropTypes.func,
    onDelete: PropTypes.func,
    onRename: PropTypes.func,
    onMore: PropTypes.func,
    onMouseEnter: PropTypes.func,
    onMouseLeave: PropTypes.func,
    onToggle: PropTypes.func,
    showMore: PropTypes.bool
};

Backpack.defaultProps = {
    blockDragOver: false,
    contents: [],
    dragOver: false,
    expanded: false,
    loading: false,
    showMore: false,
    onMore: null,
    onToggle: null
};

export default injectIntl(Backpack);
