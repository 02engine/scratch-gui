import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';

import DeleteButton from '../delete-button/delete-button.jsx';
import styles from './sprite-selector-item.css';
import {ContextMenuTrigger, hideMenu} from 'react-contextmenu';
import {DangerousMenuItem, ContextMenu, MenuItem} from '../context-menu/context-menu.jsx';
import {FormattedMessage} from 'react-intl';

// react-contextmenu requires unique id to match trigger and context menu
let contextMenuId = 0;

const SpriteSelectorItem = props => {
    const contextMenuIdRef = React.useRef(null);
    if (!contextMenuIdRef.current) {
        contextMenuIdRef.current = `sprite-selector-item-${contextMenuId++}`;
    }
    const menuId = contextMenuIdRef.current;

    const handleMenuMouseDown = onClick => event => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        onClick(event);
        hideMenu();
    };

    const menu = props.onDuplicateButtonClick || props.onDeleteButtonClick || props.onExportButtonClick ? (
        <ContextMenu id={menuId}>
            {props.onDuplicateButtonClick ? (
                <MenuItem
                    onClick={null}
                    onMouseDown={handleMenuMouseDown(props.onDuplicateButtonClick)}
                >
                    <FormattedMessage
                        defaultMessage="duplicate"
                        description="Menu item to duplicate in the right click menu"
                        id="gui.spriteSelectorItem.contextMenuDuplicate"
                    />
                </MenuItem>
            ) : null}
            {props.onExportButtonClick ? (
                <MenuItem
                    onClick={null}
                    onMouseDown={handleMenuMouseDown(props.onExportButtonClick)}
                >
                    <FormattedMessage
                        defaultMessage="export"
                        description="Menu item to export the selected item"
                        id="gui.spriteSelectorItem.contextMenuExport"
                    />
                </MenuItem>
            ) : null }
            {props.onRenameButtonClick ? (
                <MenuItem
                    onClick={null}
                    onMouseDown={handleMenuMouseDown(props.onRenameButtonClick)}
                >
                    <FormattedMessage
                        defaultMessage="rename"
                        description="Menu item to rename an item"
                        id="tw.spriteSelectorItem.rename"
                    />
                </MenuItem>
            ) : null}
            {props.onDeleteButtonClick ? (
                <DangerousMenuItem
                    onClick={null}
                    onMouseDown={handleMenuMouseDown(props.onDeleteButtonClick)}
                >
                    <FormattedMessage
                        defaultMessage="delete"
                        description="Menu item to delete in the right click menu"
                        id="gui.spriteSelectorItem.contextMenuDelete"
                    />
                </DangerousMenuItem>
            ) : null }
        </ContextMenu>
    ) : null;

    const attributes = {
        className: classNames(props.className, styles.spriteSelectorItem, {
            [styles.isSelected]: props.selected
        }),
        onClick: props.onClick,
        onContextMenu: props.onContextMenu,
        onMouseEnter: props.onMouseEnter,
        onMouseLeave: props.onMouseLeave,
        onMouseDown: props.onMouseDown,
        onTouchStart: props.onMouseDown
    };
    attributes['data-sa-context-menu-id'] = menuId;
    if (typeof props.id === 'string') {
        attributes['data-block-drop-target-id'] = props.id;
    }

    return (
        <React.Fragment>
            <ContextMenuTrigger
                attributes={attributes}
                disable={props.preventContextMenu || props.disableContextMenu}
                id={menuId}
                ref={props.componentRef}
            >
                {typeof props.number === 'undefined' ? null : (
                    <div className={styles.number}>{props.number}</div>
                )}
                {props.costumeURL ? (
                    <div className={styles.spriteImageOuter}>
                        <div className={styles.spriteImageInner}>
                            <img
                                className={styles.spriteImage}
                                draggable={false}
                                loading="lazy"
                                src={props.costumeURL}
                            />
                        </div>
                    </div>
                ) : null}
                <div className={styles.spriteInfo}>
                    <div className={styles.spriteName}>{props.name}</div>
                    {props.details ? (
                        <div className={styles.spriteDetails}>{props.details}</div>
                    ) : null}
                </div>
                {(props.selected && props.onDeleteButtonClick) ? (
                    <DeleteButton
                        className={styles.deleteButton}
                        onClick={props.onDeleteButtonClick}
                    />
                ) : null }
            </ContextMenuTrigger>
            {menu && typeof document !== 'undefined' ? ReactDOM.createPortal(menu, document.body) : null}
        </React.Fragment>
    );
};

SpriteSelectorItem.propTypes = {
    className: PropTypes.string,
    componentRef: PropTypes.func,
    costumeURL: PropTypes.string,
    details: PropTypes.string,
    disableContextMenu: PropTypes.bool,
    dragType: PropTypes.string,
    // eslint-disable-next-line react/forbid-prop-types
    id: PropTypes.any,
    // eslint-disable-next-line react/forbid-prop-types
    name: PropTypes.any,
    number: PropTypes.number,
    onClick: PropTypes.func,
    onContextMenu: PropTypes.func,
    onDeleteButtonClick: PropTypes.func,
    onDuplicateButtonClick: PropTypes.func,
    onExportButtonClick: PropTypes.func,
    onRenameButtonClick: PropTypes.func,
    onMouseDown: PropTypes.func,
    onMouseEnter: PropTypes.func,
    onMouseLeave: PropTypes.func,
    preventContextMenu: PropTypes.bool,
    selected: PropTypes.bool.isRequired
};

export default SpriteSelectorItem;
