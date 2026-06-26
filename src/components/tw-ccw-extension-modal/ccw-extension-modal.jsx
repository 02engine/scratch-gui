import {defineMessages, FormattedMessage, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import Spinner from '../spinner/spinner.jsx';
import styles from './ccw-extension-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: '加载CCW扩展',
        description: 'Title of CCW extension loader modal',
        id: 'tw.ccwExtensionModal.title'
    },
    description: {
        defaultMessage: '从共创世界加载扩展，可从 https://assets.ccw.site/extensions 获取。',
        description: 'Description of CCW extension loader modal',
        id: 'tw.ccwExtensionModal.description'
    },
    prompt: {
        defaultMessage: '输入CCW扩展ID：',
        description: 'Label that appears when loading a CCW extension by ID',
        id: 'tw.ccwExtensionModal.prompt'
    },
    lookup: {
        defaultMessage: '查询',
        description: 'Button to fetch CCW extension metadata',
        id: 'tw.ccwExtensionModal.lookup'
    },
    publisher: {
        defaultMessage: '发布者：{publisher}',
        description: 'Publisher label in CCW extension loader',
        id: 'tw.ccwExtensionModal.publisher'
    },
    version: {
        defaultMessage: '版本：',
        description: 'Version selector label in CCW extension loader',
        id: 'tw.ccwExtensionModal.version'
    },
    latest: {
        defaultMessage: '最新',
        description: 'Latest version marker in CCW extension loader',
        id: 'tw.ccwExtensionModal.latest'
    },
    asset: {
        defaultMessage: '资源：{asset}',
        description: 'Asset URL label in CCW extension loader',
        id: 'tw.ccwExtensionModal.asset'
    },
    cancel: {
        defaultMessage: '取消',
        description: 'Button that cancels loading a CCW extension',
        id: 'tw.ccwExtensionModal.cancel'
    },
    confirm: {
        defaultMessage: '确认',
        description: 'Button that confirms loading a CCW extension',
        id: 'tw.ccwExtensionModal.confirm'
    }
});

const CCWExtensionModal = props => {
    const versions = Array.isArray(props.metadata?.versions) ? props.metadata.versions : [];
    const selectedVersion = versions[props.selectedVersionIndex] || versions[0];
    const publisher = props.metadata?.publisher?.nickname || props.metadata?.publisherId || 'Unknown';
    return (
        <Modal
            className={styles.modalContent}
            onRequestClose={props.onClose}
            contentLabel={props.intl.formatMessage(messages.title)}
            id="ccwExtensionModal"
        >
            <Box className={styles.body}>
                <h3 className={styles.title}>
                    <FormattedMessage {...messages.title} />
                </h3>
                <p><FormattedMessage {...messages.description} /></p>
                <p><FormattedMessage {...messages.prompt} /></p>
                <div className={styles.inputRow}>
                    <input
                        type="text"
                        className={styles.urlInput}
                        value={props.extensionId}
                        onChange={props.onChangeExtensionId}
                        onKeyDown={props.onKeyDown}
                        placeholder="输入扩展ID"
                        disabled={props.loading}
                        autoFocus
                    />
                    <button
                        className={styles.lookupButton}
                        onClick={props.onLookup}
                        disabled={props.loading || !props.extensionId.trim()}
                    >
                        {props.loading ? <Spinner small /> : <FormattedMessage {...messages.lookup} />}
                    </button>
                </div>
                {props.error ? <div className={styles.errorMessage}>{props.error}</div> : null}
                {props.metadata ? (
                    <div className={styles.extensionInfo}>
                        <div className={styles.infoHeader}>
                            {props.metadata.cover ? (
                                <img className={styles.cover} src={props.metadata.cover} draggable={false} />
                            ) : null}
                            <div>
                                <div className={styles.name}>{props.metadata.name || props.metadata.eid}</div>
                                <div className={styles.meta}>
                                    <FormattedMessage {...messages.publisher} values={{publisher}} />
                                </div>
                            </div>
                        </div>
                        {props.metadata.description ? <p>{props.metadata.description}</p> : null}
                        <p><FormattedMessage {...messages.version} /></p>
                        <select
                            className={styles.versionSelect}
                            value={props.selectedVersionIndex}
                            onChange={props.onChangeVersion}
                        >
                            {versions.map((version, index) => (
                                <option key={version.id || version.version || index} value={index}>
                                    {version.version || `#${index + 1}`}{index === 0 ? ` (${props.intl.formatMessage(messages.latest)})` : ''}
                                </option>
                            ))}
                        </select>
                        {selectedVersion?.assetUri ? (
                            <div className={styles.assetUri}>
                                <FormattedMessage {...messages.asset} values={{asset: selectedVersion.assetUri}} />
                            </div>
                        ) : null}
                    </div>
                ) : null}
                <div className={styles.buttonRow}>
                    <button className={styles.cancelButton} onClick={props.onClose} disabled={props.loading}>
                        <FormattedMessage {...messages.cancel} />
                    </button>
                    <button
                        className={styles.loadButton}
                        onClick={props.onConfirm}
                        disabled={props.loading || !selectedVersion?.assetUri}
                    >
                        <FormattedMessage {...messages.confirm} />
                    </button>
                </div>
            </Box>
        </Modal>
    );
};

CCWExtensionModal.propTypes = {
    error: PropTypes.string,
    extensionId: PropTypes.string.isRequired,
    intl: intlShape,
    loading: PropTypes.bool.isRequired,
    metadata: PropTypes.object,
    onChangeExtensionId: PropTypes.func.isRequired,
    onChangeVersion: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    onKeyDown: PropTypes.func.isRequired,
    onLookup: PropTypes.func.isRequired,
    selectedVersionIndex: PropTypes.number.isRequired
};

export default injectIntl(CCWExtensionModal);
