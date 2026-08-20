import React from 'react';
import Box from '../../box/box.jsx';
import StageWrapper from '../../../containers/stage-wrapper.jsx';
import TargetPane from '../../../containers/target-pane.jsx';
import { isRendererSupported } from '../../../lib/tw-environment-support-prober';
import styles from './vscode-layout.css';

import codeIcon from '!../../../lib/tw-recolor/build!../icon--code.svg';
import costumesIcon from '!../../../lib/tw-recolor/build!../icon--costumes.svg';
import soundsIcon from '!../../../lib/tw-recolor/build!../icon--sounds.svg';

const VSCodeLayout = ({
    renderEditorWrapper,
    stageSize,
    vm,
    isFullScreen,
    isRtl,
    loading,
    handleEditorTargetSelection
}) => (
    // TODO
    <Box className={styles.vscodeLayout}>
        {/* <div className={styles.vscodeActivityBar}>
            <div className={styles.vscodeActivityItem}>
                <img draggable={false} src={codeIcon()} />
            </div>
            <div className={styles.vscodeActivityItem}>
                <img draggable={false} src={costumesIcon()} />
            </div>
            <div className={styles.vscodeActivityItem}>
                <img draggable={false} src={soundsIcon()} />
            </div>
        </div>
        <div className={styles.vscodeSidebar}>
            <TargetPane
                onRequestSelectTarget={handleEditorTargetSelection}
                stageSize={stageSize}
                vm={vm}
            />
        </div>
        <Box className={styles.vscodeMain}>
            <Box className={styles.vscodeEditor}>
                {renderEditorWrapper(stageSize)}
            </Box>
            <Box className={styles.vscodeStagePanel}>
                <StageWrapper
                    isFullScreen={isFullScreen}
                    isRendererSupported={isRendererSupported()}
                    isRtl={isRtl}
                    loading={loading}
                    stageSize={stageSize}
                    vm={vm}
                />
            </Box>
        </Box> */}
    </Box>
);

export default VSCodeLayout;
