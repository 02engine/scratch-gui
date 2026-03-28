import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import VM from 'scratch-vm';

import Box from '../box/box.jsx';
import {STAGE_DISPLAY_SIZES} from '../../lib/layout-constants.js';
import StageHeader from '../../containers/stage-header.jsx';
import Stage from '../../containers/stage.jsx';
import Loader from '../loader/loader.jsx';
import {getStageDimensionsToFitContainer} from '../../lib/screen-utils.js';

import styles from './stage-wrapper.css';

const StageWrapperComponent = function (props) {
    const {
        containerSize,
        customStageSize,
        fitToContainer,
        isEmbedded,
        isFullScreen,
        isRtl,
        isRendererSupported,
        loading,
        onToggleAutoFit,
        showAutoFitButton,
        stageSize,
        stageWindowAutoFit,
        vm
    } = props;

    let stageDimensionsOverride = null;
    let wrapperStyle = null;
    if (fitToContainer && containerSize && containerSize.width > 0 && containerSize.height > 0) {
        const headerHeight = isEmbedded || isFullScreen ? 0 : 44;
        stageDimensionsOverride = getStageDimensionsToFitContainer({
            width: Math.max(0, containerSize.width - 2),
            height: Math.max(0, containerSize.height - headerHeight - 2)
        }, customStageSize);
        wrapperStyle = {
            width: `${stageDimensionsOverride.width + 2}px`,
            minWidth: `${stageDimensionsOverride.width + 2}px`,
            margin: '0 auto'
        };
    }

    return (
        <Box
            className={classNames(
                styles.stageWrapper,
                {
                    [styles.embedded]: isEmbedded,
                    [styles.fullScreen]: isFullScreen,
                    [styles.loading]: loading,
                    [styles.offsetControls]: !(isEmbedded || isFullScreen)
                }
            )}
            dir={isRtl ? 'rtl' : 'ltr'}
            style={wrapperStyle}
        >
            <Box className={styles.stageMenuWrapper}>
                <StageHeader
                    isStageWindowAutoFit={stageWindowAutoFit}
                    onToggleStageWindowAutoFit={onToggleAutoFit}
                    showStageWindowAutoFitButton={showAutoFitButton}
                    stageSize={stageSize}
                    stageDimensionsOverride={stageDimensionsOverride}
                    vm={vm}
                />
            </Box>
            <Box className={styles.stageCanvasWrapper}>
                {
                    isRendererSupported ?
                        <Stage
                            stageDimensionsOverride={stageDimensionsOverride}
                            stageSize={stageSize}
                            vm={vm}
                        /> :
                        null
                }
            </Box>
            {loading ? (
                <Loader isFullScreen={isFullScreen} />
            ) : null}
        </Box>
    );
};

StageWrapperComponent.propTypes = {
    containerSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    fitToContainer: PropTypes.bool,
    isEmbedded: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isRendererSupported: PropTypes.bool.isRequired,
    isRtl: PropTypes.bool.isRequired,
    loading: PropTypes.bool,
    onToggleAutoFit: PropTypes.func,
    showAutoFitButton: PropTypes.bool,
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    stageWindowAutoFit: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default React.memo(StageWrapperComponent);
