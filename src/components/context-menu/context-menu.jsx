import React from 'react';
import {ContextMenu, MenuItem} from 'react-contextmenu';
import classNames from 'classnames';

import styles from './context-menu.css';

const StyledContextMenu = props => (
    <ContextMenu
        {...props}
        className={styles.contextMenu}
    />
);

const StyledMenuItem = props => (
    <MenuItem
        {...props}
        attributes={{
            className: styles.menuItem,
            onMouseDown: props.onMouseDown
        }}
    />
);

const BorderedMenuItem = props => (
    <MenuItem
        {...props}
        attributes={{
            className: classNames(styles.menuItem, styles.menuItemBordered),
            onMouseDown: props.onMouseDown
        }}
    />
);

const DangerousMenuItem = props => (
    <MenuItem
        {...props}
        attributes={{
            className: classNames(styles.menuItem, styles.menuItemBordered, styles.menuItemDanger),
            onMouseDown: props.onMouseDown
        }}
    />
);


export {
    BorderedMenuItem,
    DangerousMenuItem,
    StyledContextMenu as ContextMenu,
    StyledMenuItem as MenuItem
};
