import bindAll from 'lodash.bindall';
import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React from 'react';
import {intlShape, injectIntl} from 'react-intl';

import {connect} from 'react-redux';
import {openBackdropLibrary} from '../reducers/modals';
import {activateTab, COSTUMES_TAB_INDEX} from '../reducers/editor-tab';
import {showStandardAlert, closeAlertWithId} from '../reducers/alerts';
import {setHoveredSprite} from '../reducers/hovered-target';
import DragConstants from '../lib/drag-constants';
import DropAreaHOC from '../lib/drop-area-hoc.jsx';
import ThrottledPropertyHOC from '../lib/throttled-property-hoc.jsx';
import {emptyCostume} from '../lib/empty-assets';
import sharedMessages from '../lib/shared-messages';
import {fetchCode} from '../lib/backpack-api';
import {getEventXY} from '../lib/touch-utils';

import StageSelectorComponent from '../components/stage-selector/stage-selector.jsx';

import {getBackdropLibrary} from '../lib/libraries/tw-async-libraries';
import {handleFileUpload, costumeUpload} from '../lib/file-uploader.js';
import {placeInViewport} from '../lib/backpack/code-payload.js';

const dragTypes = [
    DragConstants.COSTUME,
    DragConstants.SOUND,
    DragConstants.BACKPACK_COSTUME,
    DragConstants.BACKPACK_SOUND,
    DragConstants.BACKPACK_CODE
];

const DroppableThrottledStage = DropAreaHOC(dragTypes)(
    ThrottledPropertyHOC('url', 500)(StageSelectorComponent)
);

class StageSelector extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClick',
            'handleNewBackdrop',
            'handleSurpriseBackdrop',
            'handleEmptyBackdrop',
            'addBackdropFromLibraryItem',
            'handleFileUploadClick',
            'handleBackdropUpload',
            'handleMouseEnter',
            'handleMouseLeave',
            'handleTouchEnd',
            'handleDrop',
            'setFileInput',
            'setRef'
        ]);
    }
    componentDidMount () {
        document.addEventListener('touchend', this.handleTouchEnd);
    }
    componentWillUnmount () {
        document.removeEventListener('touchend', this.handleTouchEnd);
    }
    handleTouchEnd (e) {
        const {x, y} = getEventXY(e);
        const {top, left, bottom, right} = this.ref.getBoundingClientRect();
        if (x >= left && x <= right && y >= top && y <= bottom) {
            this.handleMouseEnter();
        }
    }
    addBackdropFromLibraryItem (item, shouldActivateTab = true) {
        const vmBackdrop = {
            name: item.name,
            md5: item.md5ext,
            rotationCenterX: item.rotationCenterX,
            rotationCenterY: item.rotationCenterY,
            bitmapResolution: item.bitmapResolution,
            skinId: null
        };
        this.handleNewBackdrop(vmBackdrop, shouldActivateTab);
    }
    handleClick () {
        this.props.onSelect(this.props.id);
    }
    handleNewBackdrop (backdrops_, shouldActivateTab = true) {
        const backdrops = Array.isArray(backdrops_) ? backdrops_ : [backdrops_];
        return Promise.all(backdrops.map(backdrop =>
            this.props.vm.addBackdrop(backdrop.md5, backdrop)
        )).then(() => {
            if (shouldActivateTab) {
                return this.props.onActivateTab(COSTUMES_TAB_INDEX);
            }
        });
    }
    async handleSurpriseBackdrop (e) {
        e.stopPropagation(); // Prevent click from falling through to selecting stage.
        const backdropLibraryContent = await getBackdropLibrary();
        // @todo should this not add a backdrop you already have?
        const item = backdropLibraryContent[Math.floor(Math.random() * backdropLibraryContent.length)];
        this.addBackdropFromLibraryItem(item, false);
    }
    async handleEmptyBackdrop (e) {
        e.stopPropagation(); // Prevent click from falling through to stage selector, select it manually below
        this.props.vm.setEditingTarget(this.props.id);
                console.log("add back");
        function base64ToUint8Array(base64String) {
        　　　　const padding = '='.repeat((4 - base64String.length % 4) % 4);
               const base64 = (base64String + padding)
                            .replace(/\-/g, '+')
                            .replace(/_/g, '/');
        
               const rawData = window.atob(base64);
               const outputArray = new Uint8Array(rawData.length);
        
               for (let i = 0; i < rawData.length; ++i) {
                    outputArray[i] = rawData.charCodeAt(i);
               }
               return outputArray;
        }

const vm=this.props.vm;
const runtime=vm.runtime;

const targetId = vm.runtime.getEditingTarget().id;
      const assetName = this.props.intl.formatMessage(sharedMessages.backdrop, {index: 1});

      //const res =base64ToUint8Array('PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSIwIiBoZWlnaHQ9IjAiIHZpZXdCb3g9IjAgMCAwIDAiPgogIDwhLS0gRXhwb3J0ZWQgYnkgU2NyYXRjaCAtIGh0dHA6Ly9zY3JhdGNoLm1pdC5lZHUvIC0tPgo8L3N2Zz4=');
      //const blob = await res.blob();

      /*if (!(this._typeIsBitmap(blob.type) || blob.type === "image/svg+xml")) {
        console.error(`Invalid MIME type: ${blob.type}`);
        return;
      }*/
      const assetType =runtime.storage.AssetType.ImageVector;

      // Bitmap data format is not actually enforced, but setting it to something that isn't in scratch-parser's
      // known format list will throw an error when someone tries to load the project.
      // (https://github.com/scratchfoundation/scratch-parser/blob/665f05d739a202d565a4af70a201909393d456b2/lib/sb3_definitions.json#L51)
      const dataType =runtime.storage.DataFormat.SVG

      /*const arrayBuffer = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () =>
          reject(new Error(`Failed to read as array buffer: ${fr.error}`));
        fr.readAsArrayBuffer(blob);
      });*/

      const asset = runtime.storage.createAsset(
        assetType,
        dataType,
        base64ToUint8Array('PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSIwIiBoZWlnaHQ9IjAiIHZpZXdCb3g9IjAgMCAwIDAiPgogIDwhLS0gRXhwb3J0ZWQgYnkgU2NyYXRjaCAtIGh0dHA6Ly9zY3JhdGNoLm1pdC5lZHUvIC0tPgo8L3N2Zz4='),
        null,
        true
      );
      const md5ext = `${asset.assetId}.${asset.dataFormat}`;

      try {
        
        await vm.addBackdrop(
          md5ext,
          {
            asset,
            md5ext,
            name: assetName,
          },
          targetId
        );
      } catch (e) {
        console.error(e);
      }

        //this.handleNewBackdrop(emptyCostume(this.props.intl.formatMessage(sharedMessages.backdrop, {index: 1})));
    }
    handleBackdropUpload (e) {
        const vm = this.props.vm;
        this.props.onShowImporting();
        handleFileUpload(e.target, (buffer, fileType, fileName, fileIndex, fileCount) => {
            costumeUpload(buffer, fileType, vm, vmCostumes => {
                this.props.vm.setEditingTarget(this.props.id);
                vmCostumes.forEach((costume, i) => {
                    costume.name = `${fileName}${i ? i + 1 : ''}`;
                });
                this.handleNewBackdrop(vmCostumes).then(() => {
                    if (fileIndex === fileCount - 1) {
                        this.props.onCloseImporting();
                    }
                });
            }, this.props.onCloseImporting);
        }, this.props.onCloseImporting);
    }
    handleFileUploadClick (e) {
        e.stopPropagation(); // Prevent click from selecting the stage, that is handled manually in backdrop upload
        this.fileInput.click();
    }
    handleMouseEnter () {
        this.props.dispatchSetHoveredSprite(this.props.id);
    }
    handleMouseLeave () {
        this.props.dispatchSetHoveredSprite(null);
    }
    handleDrop (dragInfo) {
        if (dragInfo.dragType === DragConstants.COSTUME) {
            this.props.vm.shareCostumeToTarget(dragInfo.index, this.props.id);
        } else if (dragInfo.dragType === DragConstants.SOUND) {
            this.props.vm.shareSoundToTarget(dragInfo.index, this.props.id);
        } else if (dragInfo.dragType === DragConstants.BACKPACK_COSTUME) {
            this.props.vm.addCostume(dragInfo.payload.body, {
                name: dragInfo.payload.name
            }, this.props.id);
        } else if (dragInfo.dragType === DragConstants.BACKPACK_SOUND) {
            this.props.vm.addSound({
                md5: dragInfo.payload.body,
                name: dragInfo.payload.name
            }, this.props.id);
        } else if (dragInfo.dragType === DragConstants.BACKPACK_CODE) {
            fetchCode(dragInfo.payload.bodyUrl)
                .then(payload => {
                    const centered = placeInViewport(
                        payload,
                        this.props.workspaceMetrics.targets[this.props.id],
                        this.props.isRtl
                    );
                    this.props.vm.shareBlocksToTarget(centered, this.props.id);
                    this.props.vm.refreshWorkspace();
                });
        }
    }
    setFileInput (input) {
        this.fileInput = input;
    }
    setRef (ref) {
        this.ref = ref;
    }
    render () {
        const componentProps = omit(this.props, [
            'asset', 'dispatchSetHoveredSprite', 'id', 'intl',
            'onActivateTab', 'onSelect', 'onShowImporting', 'onCloseImporting',
            'isRtl', 'workspaceMetrics'
        ]);
        return (
            <DroppableThrottledStage
                componentRef={this.setRef}
                fileInputRef={this.setFileInput}
                onBackdropFileUpload={this.handleBackdropUpload}
                onBackdropFileUploadClick={this.handleFileUploadClick}
                onClick={this.handleClick}
                onDrop={this.handleDrop}
                onEmptyBackdropClick={this.handleEmptyBackdrop}
                onMouseEnter={this.handleMouseEnter}
                onMouseLeave={this.handleMouseLeave}
                onSurpriseBackdropClick={this.handleSurpriseBackdrop}
                {...componentProps}
            />
        );
    }
}
StageSelector.propTypes = {
    ...StageSelectorComponent.propTypes,
    id: PropTypes.string,
    intl: intlShape.isRequired,
    isRtl: PropTypes.bool,
    onCloseImporting: PropTypes.func,
    onSelect: PropTypes.func,
    onShowImporting: PropTypes.func,
    workspaceMetrics: PropTypes.shape({
        targets: PropTypes.object
    })
};

const mapStateToProps = (state, {asset, id}) => ({
    isRtl: state.locales.isRtl,
    url: asset && asset.encodeDataURI(),
    vm: state.scratchGui.vm,
    receivedBlocks: state.scratchGui.hoveredTarget.receivedBlocks &&
            state.scratchGui.hoveredTarget.sprite === id,
    raised: state.scratchGui.blockDrag,
    workspaceMetrics: state.scratchGui.workspaceMetrics
});

const mapDispatchToProps = dispatch => ({
    onNewBackdropClick: e => {
        e.stopPropagation();
        dispatch(openBackdropLibrary());
    },
    onActivateTab: tabIndex => {
        dispatch(activateTab(tabIndex));
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
)(StageSelector));
