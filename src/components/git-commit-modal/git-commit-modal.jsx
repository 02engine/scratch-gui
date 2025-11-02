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
    tokenLabel: {
        id: 'gui.gitCommit.tokenLabel',
        defaultMessage: 'GitHub Personal Token',
        description: 'Label for the GitHub token input'
    },
    tokenPlaceholder: {
        id: 'gui.gitCommit.tokenPlaceholder',
        defaultMessage: 'Enter your GitHub Personal Access Token',
        description: 'Placeholder for the GitHub token input'
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
        projectData
    } = props;

    const [token, setToken] = React.useState('');
    const [repository, setRepository] = React.useState('');
    const [summary, setSummary] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [readmeFile, setReadmeFile] = React.useState(null);
    const [saveToken, setSaveToken] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const [isFetching, setIsFetching] = React.useState(false);
    const [error, setError] = React.useState('');
    const [success, setSuccess] = React.useState('');

    // 组件初始化时加载保存的 token
    React.useEffect(() => {
        const savedToken = githubApi.getToken();
        if (savedToken) {
            setToken(savedToken);
            setSaveToken(true);
        }
    }, []);

    const handleTokenChange = e => {
        setToken(e.target.value);
        setError('');
    };

    const handleRepositoryChange = e => {
        setRepository(e.target.value);
        setError('');
    };

    const handleSummaryChange = e => {
        setSummary(e.target.value);
        setError('');
    };

    const handleDescriptionChange = e => {
        setDescription(e.target.value);
        setError('');
    };

    const handleReadmeChange = e => {
        const file = e.target.files[0];
        if (file && file.name.toLowerCase().endsWith('.md')) {
            setReadmeFile(file);
            setError('');
        } else if (file) {
            setError('Please select a valid .md file');
            e.target.value = ''; // 清除无效文件
        }
    };

    const handleSaveTokenChange = e => {
        setSaveToken(e.target.checked);
    };

    const validateInputs = () => {
        if (!token.trim()) {
            setError('Please enter your GitHub Personal Token');
            return false;
        }

        if (!repository.trim()) {
            setError('Please enter a repository');
            return false;
        }

        // 验证仓库格式
        const repoPattern = /^[^/]+\/[^/]+$/;
        if (!repoPattern.test(repository.trim())) {
            setError('Repository must be in format: owner/repository');
            return false;
        }

        return true;
    };

    const handleSubmit = async () => {
        if (!validateInputs()) {
            return;
        }

        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            // 保存 token（如果用户选择）
            if (saveToken && token) {
                githubApi.saveToken(token);
            }

            // 创建 SB3 文件对象
            let sb3File;
            if (projectData instanceof Blob) {
                // 如果已经是 Blob，直接创建 File
                sb3File = new File([projectData], 'project.sb3', {type: 'application/zip'});
            } else {
                // 如果是 ArrayBuffer，先创建 Blob 再创建 File
                const sb3Blob = new Blob([projectData], {type: 'application/zip'});
                sb3File = new File([sb3Blob], 'project.sb3', {type: 'application/zip'});
            }

            // 提交到 GitHub
            const commitSummary = summary.trim() || `Upload project from 02engine - ${new Date().toISOString()}`;
            const commitDescription = description.trim();

            const result = await githubApi.commitProject({
                token: token.trim(),
                repository: repository.trim(),
                sb3File,
                readmeFile,
                commitMessage: commitSummary,
                summary: commitSummary,
                description: commitDescription
            });

            if (result.success) {
                setSuccess(`Successfully committed to ${result.repository} (${result.branch})`);
                onCommit && onCommit(result);
            } else {
                setError(result.error || 'Failed to commit to GitHub');
            }

        } catch (err) {
            console.error('Commit error:', err);
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFetch = async () => {
        if (!validateInputs()) {
            return;
        }

        setIsFetching(true);
        setError('');
        setSuccess('');

        try {
            // 保存 token（如果用户选择）
            if (saveToken && token) {
                githubApi.saveToken(token);
            }

            // 从 GitHub 获取项目
            const result = await githubApi.fetchProject(token.trim(), repository.trim());

            if (result.success) {
                setSuccess(`Successfully fetched project from ${result.repository} (${result.branch})`);
                onFetch && onFetch(result);
            } else {
                setError(result.error || 'Failed to fetch from GitHub');
            }

        } catch (err) {
            console.error('Fetch error:', err);
            setError(err.message || 'An unexpected error occurred while fetching');
        } finally {
            setIsFetching(false);
        }
    };

    const handleCancel = () => {
        if (!isLoading && !isFetching) {
            onCancel && onCancel();
        }
    };

    const handleClearToken = () => {
        githubApi.clearToken();
        setToken('');
        setSaveToken(false);
    };

    return (
        <Modal
            className={styles.modalContent}
            contentLabel={intl.formatMessage(messages.title)}
            isOpen={isOpen}
            onRequestClose={handleCancel}
        >
            <Box className={styles.container}>
                <Box className={styles.header}>
                    <h2 className={styles.title}>
                        <FormattedMessage {...messages.title} />
                    </h2>
                </Box>

                <Box className={styles.body}>
                    {/* GitHub Token 输入 */}
                    <Box className={styles.formGroup}>
                        <Label text={intl.formatMessage(messages.tokenLabel)}>
                            <Input
                                type="password"
                                value={token}
                                onChange={handleTokenChange}
                                placeholder={intl.formatMessage(messages.tokenPlaceholder)}
                                disabled={isLoading || isFetching}
                                className={styles.input}
                            />
                        </Label>
                        {token && (
                            <button
                                type="button"
                                className={styles.clearButton}
                                onClick={handleClearToken}
                                disabled={isLoading || isFetching}
                            >
                                Clear
                            </button>
                        )}
                    </Box>

                    {/* 保存 Token 复选框 */}
                    <Box className={styles.checkboxGroup}>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={saveToken}
                                onChange={handleSaveTokenChange}
                                disabled={isLoading || isFetching}
                                className={styles.checkbox}
                            />
                            <FormattedMessage {...messages.saveToken} />
                        </label>
                    </Box>

                    {/* 仓库输入 */}
                    <Box className={styles.formGroup}>
                        <Label text={intl.formatMessage(messages.repositoryLabel)}>
                            <Input
                                type="text"
                                value={repository}
                                onChange={handleRepositoryChange}
                                placeholder={intl.formatMessage(messages.repositoryPlaceholder)}
                                disabled={isLoading || isFetching}
                                className={styles.input}
                            />
                        </Label>
                    </Box>

                    {/* 提交摘要输入 */}
                    <Box className={styles.formGroup}>
                        <Label text={intl.formatMessage(messages.summaryLabel)}>
                            <Input
                                type="text"
                                value={summary}
                                onChange={handleSummaryChange}
                                placeholder={intl.formatMessage(messages.summaryPlaceholder)}
                                disabled={isLoading || isFetching}
                                className={styles.input}
                            />
                        </Label>
                    </Box>

                    {/* 提交描述输入 */}
                    <Box className={styles.formGroup}>
                        <Label text={intl.formatMessage(messages.descriptionLabel)}>
                            <textarea
                                value={description}
                                onChange={handleDescriptionChange}
                                placeholder={intl.formatMessage(messages.descriptionPlaceholder)}
                                disabled={isLoading || isFetching}
                                className={styles.textarea}
                                rows={3}
                            />
                        </Label>
                    </Box>

                    {/* README 文件选择 */}
                    <Box className={styles.formGroup}>
                        <Label text={intl.formatMessage(messages.readmeLabel)}>
                            <input
                                type="file"
                                accept=".md,.markdown"
                                onChange={handleReadmeChange}
                                disabled={isLoading || isFetching}
                                className={styles.fileInput}
                            />
                        </Label>
                        {readmeFile && (
                            <Box className={styles.selectedFile}>
                                Selected: {readmeFile.name}
                            </Box>
                        )}
                    </Box>

                    {/* 错误消息 */}
                    {error && (
                        <Box className={styles.error}>
                            {error}
                        </Box>
                    )}

                    {/* 成功消息 */}
                    {success && (
                        <Box className={styles.success}>
                            {success}
                        </Box>
                    )}
                </Box>

                <Box className={styles.footer}>
                    <Button
                        className={styles.cancelButton}
                        onClick={handleCancel}
                        disabled={isLoading || isFetching}
                    >
                        <FormattedMessage {...messages.cancelButton} />
                    </Button>
                    <Button
                        className={styles.fetchButton}
                        onClick={handleFetch}
                        disabled={isLoading || isFetching}
                    >
                        {isFetching ? (
                            <FormattedMessage {...messages.fetching} />
                        ) : (
                            <FormattedMessage {...messages.fetchButton} />
                        )}
                    </Button>
                    <Button
                        className={styles.commitButton}
                        onClick={handleSubmit}
                        disabled={isLoading || isFetching}
                    >
                        {isLoading ? (
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
    projectData: PropTypes.oneOfType([
        PropTypes.instanceOf(ArrayBuffer),
        PropTypes.instanceOf(Blob)
    ]).isRequired
};

export default injectIntl(GitCommitModal);