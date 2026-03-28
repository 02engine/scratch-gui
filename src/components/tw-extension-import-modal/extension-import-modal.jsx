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
    batchDescription: {
        defaultMessage: 'How would you like to import these {count} extensions?',
        description: 'Description for batch extension import method selection',
        id: 'tw.extensionImportModal.batchDescription'
    },
    progress: {
        defaultMessage: 'Importing {current} / {total}',
        description: 'Progress text shown while importing extensions in batch',
        id: 'tw.extensionImportModal.progress'
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
                {props.batchMode ? (
                    <FormattedMessage {...messages.batchDescription} values={{count: props.itemCount}} />
                ) : (
                    <FormattedMessage {...messages.description} />
                )}
            </p>

            {props.loading && props.batchMode && props.itemCount > 1 ? (
                <p className={styles.progressText}>
                    <FormattedMessage
                        {...messages.progress}
                        values={{
                            current: props.progressIndex || 1,
                            total: props.itemCount
                        }}
                    />
                </p>
            ) : null}

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
    batchMode: PropTypes.bool,
    extensionName: PropTypes.string,
    itemCount: PropTypes.number,
    loading: PropTypes.bool,
    error: PropTypes.string,
    onClose: PropTypes.func,
    onNormalImport: PropTypes.func,
    onTextImport: PropTypes.func,
    progressIndex: PropTypes.number,
    intl: intlShape.isRequired
};

export default injectIntl(ExtensionImportModal);
