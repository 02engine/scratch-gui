import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import VM from 'scratch-vm';
import {STAGE_DISPLAY_SCALE_METADATA, STAGE_DISPLAY_SIZES, STAGE_SIZE_MODES} from '../lib/layout-constants';
import {setStageSize} from '../reducers/stage-size';
import {setFullScreen} from '../reducers/mode';
import {openSettingsModal} from '../reducers/modals';

import {connect} from 'react-redux';

import StageHeaderComponent from '../components/stage-header/stage-header.jsx';

// eslint-disable-next-line react/prefer-stateless-function
class StageHeader extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleKeyPress',
            'handleTriggerCoordinate',
            'handleZoomOutCoordinateFontSize',
            'handleZoomInCoordinateFontSize'
        ]);
        this.checkInvalidStageSizeMode();
        this.minCoordinateFontSize = 10;
        this.maxCoordinateFontSize = 18;
        this.coordinateFontSize = 14;

        this.state = {
            isShowCoordinate: false // 是否显示坐标网格
            // stageNativeSizePopoverOpen: false,
        };
    }
    componentDidMount () {
        document.addEventListener('keydown', this.handleKeyPress);
    }
    componentDidUpdate () {
        this.checkInvalidStageSizeMode();
    }
    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyPress);
    }
    handleKeyPress (event) {
        if (event.key === 'Escape' && this.props.isFullScreen) {
            this.props.onSetStageUnFullScreen();
        }
    }

    /**
     * 触发坐标网格的显示 or 隐藏
     */
    handleTriggerCoordinate () {
        const visible = !this.state.isShowCoordinate;

        this.props.vm.runtime.triggerCoordinate(visible);

        this.setState({
            isShowCoordinate: visible
        });
    }

    /**
     * 缩小坐标系的字体
     */
    handleZoomOutCoordinateFontSize () {
        let temp = this.coordinateFontSize - 1;

        temp = temp >= this.minCoordinateFontSize ? temp : this.minCoordinateFontSize;
        console.log('temp :>> ', temp);

        this.coordinateFontSize = temp;
        this.props.vm.runtime.setCoordinateFontSize(temp);
    }

    /**
     * 放大坐标系的字体
     */
    handleZoomInCoordinateFontSize () {
        let temp = this.coordinateFontSize + 1;

        temp = temp <= this.maxCoordinateFontSize ? temp : this.maxCoordinateFontSize;

        this.coordinateFontSize = temp;
        this.props.vm.runtime.setCoordinateFontSize(temp);
    }


    checkInvalidStageSizeMode () {
        // Switch from "large" to "full" when the large option isn't even displayed in the interface
        if (this.props.stageSizeMode === STAGE_SIZE_MODES.large && !this.showFixedLargeSize()) {
            this.props.onSetStageFull();
        }
    }
    showFixedLargeSize () {
        // Fixed width "large" mode should only be available when it would be smaller than the constrained
        // full stage, otherwise there are some sizes where switching to the smaller size would make it
        // larger instead of smaller.
        const constrainedScale = STAGE_DISPLAY_SCALE_METADATA[STAGE_DISPLAY_SIZES.constrained].scale;
        const constrainedWidth = this.props.customStageSize.width * constrainedScale;
        const largeWidth = STAGE_DISPLAY_SCALE_METADATA[STAGE_DISPLAY_SIZES.large].width;
        return constrainedWidth > largeWidth;
    }
    render () {
        const {
            ...props
        } = this.props;
        return (
            <StageHeaderComponent
                {...props}
                isShowCoordinate={this.state.isShowCoordinate}
                onKeyPress={this.handleKeyPress}
                showFixedLargeSize={this.showFixedLargeSize()}
                onTriggerCoordinate={this.handleTriggerCoordinate}
                onZoomOutCoordinateFontSize={this.handleZoomOutCoordinateFontSize}
                onZoomInCoordinateFontSize={this.handleZoomInCoordinateFontSize}
            />
        );
    }
}

StageHeader.propTypes = {
    isFullScreen: PropTypes.bool.isRequired,
    // tw: update when dimensions or isWindowFullScreen changes
    isWindowFullScreen: PropTypes.bool.isRequired,
    customStageSize: PropTypes.shape({
        width: PropTypes.number.isRequired,
        height: PropTypes.number.isRequired
    }).isRequired,
    dimensions: PropTypes.arrayOf(PropTypes.number),
    isPlayerOnly: PropTypes.bool,
    onSetStageUnFullScreen: PropTypes.func.isRequired,
    onSetStageFull: PropTypes.func.isRequired,
    onOpenSettings: PropTypes.func.isRequired,
    // tw: replace showBranding
    isEmbedded: PropTypes.bool.isRequired,
    stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES)).isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    customStageSize: state.scratchGui.customStageSize,
    stageSizeMode: state.scratchGui.stageSize.stageSize,
    // tw: replace showBranding
    isEmbedded: state.scratchGui.mode.isEmbedded,
    isFullScreen: state.scratchGui.mode.isFullScreen,
    // tw: update when dimensions or isWindowFullScreen changes
    isWindowFullScreen: state.scratchGui.tw.isWindowFullScreen,
    dimensions: state.scratchGui.tw.dimensions,
    isPlayerOnly: state.scratchGui.mode.isPlayerOnly
});

const mapDispatchToProps = dispatch => ({
    onSetStageLarge: () => dispatch(setStageSize(STAGE_SIZE_MODES.large)),
    onSetStageSmall: () => dispatch(setStageSize(STAGE_SIZE_MODES.small)),
    onSetStageFull: () => dispatch(setStageSize(STAGE_SIZE_MODES.full)),
    onSetStageFullScreen: () => dispatch(setFullScreen(true)),
    onSetStageUnFullScreen: () => dispatch(setFullScreen(false)),
    onOpenSettings: () => dispatch(openSettingsModal())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(StageHeader);
