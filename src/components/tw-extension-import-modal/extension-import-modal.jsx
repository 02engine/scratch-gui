import {defineMessages, FormattedMessage, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import Spinner from '../spinner/spinner.jsx';
import styles from './extension-import-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Choose Import Method',
        description: 'Title of extension import method selection modal',
        id: 'tw.extensionImportModal.title'
    },
    description: {
        defaultMessage: 'How would you like to import this extension?',
        description: 'Description for extension import method selection',
        id: 'tw.extensionImportModal.description'
    },
    normalImport: {
        defaultMessage: 'Normal Import',
        description: 'Button to import extension normally',
        id: 'tw.extensionImportModal.normalImport'
    },
    textImport: {
        defaultMessage: 'Import as Text',
        description: 'Button to import extension as text',
        id: 'tw.extensionImportModal.textImport'
    },
    cancel: {
        defaultMessage: 'Cancel',
        description: 'Button to cancel import',
        id: 'tw.extensionImportModal.cancel'
    }
});

const ExtensionImportModal = props => (
    <Modal
        className={styles.modalContent}
        onRequestClose={props.onClose}
        contentLabel={props.intl.formatMessage(messages.title)}
        id="extensionImportModal"
    >
        <Box className={styles.body}>
            <h3 className={styles.title}>
                <FormattedMessage {...messages.title} />
            </h3>
            <p className={styles.description}>
                <FormattedMessage {...messages.description} />
            </p>

            {props.error && (
                <div className={styles.errorMessage}>
                    {props.error}
                </div>
            )}

            <div className={styles.buttonGroup}>
                <button
                    className={styles.normalButton}
                    onClick={props.onNormalImport}
                    disabled={props.loading}
                >
                    {props.loading ? (
                        <Spinner small />
                    ) : (
                        <FormattedMessage {...messages.normalImport} />
                    )}
                </button>
                <button
                    className={styles.textButton}
                    onClick={props.onTextImport}
                    disabled={props.loading}
                >
                    {props.loading ? (
                        <Spinner small />
                    ) : (
                        <FormattedMessage {...messages.textImport} />
                    )}
                </button>
                <button
                    className={styles.cancelButton}
                    onClick={props.onClose}
                    disabled={props.loading}
                >
                    <FormattedMessage {...messages.cancel} />
                </button>
            </div>
        </Box>
    </Modal>
);

ExtensionImportModal.propTypes = {
    extensionName: PropTypes.string,
    loading: PropTypes.bool,
    error: PropTypes.string,
    onClose: PropTypes.func,
    onNormalImport: PropTypes.func,
    onTextImport: PropTypes.func,
    intl: intlShape.isRequired
};

export default injectIntl(ExtensionImportModal);