import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import log from '../lib/log';
import ExtensionImportModalComponent from '../components/tw-extension-import-modal/extension-import-modal.jsx';
import {
    closeExtensionImportMethodModal,
    closeExtensionLibrary,
    setSelectedExtension,
    setSelectedExtensions
} from '../reducers/modals';

class ExtensionImportModal extends React.Component {
    constructor (props) {
        super(props);

        bindAll(this, [
            'getImportQueue',
            'handleBatchComplete',
            'handleClose',
            'handleNormalImport',
            'handleTextImport',
            'importExtensionAsText',
            'performImport',
            'runImportQueue'
        ]);

        this.state = {
            loading: false,
            error: null,
            progressIndex: 0
        };
    }

    getImportQueue () {
        if (this.props.selectedExtensions && this.props.selectedExtensions.length > 0) {
            return this.props.selectedExtensions;
        }
        if (!this.props.extensionId || !this.props.extensionURL) {
            return [];
        }
        return [{
            kind: 'extension-url',
            extensionId: this.props.extensionId,
            extensionURL: this.props.extensionURL,
            displayName: this.props.extensionId
        }];
    }

    async importExtensionAsText (extensionURL) {
        const response = await fetch(extensionURL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const dataURL = `data:application/javascript,${encodeURIComponent(text)}`;
        await this.props.vm.extensionManager.loadExtensionURL(dataURL);
    }

    async performImport (item, importMode) {
        if (item.kind === 'procedure-returns') {
            if (window.__twEnableProcedureReturns) {
                window.__twEnableProcedureReturns();
                return;
            }
            throw new Error('Procedure returns helper is not available.');
        }

        if (item.kind === 'native-extension') {
            await this.props.vm.extensionManager.loadExtensionURL(item.extensionId);
            return;
        }

        if (importMode === 'text') {
            await this.importExtensionAsText(item.extensionURL);
            return;
        }

        await this.props.vm.extensionManager.loadExtensionURL(item.extensionURL);
    }

    handleBatchComplete () {
        this.props.onClearSelectedExtension();
        this.props.onClearSelectedExtensions();
        this.props.onClose();
        this.props.onCloseExtensionLibrary();
    }

    async runImportQueue (importMode) {
        const queue = this.getImportQueue();
        if (!queue.length) {
            this.handleClose();
            return;
        }

        const isBatch = this.props.selectedExtensions && this.props.selectedExtensions.length > 0;

        this.setState({
            loading: true,
            error: null,
            progressIndex: 0
        });

        let successCount = 0;
        let failedCount = 0;
        let firstError = null;

        for (let index = 0; index < queue.length; index++) {
            const item = queue[index];
            this.setState({
                progressIndex: index + 1
            });
            try {
                await this.performImport(item, importMode);
                successCount++;
            } catch (err) {
                log.error(err);
                failedCount++;
                if (!firstError) {
                    firstError = err;
                }
                if (!isBatch) {
                    this.setState({
                        error: err.message,
                        loading: false
                    });
                    return;
                }
            }
        }

        this.setState({
            loading: false
        });

        if (isBatch) {
            // eslint-disable-next-line no-alert
            alert(`成功导入 ${successCount} 个扩展，失败导入 ${failedCount} 个扩展`);
            this.handleBatchComplete();
            return;
        }

        if (firstError) {
            this.setState({
                error: firstError.message
            });
            return;
        }

        this.props.onClearSelectedExtension();
        this.props.onClearSelectedExtensions();
        this.handleClose();
    }

    async handleNormalImport () {
        await this.runImportQueue('normal');
    }

    async handleTextImport () {
        await this.runImportQueue('text');
    }

    handleClose () {
        this.props.onClose();
    }

    render () {
        const queue = this.getImportQueue();
        const isBatch = this.props.selectedExtensions && this.props.selectedExtensions.length > 0;
        return (
            <ExtensionImportModalComponent
                batchMode={isBatch}
                error={this.state.error}
                extensionName={this.props.extensionId}
                itemCount={queue.length}
                loading={this.state.loading}
                onClose={this.handleClose}
                onNormalImport={this.handleNormalImport}
                onTextImport={this.handleTextImport}
                progressIndex={this.state.progressIndex}
            />
        );
    }
}

ExtensionImportModal.propTypes = {
    extensionId: PropTypes.string,
    extensionURL: PropTypes.string,
    onClearSelectedExtension: PropTypes.func,
    onClearSelectedExtensions: PropTypes.func,
    onClose: PropTypes.func,
    onCloseExtensionLibrary: PropTypes.func,
    selectedExtensions: PropTypes.arrayOf(PropTypes.shape({
        displayName: PropTypes.string,
        extensionId: PropTypes.string,
        extensionURL: PropTypes.string,
        kind: PropTypes.oneOf(['extension-url', 'native-extension', 'procedure-returns'])
    })),
    vm: PropTypes.object
};

const mapStateToProps = state => ({
    extensionId: state.scratchGui.modals.selectedExtension?.extensionId,
    extensionURL: state.scratchGui.modals.selectedExtension?.extensionURL,
    selectedExtensions: state.scratchGui.modals.selectedExtensions
});

const mapDispatchToProps = dispatch => ({
    onClearSelectedExtension: () => dispatch(setSelectedExtension(null)),
    onClearSelectedExtensions: () => dispatch(setSelectedExtensions([])),
    onClose: () => dispatch(closeExtensionImportMethodModal()),
    onCloseExtensionLibrary: () => dispatch(closeExtensionLibrary())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ExtensionImportModal);
