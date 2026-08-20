import classNames from 'classnames';
import React from 'react';
import Box from '../../box/box.jsx';
import DraggableWindow from '../../draggable-window/draggable-window.jsx';
import MinimizedBar from '../../draggable-window/minimized-bar.jsx';
import StageWrapper from '../../../containers/stage-wrapper.jsx';
import TargetPane from '../../../containers/target-pane.jsx';
import { isRendererSupported } from '../../../lib/tw-environment-support-prober';
import styles from '../gui.css';

const UNBOUNDED_WINDOW_MIN_SIZE = { width: 0, height: 0 };
const UNBOUNDED_WINDOW_MAX_SIZE = { width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER };
const TARGET_PANE_WINDOW_Z_INDEX = 470;
const STAGE_WINDOW_Z_INDEX = 475;

const New02ELayout = ({
    renderEditorWindows,
    stageSize,
    vm,
    isFullScreen,
    editorDesktopRef,
    hideFloatingWindows,
    minimizedWindows,
    // Stage window
    stageWindowPosition,
    stageWindowSize,
    stageWindowContentSize,
    stageWindowAutoFit,
    stageWindowMinimized,
    handleStageWindowContentResize,
    handleToggleStageWindowAutoFit,
    setStageWindowPosition,
    setStageWindowSize,
    setStageWindowMinimized,
    // Target pane window
    targetPaneWindowPosition,
    targetPaneWindowSize,
    targetPaneWindowMinimized,
    setTargetPaneWindowPosition,
    setTargetPaneWindowSize,
    setTargetPaneWindowMinimized,
    handleEditorTargetSelection,
    editorWindowSessions
}) => (
    <>
        <Box
            className={classNames(styles.editorDesktop, styles['editor-desktop-custom-ui'])}
            componentRef={editorDesktopRef}
        >
            {!hideFloatingWindows && (
                editorWindowSessions.length ? renderEditorWindows(stageSize) : null
            )}
        </Box>
        {!hideFloatingWindows && !stageWindowMinimized && (
            <DraggableWindow
                windowId="stage"
                title="Stage"
                defaultPosition={stageWindowPosition}
                defaultSize={stageWindowSize}
                minSize={UNBOUNDED_WINDOW_MIN_SIZE}
                maxSize={UNBOUNDED_WINDOW_MAX_SIZE}
                allowResize
                allowMaximize={false}
                onContentResize={handleStageWindowContentResize}
                onDragStop={(id, position) => setStageWindowPosition(position)}
                onResizeStop={(id, size) => setStageWindowSize(size)}
                onMinimizeToggle={(id, minimized) => setStageWindowMinimized(minimized)}
                zIndex={isFullScreen ? 500 : STAGE_WINDOW_Z_INDEX}
                enableStatePersistence
            >
                <StageWrapper
                    containerSize={stageWindowContentSize}
                    fitToContainer={stageWindowAutoFit}
                    isFullScreen={isFullScreen}
                    isRendererSupported={isRendererSupported()}
                    onRequestSelectTarget={handleEditorTargetSelection}
                    onToggleAutoFit={handleToggleStageWindowAutoFit}
                    showAutoFitButton
                    stageSize={stageSize}
                    stageWindowAutoFit={stageWindowAutoFit}
                    vm={vm}
                />
            </DraggableWindow>
        )}
        {!hideFloatingWindows && !targetPaneWindowMinimized && (
            <DraggableWindow
                windowId="targets"
                title="Sprites"
                defaultPosition={targetPaneWindowPosition}
                defaultSize={targetPaneWindowSize}
                minSize={UNBOUNDED_WINDOW_MIN_SIZE}
                maxSize={UNBOUNDED_WINDOW_MAX_SIZE}
                onDragStop={(id, position) => setTargetPaneWindowPosition(position)}
                onResizeStop={(id, size) => setTargetPaneWindowSize(size)}
                onMinimizeToggle={(id, minimized) => setTargetPaneWindowMinimized(minimized)}
                zIndex={TARGET_PANE_WINDOW_Z_INDEX}
                enableStatePersistence
            >
                <TargetPane
                    onRequestSelectTarget={handleEditorTargetSelection}
                    stageSize={stageSize}
                    vm={vm}
                />
            </DraggableWindow>
        )}
        {!hideFloatingWindows ? <MinimizedBar windows={minimizedWindows} /> : null}
    </>
);

export default New02ELayout;
