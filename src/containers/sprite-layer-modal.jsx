import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import SpriteLayerModalComponent from '../components/sprite-layer-modal/sprite-layer-modal.jsx';
import {closeSpriteLayerModal} from '../reducers/modals';

const getTargetThumbnail = target => {
    const costume = target && target.getCurrentCostume && target.getCurrentCostume();
    if (costume && costume.asset && costume.asset.encodeDataURI) {
        return costume.asset.encodeDataURI();
    }
    return null;
};

const getOriginalSpriteTargets = vm => {
    const targets = vm && vm.runtime && vm.runtime.targets ? vm.runtime.targets : [];
    return targets.filter(target => target && target.isOriginal && !target.isStage && target.drawableID !== null);
};

const moveItem = (items, fromIndex, toIndex) => {
    const next = items.slice();
    const normalizedToIndex = Math.max(0, Math.min(toIndex, next.length - 1));
    const item = next.splice(fromIndex, 1)[0];
    next.splice(normalizedToIndex, 0, item);
    return next;
};

const getLayerInputValues = spriteIds => spriteIds.reduce((layerInputValues, id, index) => {
    layerInputValues[id] = String(index + 1);
    return layerInputValues;
}, {});

class SpriteLayerModal extends React.Component {
    constructor (props) {
        super(props);
        const targets = getOriginalSpriteTargets(props.vm)
            .sort((a, b) => b.getLayerOrder() - a.getLayerOrder());
        const spriteIds = targets.map(target => target.id);
        this.state = {
            draggingIndex: null,
            layerInputValues: getLayerInputValues(spriteIds),
            spriteIds
        };
        this.handleCancel = this.handleCancel.bind(this);
        this.handleChangeLayer = this.handleChangeLayer.bind(this);
        this.handleCommitLayer = this.handleCommitLayer.bind(this);
        this.handleConfirm = this.handleConfirm.bind(this);
        this.handleDragEnd = this.handleDragEnd.bind(this);
        this.handleDragOver = this.handleDragOver.bind(this);
        this.handleDragStart = this.handleDragStart.bind(this);
    }
    getOrderedTargets () {
        const targetsById = new Map(getOriginalSpriteTargets(this.props.vm).map(target => [target.id, target]));
        return this.state.spriteIds
            .map(id => targetsById.get(id))
            .filter(Boolean);
    }
    handleCancel () {
        this.props.onClose();
    }
    handleChangeLayer (index, value) {
        const id = this.state.spriteIds[index];
        this.setState(state => ({
            layerInputValues: Object.assign({}, state.layerInputValues, {
                [id]: value
            })
        }));
    }
    handleCommitLayer (index) {
        const id = this.state.spriteIds[index];
        const parsedLayer = parseInt(this.state.layerInputValues[id], 10);
        if (isNaN(parsedLayer)) {
            this.setState({layerInputValues: getLayerInputValues(this.state.spriteIds)});
            return;
        }
        const targetIndex = Math.max(0, Math.min(parsedLayer - 1, this.state.spriteIds.length - 1));
        if (index === targetIndex) {
            this.setState({layerInputValues: getLayerInputValues(this.state.spriteIds)});
            return;
        }
        this.setState(state => {
            const spriteIds = moveItem(state.spriteIds, index, targetIndex);
            return {
                layerInputValues: getLayerInputValues(spriteIds),
                spriteIds
            };
        });
    }
    handleConfirm () {
        const orderedTargets = this.getOrderedTargets();
        orderedTargets.slice().reverse().forEach(target => target.goToFront());
        this.props.vm.emitTargetsUpdate();
        this.props.onClose();
    }
    handleDragStart (index) {
        this.setState({draggingIndex: index});
    }
    handleDragOver (event, index) {
        event.preventDefault();
        if (this.state.draggingIndex === null || this.state.draggingIndex === index) return;
        this.setState(state => {
            const spriteIds = moveItem(state.spriteIds, state.draggingIndex, index);
            return {
                draggingIndex: index,
                layerInputValues: getLayerInputValues(spriteIds),
                spriteIds
            };
        });
    }
    handleDragEnd () {
        this.setState({draggingIndex: null});
    }
    render () {
        const sprites = this.getOrderedTargets().map(target => ({
            id: target.id,
            layerInputValue: this.state.layerInputValues[target.id] || '',
            name: target.getName(),
            thumbnail: getTargetThumbnail(target)
        }));
        return (
            <SpriteLayerModalComponent
                draggingIndex={this.state.draggingIndex}
                sprites={sprites}
                onCancel={this.handleCancel}
                onCommitLayer={this.handleCommitLayer}
                onChangeLayer={this.handleChangeLayer}
                onConfirm={this.handleConfirm}
                onDragEnd={this.handleDragEnd}
                onDragOver={this.handleDragOver}
                onDragStart={this.handleDragStart}
            />
        );
    }
}

SpriteLayerModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    vm: PropTypes.shape({
        emitTargetsUpdate: PropTypes.func,
        runtime: PropTypes.shape({
            targets: PropTypes.array
        })
    }).isRequired
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeSpriteLayerModal())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(SpriteLayerModal);
