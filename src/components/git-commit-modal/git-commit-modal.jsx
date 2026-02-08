import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import Modal from '../modal/modal.jsx';
import Input from '../forms/input.jsx';
import Label from '../forms/label.jsx';
import styles from './git-commit-modal.css';
import githubApi from '../../lib/github-api.js';

const messages = defineMessages({
    title: {
        id: 'gui.gitCommit.title',
        defaultMessage: 'Git Commit',
        description: 'Title of the Git commit modal'
    },
    repositoryLabel: {
        id: 'gui.gitCommit.repositoryLabel',
        defaultMessage: 'Repository',
        description: 'Label for the repository input'
    },
    repositoryPlaceholder: {
        id: 'gui.gitCommit.repositoryPlaceholder',
        defaultMessage: 'owner/repository',
        description: 'Placeholder for the repository input'
    },
    summaryLabel: {
        id: 'gui.gitCommit.summaryLabel',
        defaultMessage: 'Commit Summary',
        description: 'Label for the commit summary input'
    },
    summaryPlaceholder: {
        id: 'gui.gitCommit.summaryPlaceholder',
        defaultMessage: 'Brief summary of changes',
        description: 'Placeholder for the commit summary input'
    },
    descriptionLabel: {
        id: 'gui.gitCommit.descriptionLabel',
        defaultMessage: 'Commit Description',
        description: 'Label for the commit description textarea'
    },
    descriptionPlaceholder: {
        id: 'gui.gitCommit.descriptionPlaceholder',
        defaultMessage: 'Detailed description of changes (optional)',
        description: 'Placeholder for the commit description textarea'
    },
    readmeLabel: {
        id: 'gui.gitCommit.readmeLabel',
        defaultMessage: 'README.md (Optional)',
        description: 'Label for the README file input'
    },
    commitButton: {
        id: 'gui.gitCommit.commitButton',
        defaultMessage: 'Commit to GitHub',
        description: 'Button to commit to GitHub'
    },
    cancelButton: {
        id: 'gui.gitCommit.cancelButton',
        defaultMessage: 'Cancel',
        description: 'Button to cancel the commit'
    },
    saveToken: {
        id: 'gui.gitCommit.saveToken',
        defaultMessage: 'Save token for future use',
        description: 'Checkbox to save the GitHub token'
    },
    fetchButton: {
        id: 'gui.gitCommit.fetchButton',
        defaultMessage: 'Fetch from GitHub',
        description: 'Button to fetch from GitHub'
    },
    loading: {
        id: 'gui.gitCommit.loading',
        defaultMessage: 'Processing...',
        description: 'Loading message during operation'
    },
    fetching: {
        id: 'gui.gitCommit.fetching',
        defaultMessage: 'Fetching...',
        description: 'Loading message during fetch'
    },
    logoutSuccess: {
        id: 'gui.gitCommit.logoutSuccess',
        defaultMessage: 'Logged out successfully',
        description: 'Message when logout is successful'
    },
    selectValidMdFile: {
        id: 'gui.gitCommit.selectValidMdFile',
        defaultMessage: 'Please select a valid .md file',
        description: 'Error when file selection is invalid'
    },
    dropValidMdFile: {
        id: 'gui.gitCommit.dropValidMdFile',
        defaultMessage: 'Please drop a valid .md or .markdown file',
        description: 'Error when dropped file is invalid'
    },
    enterRepository: {
        id: 'gui.gitCommit.enterRepository',
        defaultMessage: 'Please enter a repository',
        description: 'Error when repository is empty'
    },
    repositoryFormat: {
        id: 'gui.gitCommit.repositoryFormat',
        defaultMessage: 'Repository must be in format: owner/repository',
        description: 'Error when repository format is invalid'
    },
    noToken: {
        id: 'gui.gitCommit.noToken',
        defaultMessage: 'No authentication token available. Please authenticate first.',
        description: 'Error when token is not available'
    },
    commitSuccess: {
        id: 'gui.gitCommit.commitSuccess',
        defaultMessage: 'Successfully committed to {repository} ({branch})',
        description: 'Success message after commit'
    },
    commitFailed: {
        id: 'gui.gitCommit.commitFailed',
        defaultMessage: 'Failed to commit to GitHub',
        description: 'Error message when commit fails'
    },
    unexpectedError: {
        id: 'gui.gitCommit.unexpectedError',
        defaultMessage: 'An unexpected error occurred',
        description: 'Generic error message'
    },
    fetchSuccess: {
        id: 'gui.gitCommit.fetchSuccess',
        defaultMessage: 'Successfully fetched project from {repository} ({branch})',
        description: 'Success message after fetch'
    },
    fetchFailed: {
        id: 'gui.gitCommit.fetchFailed',
        defaultMessage: 'Failed to fetch from GitHub',
        description: 'Error message when fetch fails'
    },
    fetchError: {
        id: 'gui.gitCommit.fetchError',
        defaultMessage: 'An unexpected error occurred while fetching',
        description: 'Error message during fetch'
    }
});

const GitCommitModal = props => {
    const {
        intl,
        isOpen,
        onCancel,
        onCommit,
        onFetch,
        onLogin,
        projectData,
        repository: initialRepository = ''
    } = props;

    const [formData, setFormData] = React.useState({
        repository: initialRepository || '',
        summary: '',
        description: '',
        readmeFile: null
    });
    const [loadingStates, setLoadingStates] = React.useState({
        isLoading: false,
        isFetching: false
    });
    const [isDragOver, setIsDragOver] = React.useState(false);
    const [notification, setNotification] = React.useState({
        show: false,
        message: '',
        type: 'info' // 'success', 'error', 'warning', 'info'
    });

    const updateFormData = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleRepositoryChange = e => updateFormData('repository', e.target.value);
    const handleSummaryChange = e => updateFormData('summary', e.target.value);
    const handleDescriptionChange = e => updateFormData('description', e.target.value);

    const handleReadmeChange = e => {
        const file = e.target.files[0];
        if (file && file.name.toLowerCase().endsWith('.md')) {
            updateFormData('readmeFile', file);
        } else if (file) {
            showNotification(intl.formatMessage(messages.selectValidMdFile), 'error');
            e.target.value = '';
        }
    };

    const handleDragOver = e => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragOver) {
            setIsDragOver(true);
        }
    };

    const handleDragLeave = e => {
        e.preventDefault();
        e.stopPropagation();
        // 只有当鼠标真正离开拖拽区域时才重置状态
        if (e.currentTarget.contains(e.relatedTarget)) {
            return;
        }
        setIsDragOver(false);
    };

    const handleDrop = e => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.markdown')) {
                updateFormData('readmeFile', file);
            } else {
                showNotification(intl.formatMessage(messages.dropValidMdFile), 'error');
            }
        }
    };

    const handleFileInputClick = () => {
        // 触发隐藏的文件输入
        const fileInput = document.getElementById('readme-file-input');
        if (fileInput) {
            fileInput.click();
        }
    };

    const validateInputs = () => {
        if (!formData.repository.trim()) {
            showNotification(intl.formatMessage(messages.enterRepository), 'error');
            return false;
        }

        // 验证仓库格式
        const repoPattern = /^[^/]+\/[^/]+$/;
        if (!repoPattern.test(formData.repository.trim())) {
            showNotification(intl.formatMessage(messages.repositoryFormat), 'error');
            return false;
        }

        return true;
    };

    const handleSubmit = async () => {
        if (!validateInputs()) return;

        setLoadingStates(prev => ({ ...prev, isLoading: true }));

        try {
            // 获取有效的token（OAuth优先）
            const token = githubApi.getEffectiveToken();
            if (!token) {
                showNotification(intl.formatMessage(messages.noToken), 'error');
                setLoadingStates(prev => ({ ...prev, isLoading: false }));
                return;
            }

            // 创建 SB3 文件对象
            let sb3File;
            if (projectData instanceof Blob) {
                sb3File = new File([projectData], 'project.sb3', {type: 'application/zip'});
            } else {
                const sb3Blob = new Blob([projectData], {type: 'application/zip'});
                sb3File = new File([sb3Blob], 'project.sb3', {type: 'application/zip'});
            }

            // 提交到 GitHub
            const commitSummary = formData.summary.trim() || `Upload project from 02engine - ${new Date().toISOString()}`;
            const commitDescription = formData.description.trim();

            const result = await githubApi.commitProject({
                token: token,
                repository: formData.repository.trim(),
                sb3File,
                readmeFile: formData.readmeFile,
                commitMessage: commitSummary,
                summary: commitSummary,
                description: commitDescription
            });

            if (result.success) {
                setLoadingStates(prev => ({ ...prev, isLoading: false }));
                setFormData(prev => ({
                    ...prev,
                    repository: '',
                    summary: '',
                    description: '',
                    readmeFile: null
                }));
                showNotification(intl.formatMessage(messages.commitSuccess, {
                    repository: result.repository,
                    branch: result.branch
                }), 'success');
                onCommit && onCommit(result);
            } else {
                setLoadingStates(prev => ({ ...prev, isLoading: false }));
                showNotification(intl.formatMessage(messages.commitFailed), 'error');
            }

        } catch (err) {
            console.error('Commit error:', err);
            setLoadingStates(prev => ({ ...prev, isLoading: false }));
            showNotification(intl.formatMessage(messages.unexpectedError), 'error');
        } finally {
            setLoadingStates(prev => ({ ...prev, isLoading: false }));
        }
    };

    const handleFetch = async () => {
        if (!validateInputs()) return;

        setLoadingStates(prev => ({ ...prev, isFetching: true }));

        try {
            // 获取有效的token（OAuth优先）
            const token = githubApi.getEffectiveToken();
            if (!token) {
                showNotification(intl.formatMessage(messages.noToken), 'error');
                setLoadingStates(prev => ({ ...prev, isFetching: false }));
                return;
            }

            // 从 GitHub 获取项目
            const result = await githubApi.fetchProject(token, formData.repository.trim());

            if (result.success) {
                setLoadingStates(prev => ({ ...prev, isFetching: false }));
                showNotification(intl.formatMessage(messages.fetchSuccess, {
                    repository: result.repository,
                    branch: result.branch
                }), 'success');
                onFetch && onFetch(result);
            } else {
                setLoadingStates(prev => ({ ...prev, isFetching: false }));
                showNotification(intl.formatMessage(messages.fetchFailed), 'error');
            }

        } catch (err) {
            console.error('Fetch error:', err);
            setLoadingStates(prev => ({ ...prev, isFetching: false }));
            showNotification(intl.formatMessage(messages.fetchError), 'error');
        } finally {
            setLoadingStates(prev => ({ ...prev, isFetching: false }));
        }
    };

    const handleCancel = () => {
        if (!loadingStates.isLoading && !loadingStates.isFetching) {
            onCancel && onCancel();
        }
    };

    const showNotification = (message, type = 'info') => {
        setNotification({ show: true, message, type });
        // 3秒后自动隐藏通知
        setTimeout(() => {
            setNotification(prev => ({ ...prev, show: false }));
        }, 3000);
    };



    return (
        <Modal
            className={styles.modalContent}
            contentLabel={intl.formatMessage(messages.title)}
            isOpen={isOpen}
            onRequestClose={handleCancel}
        >
            <Box className={styles.container}>
                <Box className={styles.content}>
                    <h2 className={styles.title}>
                        <FormattedMessage {...messages.title} />
                    </h2>

                    {/* 仓库输入 */}
                    <Box className={styles.formGroup}>
                        <Label text={intl.formatMessage(messages.repositoryLabel)}>
                            <Input
                                type="text"
                                value={formData.repository}
                                onChange={handleRepositoryChange}
                                placeholder={intl.formatMessage(messages.repositoryPlaceholder)}
                                disabled={loadingStates.isLoading || loadingStates.isFetching}
                                className={styles.input}
                            />
                        </Label>
                    </Box>

                    {/* 提交摘要输入 */}
                    <Box className={styles.formGroup}>
                        <Label text={intl.formatMessage(messages.summaryLabel)}>
                            <Input
                                type="text"
                                value={formData.summary}
                                onChange={handleSummaryChange}
                                placeholder={intl.formatMessage(messages.summaryPlaceholder)}
                                disabled={loadingStates.isLoading || loadingStates.isFetching}
                                className={styles.input}
                            />
                        </Label>
                    </Box>

                    {/* 提交描述输入 */}
                    <Box className={styles.formGroup}>
                        <Label text={intl.formatMessage(messages.descriptionLabel)}>
                            <textarea
                                value={formData.description}
                                onChange={handleDescriptionChange}
                                placeholder={intl.formatMessage(messages.descriptionPlaceholder)}
                                disabled={loadingStates.isLoading || loadingStates.isFetching}
                                className={styles.textarea}
                                rows={3}
                            />
                        </Label>
                    </Box>

                    {/* README 文件选择 */}
                    <Box className={styles.formGroup}>
                        <Label text={intl.formatMessage(messages.readmeLabel)}>
                            <div
                                className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''}`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={handleFileInputClick}
                            >
                                {formData.readmeFile ? (
                                    <div className={styles.fileSelected}>
                                        <span className={styles.fileIcon}>📄</span>
                                        <span className={styles.fileName}>{formData.readmeFile.name}</span>
                                        <button
                                            type="button"
                                            className={styles.removeFile}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateFormData('readmeFile', null);
                                            }}
                                            disabled={loadingStates.isLoading || loadingStates.isFetching}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <div className={styles.dropZoneContent}>
                                        <span className={styles.dropIcon}>📎</span>
                                        <span className={styles.dropText}>
                                            {isDragOver ? (
                                                <FormattedMessage
                                                    defaultMessage="Release to upload"
                                                    description="File drop release hint"
                                                    id="gui.gitCommit.dragReleaseHint"
                                                />
                                            ) : (
                                                <FormattedMessage
                                                    defaultMessage="Drag file here or click to select"
                                                    description="File drop zone hint"
                                                    id="gui.gitCommit.dragDropHint"
                                                />
                                            )}
                                        </span>
                                        <span className={styles.dropHint}>
                                            <FormattedMessage
                                                defaultMessage="Support .md or .markdown files"
                                                description="Supported file types hint"
                                                id="gui.gitCommit.readmeFileHint"
                                            />
                                        </span>
                                    </div>
                                )}
                            </div>
                            {/* 隐藏的文件输入 */}
                            <input
                                id="readme-file-input"
                                type="file"
                                accept=".md,.markdown"
                                onChange={handleReadmeChange}
                                disabled={loadingStates.isLoading || loadingStates.isFetching}
                                style={{ display: 'none' }}
                            />
                        </Label>
                    </Box>

                    {/* 通知显示区域 */}
                    {notification.show && (
                        <Box className={styles.notificationContainer}>
                            <div className={`${styles.notification} ${styles[`notification${notification.type.charAt(0).toUpperCase() + notification.type.slice(1)}`]}`}>
                                <span className={styles.notificationIcon}>
                                    {notification.type === 'success' && '✓'}
                                    {notification.type === 'error' && '✕'}
                                    {notification.type === 'warning' && '⚠'}
                                    {notification.type === 'info' && 'ℹ'}
                                </span>
                                <span className={styles.notificationText}>
                                    {notification.message}
                                </span>
                            </div>
                        </Box>
                    )}

                </Box>

                <Box className={styles.footer}>
                    <Button
                        className={styles.cancelButton}
                        onClick={handleCancel}
                        disabled={loadingStates.isLoading || loadingStates.isFetching}
                    >
                        <FormattedMessage {...messages.cancelButton} />
                    </Button>
                    {!githubApi.hasAnyToken() ? (
                        <Button
                            className={styles.loginButton}
                            onClick={() => {
                                // 触发登录流程 - 这里需要通过props传递登录回调
                                if (onLogin) {
                                    onLogin();
                                }
                            }}
                            disabled={loadingStates.isLoading || loadingStates.isFetching}
                        >
                            <FormattedMessage
                                defaultMessage="Login"
                                description="Button to login to GitHub"
                                id="gui.gitCommit.loginButton"
                            />
                        </Button>
                    ) : (
                        <Button
                            className={styles.logoutButton}
                            onClick={() => {
                                githubApi.clearAllAuth();
                                showNotification(intl.formatMessage(messages.logoutSuccess), 'success');
                                onCancel && onCancel();
                            }}
                            disabled={loadingStates.isLoading || loadingStates.isFetching}
                        >
                            <FormattedMessage
                                defaultMessage="Logout"
                                description="Button to logout from GitHub"
                                id="gui.gitCommit.logoutButton"
                            />
                        </Button>
                    )}
                    <Button
                        className={styles.fetchButton}
                        onClick={handleFetch}
                        disabled={loadingStates.isLoading || loadingStates.isFetching || !githubApi.hasAnyToken()}
                    >
                        {loadingStates.isFetching ? (
                            <FormattedMessage {...messages.fetching} />
                        ) : (
                            <FormattedMessage {...messages.fetchButton} />
                        )}
                    </Button>
                    <Button
                        className={styles.commitButton}
                        onClick={handleSubmit}
                        disabled={loadingStates.isLoading || loadingStates.isFetching || !githubApi.hasAnyToken()}
                    >
                        {loadingStates.isLoading ? (
                            <FormattedMessage {...messages.loading} />
                        ) : (
                            <FormattedMessage {...messages.commitButton} />
                        )}
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

GitCommitModal.propTypes = {
    intl: intlShape.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onCancel: PropTypes.func,
    onCommit: PropTypes.func,
    onFetch: PropTypes.func,
    onLogin: PropTypes.func,
    projectData: PropTypes.oneOfType([
        PropTypes.instanceOf(ArrayBuffer),
        PropTypes.instanceOf(Blob)
    ]).isRequired,
    repository: PropTypes.string
};

export default injectIntl(GitCommitModal);
