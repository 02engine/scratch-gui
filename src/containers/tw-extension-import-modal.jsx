import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import log from '../lib/log';
import ExtensionImportModalComponent from '../components/tw-extension-import-modal/extension-import-modal.jsx';
import {closeExtensionImportMethodModal} from '../reducers/modals';

class ExtensionImportModal extends React.Component {
    constructor (props) {
        super(props);

        bindAll(this, [
            'handleClose',
            'handleNormalImport',
            'handleTextImport'
        ]);

        this.state = {
            loading: false,
            error: null
        };
    }

    async handleNormalImport () {
        this.setState({ loading: true, error: null });
        try {
            await this.props.vm.extensionManager.loadExtensionURL(this.props.extensionURL);
            this.handleClose();
        } catch (err) {
            log.error(err);
            this.setState({ error: err.message });
        } finally {
            this.setState({ loading: false });
        }
    }

    async handleTextImport () {
        this.setState({ loading: true, error: null });
        try {
            const response = await fetch(this.props.extensionURL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            const dataURL = `data:application/javascript,${encodeURIComponent(text)}`;
            await this.props.vm.extensionManager.loadExtensionURL(dataURL);
            this.handleClose();
        } catch (err) {
            log.error(err);
            this.setState({ error: err.message });
        } finally {
            this.setState({ loading: false });
        }
    }

    handleClose () {
        this.props.onClose();
    }

    render () {
        return (
            <ExtensionImportModalComponent
                extensionName={this.props.extensionId}
                loading={this.state.loading}
                error={this.state.error}
                onClose={this.handleClose}
                onNormalImport={this.handleNormalImport}
                onTextImport={this.handleTextImport}
            />
        );
    }
}

ExtensionImportModal.propTypes = {
    extensionId: PropTypes.string,
    extensionURL: PropTypes.string,
    vm: PropTypes.object,
    onClose: PropTypes.func
};

const mapStateToProps = state => ({
    extensionId: state.scratchGui.modals.selectedExtension?.extensionId,
    extensionURL: state.scratchGui.modals.selectedExtension?.extensionURL
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeExtensionImportMethodModal())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ExtensionImportModal);