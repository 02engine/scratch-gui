import PropTypes from 'prop-types';
import React from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';

import styles from './debug-window.css';

const DebugWindowComponent = props => (
    <Modal
        className={styles.modalContent}
        onRequestClose={props.onCancel}
        contentLabel="调试窗口"
        id="debugWindow"
    >
        <Box className={styles.body}>
            <h2 className={styles.title}>IndexedDB 调试工具</h2>
            <p className={styles.helpText}>
                输入要存入 IndexedDB (TW_Backpack / backpack) 的数据 (JSON 格式):
            </p>
            <textarea
                autoFocus
                className={styles.textArea}
                value={props.value}
                onChange={props.onChange}
                rows={12}
                spellCheck="false"
            />
            <div className={styles.errorArea}>
                {props.error ? (
                    <p className={styles.errorText}>{props.error}</p>
                ) : null}
                {props.success ? (
                    <p className={styles.successText}>{props.success}</p>
                ) : null}
            </div>
            <Box className={styles.buttonRow}>
                <button
                    className={styles.cancelButton}
                    onClick={props.onCancel}
                >
                    关闭
                </button>
                <button
                    className={styles.okButton}
                    onClick={props.onOk}
                >
                    执行写入
                </button>
            </Box>
        </Box>
    </Modal>
);

DebugWindowComponent.propTypes = {
    value: PropTypes.string.isRequired,
    error: PropTypes.string,
    success: PropTypes.string,
    onCancel: PropTypes.func.isRequired,
    onChange: PropTypes.func.isRequired,
    onOk: PropTypes.func.isRequired
};

export default DebugWindowComponent;