import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';

import Box from '../box/box.jsx';
import Modal from '../../containers/windowed-modal.jsx';

import styles from './git-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Git',
        description: 'Title of the git window',
        id: 'tw.gitModal.title'
    },
    branchesLabel: {
        defaultMessage: 'Branches',
        description: 'Label for branch list',
        id: 'tw.gitModal.branchesLabel'
    },
    mergeLabel: {
        defaultMessage: 'Merge',
        description: 'Merge section label',
        id: 'tw.gitModal.merge'
    },
    show: {
        defaultMessage: 'Show',
        description: 'Show button',
        id: 'tw.gitModal.show'
    },
    hide: {
        defaultMessage: 'Hide',
        description: 'Hide button',
        id: 'tw.gitModal.hide'
    },
    intoLabel: {
        defaultMessage: 'Into',
        description: 'Merge into branch label',
        id: 'tw.gitModal.merge.into'
    },
    fromLabel: {
        defaultMessage: 'From',
        description: 'Merge from branch label',
        id: 'tw.gitModal.merge.from'
    },
    selectBranch: {
        defaultMessage: 'Select branch',
        description: 'Select branch placeholder',
        id: 'tw.gitModal.merge.selectBranch'
    },
    previewMerge: {
        defaultMessage: 'Preview merge',
        description: 'Preview merge button',
        id: 'tw.gitModal.merge.preview'
    },
    conflictsLabel: {
        defaultMessage: 'Conflicts',
        description: 'Conflicts section label',
        id: 'tw.gitModal.merge.conflicts'
    },
    keepOurs: {
        defaultMessage: 'Keep ours',
        description: 'Keep ours version button',
        id: 'tw.gitModal.merge.keepOurs'
    },
    keepTheirs: {
        defaultMessage: 'Keep theirs',
        description: 'Keep theirs version button',
        id: 'tw.gitModal.merge.keepTheirs'
    },
    mergeApply: {
        defaultMessage: 'Merge',
        description: 'Apply merge button',
        id: 'tw.gitModal.merge.apply'
    }
});

const GitModalComponent = props => {
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
    const [deleteConfirmMessage, setDeleteConfirmMessage] = React.useState('');
    const [deleteConfirmAction, setDeleteConfirmAction] = React.useState(null);

    const handleRestoreCommit = props.onRestoreCommit;
    const handleDownloadCommit = props.onDownloadCommit;
    const handleDeleteCurrentBranch = props.onDeleteBranch;

    const handleDeleteRepoClick = () => {
        setDeleteConfirmMessage(
            'Delete this Git repository?\n\nThis removes the repo from this browser session/storage. ' +
            'If you want to keep history, save the project first so git.json is embedded in the SB3.'
        );
        setDeleteConfirmAction(() => props.onDeleteRepo);
        setShowDeleteConfirm(true);
    };

    const handleDeleteBranchClick = e => {
        const ref = e && e.currentTarget ? e.currentTarget.dataset.ref : null;
        if (!ref) return;
        setDeleteConfirmMessage(`Delete branch "${ref}"?\n\nThis action cannot be undone.`);
        setDeleteConfirmAction(() => () => handleDeleteCurrentBranch(ref));
        setShowDeleteConfirm(true);
    };

    const confirmDelete = () => {
        if (deleteConfirmAction) deleteConfirmAction();
        setShowDeleteConfirm(false);
    };

    const cancelDelete = () => setShowDeleteConfirm(false);

    const percent = typeof props.busyProgress === 'number' ? Math.round(props.busyProgress * 100) : null;

    return (
        <Modal
            className={styles.modalContent}
            onRequestClose={props.onClose}
            contentLabel={props.intl.formatMessage(messages.title)}
            id="gitModal"
        >
            <Box className={styles.body}>
                {/* 状态显示部分 */}
                {props.busy ? (
                    <Box className={styles.busy}>
                        <span className={styles.busyText}>{props.busyMessage || 'Working…'}</span>
                        {percent !== null && (
                            <React.Fragment>
                                <span className={styles.busyPercent}>{percent}{'%'}</span>
                                <div className={styles.progressBar}>
                                    <div 
                                        className={styles.progressBarFill} 
                                        style={{width: `${Math.max(0, Math.min(100, percent))}%`}} 
                                    />
                                </div>
                            </React.Fragment>
                        )}
                    </Box>
                ) : null}

                {props.error && <Box className={styles.error}>{props.error}</Box>}

                {props.initialized ? (
                    <React.Fragment>
                        {/* 分支管理 */}
                        <Box className={styles.section}>
                            <Box className={styles.sectionHeader}>
                                <span className={styles.sectionTitle}>
                                    <FormattedMessage defaultMessage="Branch" id="tw.gitModal.branch" />
                                </span>
                                <Box className={styles.headerActions}>
                                    <button className={styles.button} onClick={props.onRefresh} disabled={props.busy}>
                                        <FormattedMessage defaultMessage="Refresh" id="tw.gitModal.refresh" />
                                    </button>
                                    <button className={`${styles.button} ${styles.dangerButton}`} onClick={handleDeleteRepoClick} disabled={props.busy}>
                                        <FormattedMessage defaultMessage="Delete repo" id="tw.gitModal.deleteRepo" />
                                    </button>
                                </Box>
                            </Box>

                            <Box className={`${styles.row} ${styles.rowWrap}`}>
                                <select className={styles.select} value={props.currentBranch || ''} onChange={props.onCheckoutBranch} disabled={props.busy}>
                                    {props.currentBranch ? null : <option value="">(detached)</option>}
                                    {props.branches.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </Box>

                            <Box className={`${styles.row} ${styles.rowWrap}`}>
                                <input className={styles.textInput} value={props.newBranchName} onChange={props.onChangeNewBranchName} placeholder="new-branch" disabled={props.busy} />
                                <button className={styles.button} onClick={props.onCreateBranch} disabled={props.busy || !props.newBranchName.trim()}>
                                    <FormattedMessage defaultMessage="Create branch" id="tw.gitModal.createBranch" />
                                </button>
                                <button className={`${styles.button} ${styles.dangerButton}`} onClick={handleDeleteBranchClick} data-ref={props.currentBranch || ''} disabled={props.busy || !props.currentBranch}>
                                    <FormattedMessage defaultMessage="Delete branch" id="tw.gitModal.deleteBranch" />
                                </button>
                            </Box>
                        </Box>

                        {/* 作者信息 */}
                        <Box className={styles.section}>
                            <Box className={styles.sectionHeader}>
                                <span className={styles.sectionTitle}><FormattedMessage defaultMessage="Author" id="tw.gitModal.author" /></span>
                            </Box>
                            <Box className={`${styles.row} ${styles.rowWrap}`}>
                                <input className={styles.textInput} value={props.authorName} onChange={props.onChangeAuthorName} placeholder="Name" disabled={props.busy} />
                                <input className={styles.textInput} value={props.authorEmail} onChange={props.onChangeAuthorEmail} placeholder="email@example.com" disabled={props.busy} />
                            </Box>
                        </Box>

                        {/* 提交控制 */}
                        <Box className={styles.section}>
                            <Box className={styles.sectionHeader}>
                                <span className={styles.sectionTitle}><FormattedMessage defaultMessage="Commit" id="tw.gitModal.commit" /></span>
                            </Box>
                            <Box className={`${styles.row} ${styles.rowWrap}`}>
                                <input className={styles.textInput} value={props.commitMessage} onChange={props.onChangeCommitMessage} placeholder="Commit message" disabled={props.busy} />
                                <button className={styles.primaryButton} onClick={props.onCommit} disabled={props.busy || !props.commitMessage.trim()}>
                                    <FormattedMessage defaultMessage="Commit" id="tw.gitModal.commitButton" />
                                </button>
                                <button className={styles.button} onClick={props.onUndoCommit} disabled={props.busy || !props.canUndoCommit}>
                                    <FormattedMessage defaultMessage="Undo" id="tw.gitModal.undoCommit" />
                                </button>
                            </Box>
                        </Box>

                        {/* 提交列表 */}
                        <Box className={styles.section}>
                            <Box className={styles.sectionHeader}>
                                <span className={styles.sectionTitle}><FormattedMessage defaultMessage="Recent commits" id="tw.gitModal.recent" /></span>
                            </Box>
                            <Box className={styles.commitList}>
                                {props.commits.length ? props.commits.map(c => (
                                    <Box key={c.oid} className={styles.commitRow}>
                                        <span className={styles.commitOid}>{c.oid.slice(0, 7)}</span>
                                        <span className={styles.commitMsg}>{c.commit.message.split('\n')[0]}</span>
                                        <button className={styles.smallButton} onClick={handleRestoreCommit} data-oid={c.oid} disabled={props.busy}>
                                            <FormattedMessage defaultMessage="Restore" id="tw.gitModal.restoreCommit" />
                                        </button>
                                        <button className={styles.smallButton} onClick={handleDownloadCommit} data-oid={c.oid} disabled={props.busy}>
                                            <FormattedMessage defaultMessage="Download" id="tw.gitModal.downloadCommit" />
                                        </button>
                                    </Box>
                                )) : (
                                    <Box className={styles.muted}><FormattedMessage defaultMessage="No commits yet." id="tw.gitModal.noCommits" /></Box>
                                )}
                            </Box>
                        </Box>
                    </React.Fragment>
                ) : (
                    /* 初始化仓库 */
                    <Box className={styles.section}>
                        <Box className={styles.sectionHeader}>
                            <span className={styles.sectionTitle}><FormattedMessage defaultMessage="Repository" id="tw.gitModal.repo" /></span>
                            <span className={styles.value}><FormattedMessage defaultMessage="Not initialized" id="tw.gitModal.repo.notInitialized" /></span>
                        </Box>
                        <Box className={styles.buttonRow}>
                            <button className={styles.primaryButton} onClick={props.onInit} disabled={props.busy}>
                                <FormattedMessage defaultMessage="Initialize" id="tw.gitModal.init" />
                            </button>
                        </Box>
                    </Box>
                )}
                
                {/* 确认弹窗 */}
                {showDeleteConfirm && (
                    <Box className={styles.confirmDialog}>
                        <Box className={styles.confirmDialogContent}>
                            <Box className={styles.confirmMessage}>
                                {deleteConfirmMessage.split('\n').map((line, i) => (
                                    <React.Fragment key={i}>{line}{i < deleteConfirmMessage.split('\n').length - 1 && <br />}</React.Fragment>
                                ))}
                            </Box>
                            <Box className={styles.confirmButtons}>
                                <button className={styles.button} onClick={cancelDelete} disabled={props.busy}>
                                    <FormattedMessage defaultMessage="Cancel" id="gui.prompt.cancelDelete" />
                                </button>
                                <button className={`${styles.button} ${styles.dangerButton}`} onClick={confirmDelete} disabled={props.busy}>
                                    <FormattedMessage defaultMessage="Delete" id="tw.gitModal.confirmDelete" />
                                </button>
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>
        </Modal>
    );
};

GitModalComponent.propTypes = {
    intl: intlShape,
    busy: PropTypes.bool.isRequired,
    busyMessage: PropTypes.string,
    busyProgress: PropTypes.number,
    error: PropTypes.string,
    initialized: PropTypes.bool.isRequired,
    currentBranch: PropTypes.string,
    branches: PropTypes.arrayOf(PropTypes.string).isRequired,
    commits: PropTypes.arrayOf(PropTypes.shape({
        oid: PropTypes.string.isRequired,
        commit: PropTypes.shape({
            message: PropTypes.string.isRequired
        }).isRequired
    })).isRequired,
    commitMessage: PropTypes.string.isRequired,
    authorName: PropTypes.string.isRequired,
    authorEmail: PropTypes.string.isRequired,
    newBranchName: PropTypes.string.isRequired,
    canUndoCommit: PropTypes.bool.isRequired,
    onChangeCommitMessage: PropTypes.func.isRequired,
    onChangeAuthorName: PropTypes.func.isRequired,
    onChangeAuthorEmail: PropTypes.func.isRequired,
    onChangeNewBranchName: PropTypes.func.isRequired,
    onCheckoutBranch: PropTypes.func.isRequired,
    onCreateBranch: PropTypes.func.isRequired,
    onCommit: PropTypes.func.isRequired,
    onUndoCommit: PropTypes.func.isRequired,
    onInit: PropTypes.func.isRequired,
    onRefresh: PropTypes.func.isRequired,
    onRestoreCommit: PropTypes.func.isRequired,
    onDownloadCommit: PropTypes.func.isRequired,
    onDeleteBranch: PropTypes.func.isRequired,
    onDeleteRepo: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired
};

GitModalComponent.defaultProps = {
    error: null,
    currentBranch: null,
    busyMessage: null,
    busyProgress: null
};

export default injectIntl(GitModalComponent);