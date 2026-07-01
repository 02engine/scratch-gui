import bindAll from 'lodash.bindall';
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {intlShape, injectIntl} from 'react-intl';
import JSZip from '@turbowarp/jszip';

import {
    openSpriteLibrary,
    closeSpriteLibrary,
    openSpriteLayerModal
} from '../reducers/modals';
import {activateTab, COSTUMES_TAB_INDEX, BLOCKS_TAB_INDEX} from '../reducers/editor-tab';
import {setHoveredSprite, setReceivedBlocks} from '../reducers/hovered-target';
import {showStandardAlert, closeAlertWithId} from '../reducers/alerts';
import {setRestore} from '../reducers/restore-deletion';
import DragConstants from '../lib/drag-constants';
import TargetPaneComponent from '../components/target-pane/target-pane.jsx';
import {getSpriteLibrary} from '../lib/libraries/tw-async-libraries';
import {handleFileUpload, spriteUpload} from '../lib/file-uploader.js';
import sharedMessages from '../lib/shared-messages';
import {highlightTarget} from '../reducers/targets';
import {fetchSprite, fetchCode} from '../lib/backpack-api';
import randomizeSpritePosition from '../lib/randomize-sprite-position';
import downloadBlob from '../lib/download-blob';
import log from '../lib/log';
import {placeInViewport} from '../lib/backpack/code-payload.js';
import {getEventXY} from '../lib/touch-utils';

const EMPTY_SPRITE_COSTUME_ASSET_ID = 'cd21514d0531fdffb22204e0ec5ed84a';
const EMPTY_SPRITE_COSTUME_MD5 = `${EMPTY_SPRITE_COSTUME_ASSET_ID}.svg`;
const EMPTY_SPRITE_COSTUME_SVG =
    '<svg version="1.1" width="2" height="2" viewBox="-1 -1 2 2" ' +
    'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n' +
    '  <!-- Exported by Scratch - http://scratch.mit.edu/ -->\n' +
    '</svg>\n';

const createOfflinePaintSprite = (name, costumeName) => {
    const zip = new JSZip();
    zip.file('sprite.json', JSON.stringify({
        isStage: false,
        name,
        variables: {},
        lists: {},
        broadcasts: {},
        blocks: {},
        comments: {},
        currentCostume: 0,
        costumes: [
            {
                assetId: EMPTY_SPRITE_COSTUME_ASSET_ID,
                name: costumeName,
                bitmapResolution: 1,
                md5ext: EMPTY_SPRITE_COSTUME_MD5,
                dataFormat: 'svg',
                rotationCenterX: 0,
                rotationCenterY: 0
            }
        ],
        sounds: [],
        volume: 100,
        visible: true,
        x: 0,
        y: 0,
        size: 100,
        direction: 90,
        draggable: false,
        rotationStyle: 'all around'
    }));
    zip.file(EMPTY_SPRITE_COSTUME_MD5, EMPTY_SPRITE_COSTUME_SVG);
    return zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE'
    });
};

class TargetPane extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleActivateBlocksTab',
            'handleBlockDragEnd',
            'handleBlockDragUpdate',
            'handleChangeSpriteRotationStyle',
            'handleChangeSpriteDirection',
            'handleChangeSpriteName',
            'handleChangeSpriteSize',
            'handleChangeSpriteVisibility',
            'handleChangeSpriteX',
            'handleChangeSpriteY',
            'handleDeleteSprite',
            'handleDrop',
            'handleDuplicateSprite',
            'handleExportSprite',
            'handleNewSprite',
            'handleSelectSprite',
            'handleSurpriseSpriteClick',
            'handlePaintSpriteClick',
            'handleFileUploadClick',
            'handleSpriteUpload',
            'handleGlobalBlockDragMove',
            'setFileInput'
        ]);
        this.blockDragPoint = null;
        this.blockDragTargetId = null;
        this.blockDragListenersAttached = false;
        this.blockDragActive = false;
    }
    componentDidMount () {
        this.props.vm.addListener('BLOCK_DRAG_UPDATE', this.handleBlockDragUpdate);
        this.props.vm.addListener('BLOCK_DRAG_END', this.handleBlockDragEnd);
    }
    componentWillUnmount () {
        this.props.vm.removeListener('BLOCK_DRAG_UPDATE', this.handleBlockDragUpdate);
        this.props.vm.removeListener('BLOCK_DRAG_END', this.handleBlockDragEnd);
        this.detachBlockDragListeners();
    }
    handleChangeSpriteDirection (direction) {
        this.props.vm.postSpriteInfo({direction});
    }
    handleChangeSpriteRotationStyle (rotationStyle) {
        this.props.vm.postSpriteInfo({rotationStyle});
    }
    handleChangeSpriteName (name) {
        this.props.vm.renameSprite(this.props.editingTarget, name);
    }
    handleChangeSpriteSize (size) {
        this.props.vm.postSpriteInfo({size});
    }
    handleChangeSpriteVisibility (visible) {
        this.props.vm.postSpriteInfo({visible});
    }
    handleChangeSpriteX (x) {
        this.props.vm.postSpriteInfo({x});
    }
    handleChangeSpriteY (y) {
        this.props.vm.postSpriteInfo({y});
    }
    handleDeleteSprite (id) {
        const restoreSprite = this.props.vm.deleteSprite(id);
        const restoreFun = () => restoreSprite().then(this.handleActivateBlocksTab);

        this.props.dispatchUpdateRestore({
            restoreFun: restoreFun,
            deletedItem: 'Sprite'
        });

    }
    handleDuplicateSprite (id) {
        this.props.vm.duplicateSprite(id);
    }
    handleExportSprite (id) {
        const spriteName = this.props.vm.runtime.getTargetById(id).getName();
        const saveLink = document.createElement('a');
        document.body.appendChild(saveLink);

        this.props.vm.exportSprite(id).then(content => {
            downloadBlob(`${spriteName}.sprite3`, content);
        });
    }
    handleSelectSprite (id) {
        if (this.props.onRequestSelectTarget) {
            this.props.onRequestSelectTarget(id);
        } else {
            this.props.vm.setEditingTarget(id);
        }
        if (this.props.stage && id !== this.props.stage.id) {
            this.props.onHighlightTarget(id);
        }
    }
    async handleSurpriseSpriteClick () {
        const spriteLibraryContent = await getSpriteLibrary();
        const surpriseSprites = spriteLibraryContent.filter(sprite =>
            (sprite.tags.indexOf('letters') === -1) && (sprite.tags.indexOf('numbers') === -1)
        );
        const item = surpriseSprites[Math.floor(Math.random() * surpriseSprites.length)];
        randomizeSpritePosition(item);
        this.props.vm.addSprite(JSON.stringify(item))
            .then(this.handleActivateBlocksTab);
    }
    handlePaintSpriteClick () {
        const formatMessage = this.props.intl.formatMessage;
        createOfflinePaintSprite(
            formatMessage(sharedMessages.sprite, {index: 1}),
            formatMessage(sharedMessages.costume, {index: 1})
        )
            .then(sprite3Zip => this.props.vm.addSprite(sprite3Zip))
            .then(() => {
                setTimeout(() => { // Wait for targets update to propagate before tab switching
                    this.props.onActivateTab(COSTUMES_TAB_INDEX);
                });
            })
            .catch(err => {
                log.error(err);
            });
    }
    handleActivateBlocksTab () {
        this.props.onActivateTab(BLOCKS_TAB_INDEX);
    }
    handleNewSprite (spriteJSONString) {
        return this.props.vm.addSprite(spriteJSONString)
            .then(this.handleActivateBlocksTab)
            .catch(err => {
                log.error(err);
            });
    }
    handleFileUploadClick () {
        this.fileInput.click();
    }
    handleSpriteUpload (e) {
        const vm = this.props.vm;
        this.props.onShowImporting();
        handleFileUpload(e.target, (buffer, fileType, fileName, fileIndex, fileCount) => {
            spriteUpload(buffer, fileType, fileName, vm, newSprite => {
                this.handleNewSprite(newSprite)
                    .then(() => {
                        if (fileIndex === fileCount - 1) {
                            this.props.onCloseImporting();
                        }
                    })
                    .catch(this.props.onCloseImporting);
            }, this.props.onCloseImporting);
        }, this.props.onCloseImporting);
    }
    setFileInput (input) {
        this.fileInput = input;
    }
    attachBlockDragListeners () {
        if (this.blockDragListenersAttached) {
            return;
        }
        document.addEventListener('mousemove', this.handleGlobalBlockDragMove, true);
        document.addEventListener('touchmove', this.handleGlobalBlockDragMove, true);
        this.blockDragListenersAttached = true;
    }
    detachBlockDragListeners () {
        if (!this.blockDragListenersAttached) {
            return;
        }
        document.removeEventListener('mousemove', this.handleGlobalBlockDragMove, true);
        document.removeEventListener('touchmove', this.handleGlobalBlockDragMove, true);
        this.blockDragListenersAttached = false;
    }
    resetBlockDragState () {
        this.blockDragPoint = null;
        this.blockDragTargetId = null;
        this.blockDragActive = false;
    }
    getBlockDropTargetFromPoint (x, y) {
        if (typeof document.elementsFromPoint !== 'function') {
            return null;
        }
        const elements = document.elementsFromPoint(x, y);
        for (let i = 0; i < elements.length; i++) {
            const target = elements[i].closest && elements[i].closest('[data-block-drop-target-id]');
            if (target) {
                return target.getAttribute('data-block-drop-target-id');
            }
        }
        return null;
    }
    updateBlockDragTargetFromPoint (x, y) {
        this.blockDragPoint = {x, y};
        const targetId = this.getBlockDropTargetFromPoint(x, y);
        if (targetId !== this.blockDragTargetId) {
            this.blockDragTargetId = targetId;
            this.props.dispatchSetHoveredSprite(targetId);
        }
        return targetId;
    }
    handleGlobalBlockDragMove (e) {
        const {x, y} = getEventXY(e);
        this.updateBlockDragTargetFromPoint(x, y);
    }
    handleBlockDragUpdate (areBlocksOverGui) {
        if (areBlocksOverGui) {
            this.blockDragActive = true;
            this.attachBlockDragListeners();
        } else if (!this.blockDragActive) {
            this.detachBlockDragListeners();
            this.props.dispatchSetHoveredSprite(null);
        }
    }
    handleBlockDragEnd (blocks) {
        const targetId = this.blockDragPoint ?
            this.updateBlockDragTargetFromPoint(this.blockDragPoint.x, this.blockDragPoint.y) :
            this.getHoveredTargetId();
        this.detachBlockDragListeners();
        if (targetId && targetId !== this.props.editingTarget) {
            this.shareBlocks(blocks, targetId, this.props.editingTarget);
            this.props.onReceivedBlocks(true);
        }
        this.resetBlockDragState();
    }
    getHoveredTargetId () {
        const targetId = this.props.hoveredTarget.sprite;
        return typeof targetId === 'string' ? targetId : null;
    }
    shareBlocks (payload, targetId, optFromTargetId) {
        // Position the top-level block based on the scroll position.
        const centered = placeInViewport(payload, this.props.workspaceMetrics.targets[targetId], this.props.isRtl);
        return this.props.vm.shareBlocksToTarget(centered, targetId, optFromTargetId);
    }
    handleDrop (dragInfo) {
        const targetId = this.getHoveredTargetId();
        if (dragInfo.dragType === DragConstants.SPRITE) {
            // Add one to both new and target index because we are not counting/moving the stage
            this.props.vm.reorderTarget(dragInfo.index + 1, dragInfo.newIndex + 1);
        } else if (dragInfo.dragType === DragConstants.BACKPACK_SPRITE) {
            // TODO storage does not have a way of loading zips right now, and may never need it.
            // So for now just grab the zip manually.
            fetchSprite(dragInfo.payload.bodyUrl)
                .then(sprite3Zip => this.props.vm.addSprite(sprite3Zip));
        } else if (targetId) {
            // Something is being dragged over one of the sprite tiles or the backdrop.
            // Dropping assets like sounds and costumes duplicate the asset on the
            // hovered target. Shared costumes also become the current costume on that target.
            // However, dropping does not switch the editing target or activate that editor tab.
            // This is based on 2.0 behavior, but seems like it keeps confusing switching to a minimum.
            // it allows the user to share multiple things without switching back and forth.
            if (dragInfo.dragType === DragConstants.COSTUME) {
                this.props.vm.shareCostumeToTarget(dragInfo.index, targetId);
            } else if (targetId && dragInfo.dragType === DragConstants.SOUND) {
                this.props.vm.shareSoundToTarget(dragInfo.index, targetId);
            } else if (dragInfo.dragType === DragConstants.BACKPACK_COSTUME) {
                // In scratch 2, this only creates a new sprite from the costume.
                // We may be able to handle both kinds of drops, depending on where
                // the drop happens. For now, just add the costume.
                this.props.vm.addCostume(dragInfo.payload.body, {
                    name: dragInfo.payload.name
                }, targetId);
            } else if (dragInfo.dragType === DragConstants.BACKPACK_SOUND) {
                this.props.vm.addSound({
                    md5: dragInfo.payload.body,
                    name: dragInfo.payload.name
                }, targetId);
            } else if (dragInfo.dragType === DragConstants.BACKPACK_CODE) {
                fetchCode(dragInfo.payload.bodyUrl)
                    .then(blocks => this.shareBlocks(blocks, targetId))
                    .then(() => this.props.vm.refreshWorkspace());
            }
        }
    }
    render () {
        /* eslint-disable no-unused-vars */
        const {
            dispatchUpdateRestore,
            dispatchSetHoveredSprite,
            isRtl,
            onActivateTab,
            onCloseImporting,
            onHighlightTarget,
            onReceivedBlocks,
            onShowImporting,
            workspaceMetrics,
            ...componentProps
        } = this.props;
        /* eslint-enable no-unused-vars */
        return (
            <TargetPaneComponent
                {...componentProps}
                fileInputRef={this.setFileInput}
                onActivateBlocksTab={this.handleActivateBlocksTab}
                onChangeSpriteDirection={this.handleChangeSpriteDirection}
                onChangeSpriteName={this.handleChangeSpriteName}
                onChangeSpriteRotationStyle={this.handleChangeSpriteRotationStyle}
                onChangeSpriteSize={this.handleChangeSpriteSize}
                onChangeSpriteVisibility={this.handleChangeSpriteVisibility}
                onChangeSpriteX={this.handleChangeSpriteX}
                onChangeSpriteY={this.handleChangeSpriteY}
                onDeleteSprite={this.handleDeleteSprite}
                onDrop={this.handleDrop}
                onDuplicateSprite={this.handleDuplicateSprite}
                onExportSprite={this.handleExportSprite}
                onFileUploadClick={this.handleFileUploadClick}
                onPaintSpriteClick={this.handlePaintSpriteClick}
                onSelectSprite={this.handleSelectSprite}
                onSpriteUpload={this.handleSpriteUpload}
                onSurpriseSpriteClick={this.handleSurpriseSpriteClick}
            />
        );
    }
}

const {
    onSelectSprite, // eslint-disable-line no-unused-vars
    onActivateBlocksTab, // eslint-disable-line no-unused-vars
    ...targetPaneProps
} = TargetPaneComponent.propTypes;

TargetPane.propTypes = {
    intl: intlShape.isRequired,
    onCloseImporting: PropTypes.func,
    onRequestSelectTarget: PropTypes.func,
    onShowImporting: PropTypes.func,
    dispatchSetHoveredSprite: PropTypes.func.isRequired,
    ...targetPaneProps
};

const mapStateToProps = state => ({
    editingTarget: state.scratchGui.targets.editingTarget,
    hoveredTarget: state.scratchGui.hoveredTarget,
    isRtl: state.locales.isRtl,
    spriteLibraryVisible: state.scratchGui.modals.spriteLibrary,
    sprites: state.scratchGui.targets.sprites,
    stage: state.scratchGui.targets.stage,
    raiseSprites: state.scratchGui.blockDrag,
    workspaceMetrics: state.scratchGui.workspaceMetrics
});

const mapDispatchToProps = dispatch => ({
    onNewSpriteClick: e => {
        e.preventDefault();
        dispatch(openSpriteLibrary());
    },
    onManageSpriteLayersClick: e => {
        e.preventDefault();
        dispatch(openSpriteLayerModal());
    },
    onRequestCloseSpriteLibrary: () => {
        dispatch(closeSpriteLibrary());
    },
    onActivateTab: tabIndex => {
        dispatch(activateTab(tabIndex));
    },
    onReceivedBlocks: receivedBlocks => {
        dispatch(setReceivedBlocks(receivedBlocks));
    },
    dispatchUpdateRestore: restoreState => {
        dispatch(setRestore(restoreState));
    },
    onHighlightTarget: id => {
        dispatch(highlightTarget(id));
    },
    dispatchSetHoveredSprite: spriteId => {
        dispatch(setHoveredSprite(spriteId));
    },
    onCloseImporting: () => dispatch(closeAlertWithId('importingAsset')),
    onShowImporting: () => dispatch(showStandardAlert('importingAsset'))
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(TargetPane));
