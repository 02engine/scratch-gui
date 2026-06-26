import PropTypes from 'prop-types';
import classNames from 'classnames';
import React from 'react';
import Box from '../box/box.jsx';
import styles from './blocks.css';

const BlocksComponent = props => {
    const {
        containerRef,
        dragOver,
        editorBackgroundActive,
        editorBackgroundStyle,
        flyoutResizeHandleStyle,
        onFlyoutResizeMouseDown,
        style,
        ...componentProps
    } = props;
    return (
        <Box
            className={classNames(styles.blocks, {
                [styles.dragOver]: dragOver,
                [styles.customBackground]: editorBackgroundActive
            })}
            {...componentProps}
            componentRef={containerRef}
            style={Object.assign({}, style, editorBackgroundStyle)}
        >
            {onFlyoutResizeMouseDown ? (
                <div
                    className={styles.flyoutResizeHandle}
                    style={flyoutResizeHandleStyle}
                    onMouseDown={onFlyoutResizeMouseDown}
                    onTouchStart={onFlyoutResizeMouseDown}
                />
            ) : null}
        </Box>
    );
};
BlocksComponent.propTypes = {
    containerRef: PropTypes.func,
    dragOver: PropTypes.bool,
    editorBackgroundActive: PropTypes.bool,
    editorBackgroundStyle: PropTypes.shape({}),
    flyoutResizeHandleStyle: PropTypes.shape({}),
    onFlyoutResizeMouseDown: PropTypes.func,
    style: PropTypes.shape({})
};
export default BlocksComponent;
