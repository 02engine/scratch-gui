import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';

import Box from '../box/box.jsx';
import Modal from '../../containers/windowed-modal.jsx';

// 引入底层逻辑库的配置方法
import {
    setFormatMessage as setGitFormatMessage,
    setIntl as setGitIntl
} from '../../lib/git/browser-git.js';
import {
    setFormatMessage as setWTFormatMessage,
    setIntl as setWTIntl
} from '../../lib/git/project-working-tree.js';

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
    newBranchPlaceholder: {
        defaultMessage: 'new-branch',
        id: 'tw.gitModal.newBranchPlaceholder'
    },
    authorNamePlaceholder: {
        defaultMessage: 'Name',
        id: 'tw.gitModal.authorNamePlaceholder'
    },
    authorEmailPlaceholder: {
        defaultMessage: 'email@example.com',
        id: 'tw.gitModal.authorEmailPlaceholder'
    },
    remoteNamePlaceholder: {
        defaultMessage: 'Remote name (e.g., origin)',
        id: 'tw.gitModal.remoteNamePlaceholder'
    },
    remoteUrlPlaceholder: {
        defaultMessage: 'https://github.com/user/repo.git',
        id: 'tw.gitModal.remoteUrlPlaceholder'
    },
    usernamePlaceholder: {
        defaultMessage: 'Username',
        id: 'tw.gitModal.usernamePlaceholder'
    },
    tokenPlaceholder: {
        defaultMessage: 'Personal Access Token / Password',
        id: 'tw.gitModal.tokenPlaceholder'
    },
    selectRemotePlaceholder: {
        defaultMessage: 'Select remote',
        id: 'tw.gitModal.selectRemotePlaceholder'
    },
    selectBranchPlaceholder: {
        defaultMessage: 'Select branch',
        id: 'tw.gitModal.selectBranchPlaceholder'
    }
});

const GitModalComponent = props => {
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
    const [deleteConfirmMessage, setDeleteConfirmMessage] = React.useState('');
    const [deleteConfirmAction, setDeleteConfirmAction] = React.useState(null);
    const [pendingDeleteBranchRef, setPendingDeleteBranchRef] = React.useState(null);

    // 初始化底层逻辑库的国际化
    React.useEffect(() => {
        if (props.intl) {
            setGitFormatMessage(props.intl.formatMessage);
            setGitIntl(props.intl);
            setWTFormatMessage(props.intl.formatMessage);
            setWTIntl(props.intl);
        }
    }, [props.intl]);

    const handleRestoreCommit = props.onRestoreCommit;
    const handleDownloadCommit = props.onDownloadCommit;
    const handleDeleteCurrentBranch = props.onDeleteBranch;

    const handleDeleteRepoClick = () => {
        setDeleteConfirmMessage(
            props.intl.formatMessage({
                defaultMessage: 'Delete this Git repository?\n\nThis removes the repo from this browser session/storage.',
                id: 'tw.gitModal.deleteRepo.confirmMessage'
            })
        );
        setDeleteConfirmAction(() => props.onDeleteRepo);
        setShowDeleteConfirm(true);
    };

    const handleDeleteBranchClick = e => {
        const ref = e && e.currentTarget ? e.currentTarget.dataset.ref : null;
        if (!ref) return;
        setPendingDeleteBranchRef(ref);
        setDeleteConfirmMessage(
            props.intl.formatMessage({
                defaultMessage: 'Delete branch "{ref}"?\n\nThis action cannot be undone.',
                id: 'tw.gitModal.deleteBranch.confirmMessage'
            }, {ref})
        );
        setDeleteConfirmAction(() => () => handleDeleteCurrentBranch(ref));
        setShowDeleteConfirm(true);
    };

    const confirmDelete = () => {
        if (deleteConfirmAction) deleteConfirmAction();
        setShowDeleteConfirm(false);
        setDeleteConfirmMessage('');
        setDeleteConfirmAction(null);
        setPendingDeleteBranchRef(null);
    };

    const cancelDelete = () => {
        setShowDeleteConfirm(false);
        setDeleteConfirmMessage('');
        setDeleteConfirmAction(null);
        setPendingDeleteBranchRef(null);
    };

    const percent = typeof props.busyProgress === 'number' ? Math.round(props.busyProgress * 100) : null;

    return (
        <Modal
            className={styles.modalContent}
            onRequestClose={props.onClose}
            contentLabel={props.intl.formatMessage(messages.title)}
            id="gitModal"
        >
            <Box className={styles.body}>
                {/* 状态显示 */}
                {props.busy ? (
                    <Box className={styles.busy}>
                        <span className={styles.busyText}>{props.busyMessage || 'Working…'}</span>
                        {percent !== null && (
                            <React.Fragment>
                                <span className={styles.busyPercent}>{percent}%</span>
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
                                    {!props.currentBranch && <option value="">(detached)</option>}
                                    {props.branches.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </Box>

                            <Box className={`${styles.row} ${styles.rowWrap}`}>
                                <input className={styles.textInput} value={props.newBranchName} onChange={props.onChangeNewBranchName} placeholder={props.intl.formatMessage(messages.newBranchPlaceholder)} disabled={props.busy} />
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
                                <input className={styles.textInput} value={props.authorName} onChange={props.onChangeAuthorName} placeholder={props.intl.formatMessage(messages.authorNamePlaceholder)} disabled={props.busy} />
                                <input className={styles.textInput} value={props.authorEmail} onChange={props.onChangeAuthorEmail} placeholder={props.intl.formatMessage(messages.authorEmailPlaceholder)} disabled={props.busy} />
                            </Box>
                        </Box>

                        {/* 提交控制 */}
                        <Box className={styles.section}>
                            <Box className={styles.sectionHeader}>
                                <span className={styles.sectionTitle}><FormattedMessage defaultMessage="Commit" id="tw.gitModal.commit" /></span>
                            </Box>
                            <Box className={`${styles.row} ${styles.rowWrap}`}>
                                <input className={styles.textInput} value={props.commitMessage} onChange={props.onChangeCommitMessage} placeholder={props.intl.formatMessage({defaultMessage: 'Commit message', id: 'tw.gitModal.commitMessagePlaceholder'})} disabled={props.busy} />
                                <button className={styles.primaryButton} onClick={props.onCommit} disabled={props.busy || !props.commitMessage.trim()}>
                                    <FormattedMessage defaultMessage="Commit" id="tw.gitModal.commitButton" />
                                </button>
                                <button className={styles.button} onClick={props.onUndoCommit} disabled={props.busy || !props.canUndoCommit}>
                                    <FormattedMessage defaultMessage="Undo commit" id="tw.gitModal.undoCommit" />
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

                        {/* 远程仓库管理 (新功能融合) */}
                        <Box className={styles.section}>
                            <Box className={styles.sectionHeader}>
                                <span className={styles.sectionTitle}><FormattedMessage defaultMessage="Remotes" id="tw.gitModal.remotes" /></span>
                            </Box>
                            
                            <Box className={`${styles.row} ${styles.rowWrap}`}>
                                <input className={styles.textInput} value={props.remoteName || ''} onChange={props.onChangeRemoteName} placeholder={props.intl.formatMessage(messages.remoteNamePlaceholder)} disabled={props.busy} />
                                <input className={styles.textInput} value={props.remoteUrl || ''} onChange={props.onChangeRemoteUrl} placeholder={props.intl.formatMessage(messages.remoteUrlPlaceholder)} disabled={props.busy} />
                                <button className={styles.button} onClick={props.onAddRemote} disabled={props.busy || !props.remoteName || !props.remoteUrl}>
                                    <FormattedMessage defaultMessage="Add" id="tw.gitModal.addRemote" />
                                </button>
                            </Box>
                            
                            {props.remotes && props.remotes.length > 0 && (
                                <Box className={styles.remoteList}>
                                    {props.remotes.map(remote => (
                                        <Box key={remote.name} className={styles.remoteItem}>
                                            <span className={styles.remoteName}>{remote.name}</span>
                                            <span className={styles.remoteUrl}>{remote.url}</span>
                                            <button className={`${styles.button} ${styles.smallButton} ${styles.dangerButton}`} onClick={() => props.onRemoveRemote(remote.name)} disabled={props.busy}>
                                                <FormattedMessage defaultMessage="Delete" id="tw.gitModal.deleteRemote" />
                                            </button>
                                        </Box>
                                    ))}
                                </Box>
                            )}

                            {/* 推送/拉取部分 (新功能融合) */}
                            <Box className={styles.subSection}>
                                    <Box className={styles.subSectionHeader}>
                                        <span className={styles.subSectionTitle}><FormattedMessage defaultMessage="Pull / Push" id="tw.gitModal.push" /></span>
                                    </Box>
                                    <Box className={styles.authHelp}>
                                        <FormattedMessage defaultMessage="Note: GitHub requires a Personal Access Token." id="tw.gitModal.authHelp" />
                                    </Box>
                                    <Box className={`${styles.row} ${styles.rowWrap}`}>
                                        <input className={styles.textInput} value={props.authUsername || ''} onChange={props.onChangeAuthUsername} placeholder={props.intl.formatMessage(messages.usernamePlaceholder)} disabled={props.busy} />
                                        <input className={styles.textInput} type="password" value={props.authToken || ''} onChange={props.onChangeAuthToken} placeholder={props.intl.formatMessage(messages.tokenPlaceholder)} disabled={props.busy} />
                                    </Box>
                                    <Box className={`${styles.row} ${styles.rowWrap}`}>
                                        <div className={styles.checkboxWrapper}>
                                            <input type="checkbox" checked={props.disableCorsProxy} onChange={props.onChangeDisableCorsProxy} disabled={props.busy} id="disableCorsProxy" className={styles.checkboxInput} />
                                            <label htmlFor="disableCorsProxy" className={styles.checkboxLabel}>
                                                <FormattedMessage defaultMessage="Disable CORS proxy" id="tw.gitModal.disableCorsProxy" />
                                            </label>
                                        </div>
                                    </Box>
                                    <Box className={`${styles.row} ${styles.rowWrap}`}>
                                        <select className={styles.select} value={props.pushRemote || ''} onChange={props.onChangePushRemote} disabled={props.busy}>
                                            <option value="">{props.intl.formatMessage(messages.selectRemotePlaceholder)}</option>
                                            {props.remotes.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                                        </select>
                                        <select className={styles.select} value={props.pushBranch || ''} onChange={props.onChangePushBranch} disabled={props.busy}>
                                            <option value="">{props.intl.formatMessage(messages.selectBranchPlaceholder)}</option>
                                            {props.pushBranch && props.branches.indexOf(props.pushBranch) === -1 ? <option value={props.pushBranch}>{props.pushBranch}</option> : null}
                                            {props.branches.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                        <button className={styles.button} onClick={props.onPull} disabled={props.busy || !(props.pushRemote || props.remoteUrl) || !props.pushBranch}>
                                            <FormattedMessage defaultMessage="Pull" id="tw.gitModal.pullButton" />
                                        </button>
                                        <button className={styles.primaryButton} onClick={props.onPush} disabled={props.busy || !props.pushRemote || !props.pushBranch}>
                                            <FormattedMessage defaultMessage="Push" id="tw.gitModal.pushButton" />
                                        </button>
                                    </Box>
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
                        <Box className={`${styles.row} ${styles.rowWrap}`}>
                            <input className={styles.textInput} value={props.remoteUrl || ''} onChange={props.onChangeRemoteUrl} placeholder={props.intl.formatMessage(messages.remoteUrlPlaceholder)} disabled={props.busy} />
                            <input className={styles.textInput} value={props.pushBranch || ''} onChange={props.onChangePushBranch} placeholder="main" disabled={props.busy} />
                        </Box>
                        <Box className={`${styles.row} ${styles.rowWrap}`}>
                            <input className={styles.textInput} value={props.authUsername || ''} onChange={props.onChangeAuthUsername} placeholder={props.intl.formatMessage(messages.usernamePlaceholder)} disabled={props.busy} />
                            <input className={styles.textInput} type="password" value={props.authToken || ''} onChange={props.onChangeAuthToken} placeholder={props.intl.formatMessage(messages.tokenPlaceholder)} disabled={props.busy} />
                        </Box>
                        <Box className={`${styles.row} ${styles.rowWrap}`}>
                            <div className={styles.checkboxWrapper}>
                                <input type="checkbox" checked={props.disableCorsProxy} onChange={props.onChangeDisableCorsProxy} disabled={props.busy} id="disableCorsProxyInit" className={styles.checkboxInput} />
                                <label htmlFor="disableCorsProxyInit" className={styles.checkboxLabel}>
                                    <FormattedMessage defaultMessage="Disable CORS proxy" id="tw.gitModal.disableCorsProxy" />
                                </label>
                            </div>
                        </Box>
                        <Box className={styles.buttonRow}>
                            <button className={styles.primaryButton} onClick={props.onPull} disabled={props.busy || !props.remoteUrl || !props.pushBranch}>
                                <FormattedMessage defaultMessage="Pull" id="tw.gitModal.pullButton" />
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
                                    <FormattedMessage defaultMessage="Cancel" id="gui.prompt.cancel" />
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
    onClose: PropTypes.func.isRequired,
    // 远程相关 Props
    remotes: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string.isRequired,
        url: PropTypes.string.isRequired
    })).isRequired,
    remoteName: PropTypes.string.isRequired,
    remoteUrl: PropTypes.string.isRequired,
    pushRemote: PropTypes.string.isRequired,
    pushBranch: PropTypes.string.isRequired,
    authUsername: PropTypes.string.isRequired,
    authToken: PropTypes.string.isRequired,
    disableCorsProxy: PropTypes.bool.isRequired,
    onAddRemote: PropTypes.func.isRequired,
    onRemoveRemote: PropTypes.func.isRequired,
    onPull: PropTypes.func.isRequired,
    onPush: PropTypes.func.isRequired,
    onChangeRemoteName: PropTypes.func.isRequired,
    onChangeRemoteUrl: PropTypes.func.isRequired,
    onChangePushRemote: PropTypes.func.isRequired,
    onChangePushBranch: PropTypes.func.isRequired,
    onChangeAuthUsername: PropTypes.func.isRequired,
    onChangeAuthToken: PropTypes.func.isRequired,
    onChangeDisableCorsProxy: PropTypes.func.isRequired
};

GitModalComponent.defaultProps = {
    error: null,
    currentBranch: null,
    busyMessage: null,
    busyProgress: null,
    remotes: [],
    remoteName: '',
    remoteUrl: '',
    pushRemote: '',
    pushBranch: '',
    authUsername: '',
    authToken: '',
    disableCorsProxy: false
};

export default injectIntl(GitModalComponent);
