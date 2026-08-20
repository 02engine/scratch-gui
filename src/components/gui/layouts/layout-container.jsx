import React from 'react';
import Box from '../../box/box.jsx';
import styles from './layout-container.css';

const LayoutContainer = ({children, ...props}) => (
    <Box
        className={styles.layoutContainer}
        {...props}
    >
        {children}
    </Box>
);

export default LayoutContainer;
