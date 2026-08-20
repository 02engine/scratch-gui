import classNames from 'classnames';
import React from 'react';
import Box from '../../box/box.jsx';
import styles from './layout-container.css';

const LayoutContainer = ({ menuCollapsed, children, ...props }) => (
    <Box
        className={classNames(styles.layoutContainer, {
            [styles.menuCollapsed]: menuCollapsed
        })}
        {...props}
    >
        {children}
    </Box>
);

export default LayoutContainer;
