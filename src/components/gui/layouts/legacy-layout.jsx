import React from 'react';
import Box from '../../box/box.jsx';
import StageWrapper from '../../../containers/stage-wrapper.jsx';
import TargetPane from '../../../containers/target-pane.jsx';
import { isRendererSupported } from '../../../lib/tw-environment-support-prober';
import styles from '../gui.css';

const LegacyLayout = ({
    renderEditorWrapper,
    stageSize,
    vm,
    isFullScreen,
    isRtl,
    loading,
    alertsVisible,
    alertsClassName,
    Alerts
}) => (
    <>
        {renderEditorWrapper(stageSize)}
        <Box className={styles.stageAndTargetWrapper}>
            <StageWrapper
                isFullScreen={isFullScreen}
                isRendererSupported={isRendererSupported()}
                isRtl={isRtl}
                loading={loading}
                stageSize={stageSize}
                vm={vm}
            >
                {alertsVisible && Alerts ? (
                    <Alerts className={alertsClassName} />
                ) : null}
            </StageWrapper>
            <Box className={styles.targetWrapper}>
                <TargetPane
                    stageSize={stageSize}
                    vm={vm}
                />
            </Box>
        </Box>
    </>
);

export default LegacyLayout;
