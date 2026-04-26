import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import {closeSettingsModal} from '../reducers/modals';
import SettingsModalComponent from '../components/tw-settings-modal/settings-modal.jsx';
import {defaultStageSize} from '../reducers/custom-stage-size';
import { setOpsPerFrameState, setCustomUIState, setEditorBackgroundState } from '../reducers/tw';
import windowStateStorage from '../lib/window-state-storage';
import {
    EDITOR_BACKGROUND_IMAGE_STORAGE,
    normalizeEditorBackground
} from '../lib/editor-background';
import {
    clearPersistentEditorBackgroundBlob,
    createPersistentEditorBackgroundURL,
    revokePersistentEditorBackgroundURL,
    savePersistentEditorBackgroundBlob
} from '../lib/editor-background-storage';
 
const messages = defineMessages({
    newFramerate: {
        defaultMessage: 'New framerate:',
        description: 'Prompt shown to choose a new framerate',
        id: 'tw.menuBar.newFramerate'
    },
    newOpsPerFrame: {
        defaultMessage: 'New OpsPerFrame:',
        description: 'Prompt shown to choose a new OpsPerFrame',
        id: 'tw.menuBar.newOpsPerFrame'
    }
});

const MAX_BACKGROUND_IMAGE_DIMENSION = 1920;
const BACKGROUND_IMAGE_QUALITY = 0.86;

const readFileAsDataURL = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

const readFileAsArrayBuffer = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
});

const loadImage = src => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
});

const canvasToBlob = (canvas, type, quality) => new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), type, quality);
});

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

const hasPngSignature = bytes => (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((value, index) => bytes[index] === value)
);

const isAnimatedPng = arrayBuffer => {
    const bytes = new Uint8Array(arrayBuffer);
    if (!hasPngSignature(bytes)) {
        return false;
    }

    const view = new DataView(arrayBuffer);
    let offset = 8;
    while (offset + 8 <= bytes.length) {
        const chunkLength = view.getUint32(offset, false);
        if (offset + 12 + chunkLength > bytes.length) {
            return false;
        }
        const chunkType = String.fromCharCode(
            bytes[offset + 4],
            bytes[offset + 5],
            bytes[offset + 6],
            bytes[offset + 7]
        );
        if (chunkType === 'acTL') {
            return true;
        }
        if (chunkType === 'IEND') {
            return false;
        }
        offset += chunkLength + 12;
    }
    return false;
};

const isAnimatedGif = arrayBuffer => {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 6) {
        return false;
    }
    const header = String.fromCharCode(...bytes.slice(0, 6));
    if (header !== 'GIF87a' && header !== 'GIF89a') {
        return false;
    }
    let frameCount = 0;
    for (let index = 0; index < bytes.length; index++) {
        if (bytes[index] === 0x2C) {
            frameCount++;
            if (frameCount > 1) {
                return true;
            }
        }
    }
    return false;
};

const isAnimatedWebP = arrayBuffer => {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 16) {
        return false;
    }
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff !== 'RIFF' || webp !== 'WEBP') {
        return false;
    }
    for (let index = 12; index + 4 <= bytes.length; index++) {
        const chunkType = String.fromCharCode(
            bytes[index],
            bytes[index + 1],
            bytes[index + 2],
            bytes[index + 3]
        );
        if (chunkType === 'ANIM' || chunkType === 'ANMF') {
            return true;
        }
    }
    return false;
};

const isAnimatedRasterImage = async file => {
    if (!file || !file.type) {
        return false;
    }
    if (file.type === 'image/apng') {
        return true;
    }
    if (!['image/png', 'image/gif', 'image/webp'].includes(file.type)) {
        return false;
    }
    try {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        if (file.type === 'image/png') {
            return isAnimatedPng(arrayBuffer);
        }
        if (file.type === 'image/gif') {
            return isAnimatedGif(arrayBuffer);
        }
        if (file.type === 'image/webp') {
            return isAnimatedWebP(arrayBuffer);
        }
    } catch (e) {
        return false;
    }
    return false;
};

const prepareEditorBackgroundBlob = async file => {
    const dataURL = await readFileAsDataURL(file);
    if (!file.type || file.type === 'image/svg+xml') {
        return file;
    }
    if (await isAnimatedRasterImage(file)) {
        return file;
    }

    try {
        const image = await loadImage(dataURL);
        const largestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
        if (!largestSide) {
            return file;
        }
        const scale = Math.min(1, MAX_BACKGROUND_IMAGE_DIMENSION / largestSide);
        const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
        const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
            return file;
        }
        context.drawImage(image, 0, 0, width, height);
        const blob = await canvasToBlob(canvas, 'image/jpeg', BACKGROUND_IMAGE_QUALITY);
        return blob || file;
    } catch (e) {
        return file;
    }
};

class UsernameModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            extensionDebugConnected: false,
            extensionDebugFailed: false
        };
        bindAll(this, [
            'handleFramerateChange',
            'handleCustomizeFramerate',
            'handleOpsPerFrameChange',
            'handleCustomizeOpsPerFrame',
            'handleHighQualityPenChange',
            'handleInterpolationChange',
            'handleInfiniteClonesChange',
            'handleRemoveFencingChange',
            'handleRemoveLimitsChange',
            'handleOffscreenDrawableCullingChange',
            'handleWarpTimerChange',
            'handleStageWidthChange',
            'handleStageHeightChange',
            'handleDisableCompilerChange',
            'handleCustomUIChange',
            'handleBackgroundImageChange',
            'handleBackgroundBlurChange',
            'handleBackgroundTargetChange',
            'handleClearBackgroundImage',
            'handleStoreProjectOptions',
            'handleResetWindowCoefficients',
            'handleExtensionDebugConnect'
        ]);
    }
    handleFramerateChange (e) {
        this.props.vm.setFramerate(e.target.checked ? 60 : 30);
    }
    handleExtensionDebugConnect () {
        if (typeof window.ScratchExtensionDebug !== 'undefined' && window.ScratchExtensionDebug.connect) {
            window.ScratchExtensionDebug.connect();
        }
    }
    handleOpsPerFrameChange (e) {
        this.props.vm.setOpsPerFrame(e.target.checked ? 2 : 1);
        this.props.setOpsPerFrame(e.target.checked ? 2 : 1);
    }
    async handleCustomizeFramerate () {
        // prompt() returns Promise in desktop app
        // eslint-disable-next-line no-alert
        const newFramerate = await prompt(this.props.intl.formatMessage(messages.newFramerate), this.props.framerate);
        const parsed = parseFloat(newFramerate);
        if (isFinite(parsed)) {
            this.props.vm.setFramerate(parsed);
        }
    }
    async handleCustomizeOpsPerFrame () {
        // prompt() returns Promise in desktop app
        // eslint-disable-next-line no-alert
        const newOpsPerFrame = await prompt(this.props.intl.formatMessage(messages.newOpsPerFrame), this.props.opsPerFrame);
        const parsed = parseFloat(newOpsPerFrame);
        if (isFinite(parsed)) {
            this.props.vm.setOpsPerFrame(parsed);
            this.props.setOpsPerFrame(parsed);
        }
    }
    handleHighQualityPenChange (e) {
        this.props.vm.renderer.setUseHighQualityRender(e.target.checked);
    }
    handleInterpolationChange (e) {
        this.props.vm.setInterpolation(e.target.checked);
    }
    handleInfiniteClonesChange (e) {
        this.props.vm.setRuntimeOptions({
            maxClones: e.target.checked ? Infinity : 300
        });
    }
    handleRemoveFencingChange (e) {
        this.props.vm.setRuntimeOptions({
            fencing: !e.target.checked
        });
    }
    handleRemoveLimitsChange (e) {
        this.props.vm.setRuntimeOptions({
            miscLimits: !e.target.checked
        });
    }
    handleOffscreenDrawableCullingChange (e) {
        this.props.vm.setRuntimeOptions({
            offscreenDrawableCulling: e.target.checked
        });
    }
    handleWarpTimerChange (e) {
        this.props.vm.setCompilerOptions({
            warpTimer: e.target.checked
        });
    }
    handleDisableCompilerChange (e) {
        this.props.vm.setCompilerOptions({
            enabled: !e.target.checked
        });
    }
    handleCustomUIChange (e) {
        // store the preference in redux. UI wiring elsewhere should observe this state.
        if (this.props.setCustomUI) this.props.setCustomUI(e.target.checked);
    }
    async handleBackgroundImageChange (e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file || !file.type || !file.type.startsWith('image/')) {
            return;
        }
        try {
            const previousImage = this.props.editorBackground.image;
            const previousStorage = this.props.editorBackground.imageStorage;
            const blob = await prepareEditorBackgroundBlob(file);
            await savePersistentEditorBackgroundBlob(blob);
            const image = createPersistentEditorBackgroundURL(blob);
            if (previousStorage === EDITOR_BACKGROUND_IMAGE_STORAGE.INDEXED_DB) {
                revokePersistentEditorBackgroundURL(previousImage);
            }
            this.props.setEditorBackground(Object.assign({}, this.props.editorBackground, {
                image,
                imageStorage: EDITOR_BACKGROUND_IMAGE_STORAGE.INDEXED_DB
            }));
        } catch (error) {
            try {
                const fallbackImage = await readFileAsDataURL(file);
                if (this.props.editorBackground.imageStorage === EDITOR_BACKGROUND_IMAGE_STORAGE.INDEXED_DB) {
                    revokePersistentEditorBackgroundURL(this.props.editorBackground.image);
                }
                this.props.setEditorBackground(Object.assign({}, this.props.editorBackground, {
                    image: fallbackImage,
                    imageStorage: EDITOR_BACKGROUND_IMAGE_STORAGE.INLINE
                }));
            } catch (fallbackError) {
                // Ignore invalid image files.
            }
        }
    }
    handleBackgroundBlurChange (valueOrEvent) {
        const value = valueOrEvent && valueOrEvent.target ? valueOrEvent.target.value : valueOrEvent;
        const blur = Math.min(Math.max(parseFloat(value) || 0, 0), 40);
        this.props.setEditorBackground(Object.assign({}, this.props.editorBackground, {
            blur
        }));
    }
    handleBackgroundTargetChange (e) {
        this.props.setEditorBackground(Object.assign({}, this.props.editorBackground, {
            target: e.target.value
        }));
    }
    handleClearBackgroundImage () {
        if (this.props.editorBackground.imageStorage === EDITOR_BACKGROUND_IMAGE_STORAGE.INDEXED_DB) {
            revokePersistentEditorBackgroundURL(this.props.editorBackground.image);
            clearPersistentEditorBackgroundBlob().catch(() => {
                // ignore
            });
        }
        this.props.setEditorBackground(Object.assign({}, this.props.editorBackground, {
            image: null,
            imageStorage: null
        }));
    }
    handleStageWidthChange (value) {
        this.props.vm.setStageSize(value, this.props.customStageSize.height);
    }
    handleStageHeightChange (value) {
        this.props.vm.setStageSize(this.props.customStageSize.width, value);
    }
    handleStoreProjectOptions () {
        this.props.vm.storeProjectOptions();
    }
    handleResetWindowCoefficients () {
        // 清除所有窗口状态
        windowStateStorage.clearAllWindowStates();

        // 刷新页面以应用重置
        window.location.reload();
    }
    componentDidMount () {
        // 监听扩展调试状态变化
        const handleStatusChange = (event) => {
            this.setState({
                extensionDebugConnected: event.detail.connected,
                extensionDebugFailed: event.detail.error !== undefined
            });
        };
        
        window.addEventListener('extensionDebugStatus', handleStatusChange);
        
        // 检查当前状态
        if (typeof window.ScratchExtensionDebug !== 'undefined') {
            this.setState({
                extensionDebugConnected: window.ScratchExtensionDebug.isConnected(),
                extensionDebugFailed: window.ScratchExtensionDebug.isConnectionFailed()
            });
        }
        
        this._handleStatusChange = handleStatusChange;
    }
    componentWillUnmount () {
        if (this._handleStatusChange) {
            window.removeEventListener('extensionDebugStatus', this._handleStatusChange);
        }
    }
    render () {
        const {
            /* eslint-disable no-unused-vars */
            onClose,
            vm,
            /* eslint-enable no-unused-vars */
            ...props
        } = this.props;
        return (
            <SettingsModalComponent
                onClose={this.props.onClose}
                onFramerateChange={this.handleFramerateChange}
                onCustomizeFramerate={this.handleCustomizeFramerate}
                onOpsPerFrameChange={this.handleOpsPerFrameChange}
                onCustomizeOpsPerFrame={this.handleCustomizeOpsPerFrame}
                onCustomUIChange={this.handleCustomUIChange}
                editorBackground={this.props.editorBackground}
                onBackgroundImageChange={this.handleBackgroundImageChange}
                onBackgroundBlurChange={this.handleBackgroundBlurChange}
                onBackgroundTargetChange={this.handleBackgroundTargetChange}
                onClearBackgroundImage={this.handleClearBackgroundImage}
                onHighQualityPenChange={this.handleHighQualityPenChange}
                onInterpolationChange={this.handleInterpolationChange}
                onInfiniteClonesChange={this.handleInfiniteClonesChange}
                onRemoveFencingChange={this.handleRemoveFencingChange}
                onRemoveLimitsChange={this.handleRemoveLimitsChange}
                onOffscreenDrawableCullingChange={this.handleOffscreenDrawableCullingChange}
                onWarpTimerChange={this.handleWarpTimerChange}
                onStageWidthChange={this.handleStageWidthChange}
                onStageHeightChange={this.handleStageHeightChange}
                onDisableCompilerChange={this.handleDisableCompilerChange}
                customUI={this.props.customUI}
                stageWidth={this.props.customStageSize.width}
                stageHeight={this.props.customStageSize.height}
                customStageSizeEnabled={
                    this.props.customStageSize.width !== defaultStageSize.width ||
                    this.props.customStageSize.height !== defaultStageSize.height
                }
                onStoreProjectOptions={this.handleStoreProjectOptions}
                onResetWindowCoefficients={this.handleResetWindowCoefficients}
                extensionDebugConnected={this.state.extensionDebugConnected}
                extensionDebugFailed={this.state.extensionDebugFailed}
                onExtensionDebugConnect={this.handleExtensionDebugConnect}
                {...props}
            />
        );
    }
}

UsernameModal.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func,
    vm: PropTypes.shape({
        renderer: PropTypes.shape({
            setUseHighQualityRender: PropTypes.func
        }),
        setFramerate: PropTypes.func,
        setOpsPerFrame: PropTypes.func,
        setCompilerOptions: PropTypes.func,
        setInterpolation: PropTypes.func,
        setRuntimeOptions: PropTypes.func,
        setStageSize: PropTypes.func,
        storeProjectOptions: PropTypes.func
    }),
    isEmbedded: PropTypes.bool,
    framerate: PropTypes.number,
    opsPerFrame: PropTypes.number,
    highQualityPen: PropTypes.bool,
    interpolation: PropTypes.bool,
    customUI: PropTypes.bool,
    editorBackground: PropTypes.shape({
        image: PropTypes.string,
        blur: PropTypes.number,
        target: PropTypes.string
    }),
    infiniteClones: PropTypes.bool,
    removeFencing: PropTypes.bool,
    removeLimits: PropTypes.bool,
    offscreenDrawableCulling: PropTypes.bool,
    warpTimer: PropTypes.bool,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    disableCompiler: PropTypes.bool,
    setEditorBackground: PropTypes.func
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    isEmbedded: state.scratchGui.mode.isEmbedded,
    framerate: state.scratchGui.tw.framerate,
    opsPerFrame: state.scratchGui.tw.opsPerFrame,
    customUI: !!state.scratchGui.tw.customUI,
    editorBackground: normalizeEditorBackground(state.scratchGui.tw.editorBackground),
    highQualityPen: state.scratchGui.tw.highQualityPen,
    interpolation: state.scratchGui.tw.interpolation,
    infiniteClones: state.scratchGui.tw.runtimeOptions.maxClones === Infinity,
    removeFencing: !state.scratchGui.tw.runtimeOptions.fencing,
    removeLimits: !state.scratchGui.tw.runtimeOptions.miscLimits,
    offscreenDrawableCulling: !!state.scratchGui.tw.runtimeOptions.offscreenDrawableCulling,
    warpTimer: state.scratchGui.tw.compilerOptions.warpTimer,
    customStageSize: state.scratchGui.customStageSize,
    disableCompiler: !state.scratchGui.tw.compilerOptions.enabled
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeSettingsModal()),
    setOpsPerFrame: (value) => dispatch(setOpsPerFrameState(value)),
    setCustomUI: value => dispatch(setCustomUIState(value)),
    setEditorBackground: value => dispatch(setEditorBackgroundState(value))
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(UsernameModal));
