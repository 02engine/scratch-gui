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
        projectData
    } = props;

    const [formData, setFormData] = React.useState({
        repository: '',
        summary: '',
        description: '',
        readmeFile: null
    });
    const [loadingStates, setLoadingStates] = React.useState({
        isLoading: false,
        isFetching: false
    });
    const [uiMessages, setUiMessages] = React.useState({
        error: '',
        success: ''
    });
    const [isDragOver, setIsDragOver] = React.useState(false);

    const updateFormData = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setUiMessages(prev => ({ ...prev, error: '' }));
    };

    const handleRepositoryChange = e => updateFormData('repository', e.target.value);
    const handleSummaryChange = e => updateFormData('summary', e.target.value);
    const handleDescriptionChange = e => updateFormData('description', e.target.value);

    const handleReadmeChange = e => {
        const file = e.target.files[0];
        if (file && file.name.toLowerCase().endsWith('.md')) {
            updateFormData('readmeFile', file);
        } else if (file) {
            setUiMessages(prev => ({ ...prev, error: 'Please select a valid .md file' }));
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
                setUiMessages(prev => ({ ...prev, error: 'Please drop a valid .md or .markdown file' }));
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
            setUiMessages(prev => ({ ...prev, error: 'Please enter a repository' }));
            return false;
        }

        // 验证仓库格式
        const repoPattern = /^[^/]+\/[^/]+$/;
        if (!repoPattern.test(formData.repository.trim())) {
            setUiMessages(prev => ({ ...prev, error: 'Repository must be in format: owner/repository' }));
            return false;
        }

        return true;
    };

    const handleSubmit = async () => {
        if (!validateInputs()) return;

        setLoadingStates(prev => ({ ...prev, isLoading: true }));
        setUiMessages({ error: '', success: '' });

        try {
            // 获取有效的token（OAuth优先）
            const token = githubApi.getEffectiveToken();
            if (!token) {
                setUiMessages(prev => ({ ...prev, error: 'No authentication token available. Please authenticate first.' }));
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
                setUiMessages(prev => ({ ...prev, success: `Successfully committed to ${result.repository} (${result.branch})` }));
                onCommit && onCommit(result);
            } else {
                setUiMessages(prev => ({ ...prev, error: result.error || 'Failed to commit to GitHub' }));
            }

        } catch (err) {
            console.error('Commit error:', err);
            setUiMessages(prev => ({ ...prev, error: err.message || 'An unexpected error occurred' }));
        } finally {
            setLoadingStates(prev => ({ ...prev, isLoading: false }));
        }
    };

    const handleFetch = async () => {
        if (!validateInputs()) return;

        setLoadingStates(prev => ({ ...prev, isFetching: true }));
        setUiMessages({ error: '', success: '' });

        try {
            // 获取有效的token（OAuth优先）
            const token = githubApi.getEffectiveToken();
            if (!token) {
                setUiMessages(prev => ({ ...prev, error: 'No authentication token available. Please authenticate first.' }));
                return;
            }

            // 从 GitHub 获取项目
            const result = await githubApi.fetchProject(token, formData.repository.trim());

            if (result.success) {
                setUiMessages(prev => ({ ...prev, success: `Successfully fetched project from ${result.repository} (${result.branch})` }));
                onFetch && onFetch(result);
            } else {
                setUiMessages(prev => ({ ...prev, error: result.error || 'Failed to fetch from GitHub' }));
            }

        } catch (err) {
            console.error('Fetch error:', err);
            setUiMessages(prev => ({ ...prev, error: err.message || 'An unexpected error occurred while fetching' }));
        } finally {
            setLoadingStates(prev => ({ ...prev, isFetching: false }));
        }
    };

    const handleCancel = () => {
        if (!loadingStates.isLoading && !loadingStates.isFetching) {
            onCancel && onCancel();
        }
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
                                            {isDragOver ? '释放文件以上传' : '拖拽文件到此处或点击选择'}
                                        </span>
                                        <span className={styles.dropHint}>
                                            支持 .md 或 .markdown 文件
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

                    {/* 错误消息 */}
                    {uiMessages.error && (
                        <Box className={styles.error}>
                            {uiMessages.error}
                        </Box>
                    )}

                    {/* 成功消息 */}
                    {uiMessages.success && (
                        <Box className={styles.success}>
                            {uiMessages.success}
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
                                setUiMessages(prev => ({ ...prev, success: 'Successfully logged out from GitHub' }));
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
    ]).isRequired
};

export default injectIntl(GitCommitModal);
