import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import Modal from '../modal/modal.jsx';
import Input from '../forms/input.jsx';
import Label from '../forms/label.jsx';
import styles from './git-quick-modal.css';
import githubApi from '../../lib/github-api.js';

const messages = defineMessages({
    quickCommitTitle: {
        id: 'gui.gitQuick.quickCommitTitle',
        defaultMessage: 'Quick Commit',
        description: 'Title of the quick commit modal'
    },
    fetchTitle: {
        id: 'gui.gitQuick.fetchTitle',
        defaultMessage: 'Fetch from GitHub',
        description: 'Title of the fetch modal'
    },
    pullRequestTitle: {
        id: 'gui.gitQuick.pullRequestTitle',
        defaultMessage: 'Create Pull Request',
        description: 'Title of the pull request modal'
    },
    summaryLabel: {
        id: 'gui.gitQuick.summaryLabel',
        defaultMessage: 'Summary',
        description: 'Label for the summary input'
    },
    summaryPlaceholder: {
        id: 'gui.gitQuick.summaryPlaceholder',
        defaultMessage: 'Brief summary of changes',
        description: 'Placeholder for the summary input'
    },
    descriptionLabel: {
        id: 'gui.gitQuick.descriptionLabel',
        defaultMessage: 'Description',
        description: 'Label for the description textarea'
    },
    descriptionPlaceholder: {
        id: 'gui.gitQuick.descriptionPlaceholder',
        defaultMessage: 'Detailed description of changes (optional)',
        description: 'Placeholder for the description textarea'
    },
    prTitleLabel: {
        id: 'gui.gitQuick.prTitleLabel',
        defaultMessage: 'Pull Request Title',
        description: 'Label for the PR title input'
    },
    prTitlePlaceholder: {
        id: 'gui.gitQuick.prTitlePlaceholder',
        defaultMessage: 'Pull request title',
        description: 'Placeholder for the PR title input'
    },
    prDescriptionLabel: {
        id: 'gui.gitQuick.prDescriptionLabel',
        defaultMessage: 'Pull Request Description',
        description: 'Label for the PR description textarea'
    },
    prDescriptionPlaceholder: {
        id: 'gui.gitQuick.prDescriptionPlaceholder',
        defaultMessage: 'Description of what this PR changes (optional)',
        description: 'Placeholder for the PR description textarea'
    },
    commitButton: {
        id: 'gui.gitQuick.commitButton',
        defaultMessage: 'Commit',
        description: 'Button to commit'
    },
    fetchButton: {
        id: 'gui.gitQuick.fetchButton',
        defaultMessage: 'Fetch',
        description: 'Button to fetch'
    },
    createPrButton: {
        id: 'gui.gitQuick.createPrButton',
        defaultMessage: 'Create Pull Request',
        description: 'Button to create pull request'
    },
    cancelButton: {
        id: 'gui.gitQuick.cancelButton',
        defaultMessage: 'Cancel',
        description: 'Button to cancel'
    },
    loading: {
        id: 'gui.gitQuick.loading',
        defaultMessage: 'Processing...',
        description: 'Loading message'
    }
});

const GitQuickModal = props => {
    const {
        intl,
        isOpen,
        onCancel,
        type,
        repository,
        token,
        vm,
        onSuccess
    } = props;

    const [summary, setSummary] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [prTitle, setPrTitle] = React.useState('');
    const [prDescription, setPrDescription] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [success, setSuccess] = React.useState('');

    const handleSummaryChange = e => {
        setSummary(e.target.value);
        setError('');
    };

    const handleDescriptionChange = e => {
        setDescription(e.target.value);
        setError('');
    };

    const handlePrTitleChange = e => {
        setPrTitle(e.target.value);
        setError('');
    };

    const handlePrDescriptionChange = e => {
        setPrDescription(e.target.value);
        setError('');
    };

    const handleQuickCommit = async () => {
        if (!summary.trim()) {
            setError('Please enter a commit summary');
            return;
        }

        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            // 导出项目数据
            const projectData = await vm.saveProjectSb3();
            const sb3Blob = new Blob([projectData], {type: 'application/zip'});
            const sb3File = new File([sb3Blob], 'project.sb3', {type: 'application/zip'});

            const result = await githubApi.commitProject({
                token,
                repository,
                sb3File,
                summary: summary.trim(),
                description: description.trim()
            });

            if (result.success) {
                setSuccess(`Successfully committed to ${repository}`);
                // 更新 VM 中的 Git 数据
                vm.runtime.platform.git.repository = repository;
                vm.runtime.platform.git.lastCommit = new Date().toISOString();
                onSuccess && onSuccess(result);
            } else {
                setError(result.error || 'Failed to commit');
            }
        } catch (err) {
            console.error('Quick commit failed:', err);
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFetch = async () => {
        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            const result = await githubApi.fetchProject(token, repository);

            if (result.success) {
                // 加载获取的项目数据到 VM
                const arrayBuffer = result.projectData;
                await vm.loadProject(arrayBuffer);

                setSuccess(`Successfully fetched from ${repository}`);
                // 更新 VM 中的 Git 数据
                vm.runtime.platform.git.repository = repository;
                vm.runtime.platform.git.lastFetch = new Date().toISOString();
                onSuccess && onSuccess(result);
            } else {
                setError(result.error || 'Failed to fetch project');
            }
        } catch (err) {
            console.error('Fetch failed:', err);
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreatePullRequest = async () => {
        if (!prTitle.trim()) {
            setError('Please enter a pull request title');
            return;
        }

        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            const [owner, repo] = repository.split('/').filter(part => part.trim());

            // 检查仓库是否支持 Pull Request
            const supportsPR = await githubApi.supportsPullRequests(token, owner, repo);
            if (!supportsPR) {
                throw new Error('This repository does not support pull requests or you do not have permission');
            }

            // 检查是否是 Fork
            const repoInfo = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }).then(res => res.json());

            if (repoInfo.fork) {
                // 如果是 Fork，提供创建 PR 的指导
                const upstreamUrl = `https://github.com/${repoInfo.parent.owner.login}/${repoInfo.parent.name}/compare/${repoInfo.parent.default_branch}...${owner}:${repoInfo.default_branch}`;
                setSuccess(`This is a fork repository. Create a pull request at: ${upstreamUrl}`);
                return;
            }

            // 对于非 Fork 仓库，提供分支信息指导
            const defaultBranch = await githubApi.getDefaultBranch(token, owner, repo);
            const repoUrl = `https://github.com/${owner}/${repo}`;

            setSuccess(`Repository ready for pull requests. Create a new branch and submit a PR at: ${repoUrl}/pulls`);
            onSuccess && onSuccess({ success: true, repository: repository });
        } catch (err) {
            console.error('Pull request check failed:', err);
            setError(err.message || 'Failed to prepare pull request. Make sure you have created a feature branch first.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = () => {
        switch (type) {
            case 'commit':
                handleQuickCommit();
                break;
            case 'fetch':
                handleFetch();
                break;
            case 'pullrequest':
                handleCreatePullRequest();
                break;
            default:
                break;
        }
    };

    const getTitle = () => {
        switch (type) {
            case 'commit':
                return intl.formatMessage(messages.quickCommitTitle);
            case 'fetch':
                return intl.formatMessage(messages.fetchTitle);
            case 'pullrequest':
                return intl.formatMessage(messages.pullRequestTitle);
            default:
                return '';
        }
    };

    const getButtonText = () => {
        switch (type) {
            case 'commit':
                return intl.formatMessage(messages.commitButton);
            case 'fetch':
                return intl.formatMessage(messages.fetchButton);
            case 'pullrequest':
                return intl.formatMessage(messages.createPrButton);
            default:
                return '';
        }
    };

    return (
        <Modal
            className={styles.modalContent}
            contentLabel={getTitle()}
            isOpen={isOpen}
            onRequestClose={onCancel}
        >
            <Box className={styles.container}>
                <Box className={styles.header}>
                    <h2 className={styles.title}>{getTitle()}</h2>
                </Box>

                <Box className={styles.body}>
                    {/* 仓库信息显示 */}
                    <Box className={styles.repositoryInfo}>
                        <strong>Repository:</strong> {repository}
                    </Box>

                    {/* 提交模式的字段 */}
                    {type === 'commit' && (
                        <>
                            <Box className={styles.formGroup}>
                                <Label text={intl.formatMessage(messages.summaryLabel)}>
                                    <Input
                                        type="text"
                                        value={summary}
                                        onChange={handleSummaryChange}
                                        placeholder={intl.formatMessage(messages.summaryPlaceholder)}
                                        disabled={isLoading}
                                        className={styles.input}
                                    />
                                </Label>
                            </Box>

                            <Box className={styles.formGroup}>
                                <Label text={intl.formatMessage(messages.descriptionLabel)}>
                                    <textarea
                                        value={description}
                                        onChange={handleDescriptionChange}
                                        placeholder={intl.formatMessage(messages.descriptionPlaceholder)}
                                        disabled={isLoading}
                                        className={styles.textarea}
                                        rows={3}
                                    />
                                </Label>
                            </Box>
                        </>
                    )}

                    {/* Pull Request 模式的字段 */}
                    {type === 'pullrequest' && (
                        <>
                            <Box className={styles.formGroup}>
                                <Label text={intl.formatMessage(messages.prTitleLabel)}>
                                    <Input
                                        type="text"
                                        value={prTitle}
                                        onChange={handlePrTitleChange}
                                        placeholder={intl.formatMessage(messages.prTitlePlaceholder)}
                                        disabled={isLoading}
                                        className={styles.input}
                                    />
                                </Label>
                            </Box>

                            <Box className={styles.formGroup}>
                                <Label text={intl.formatMessage(messages.prDescriptionLabel)}>
                                    <textarea
                                        value={prDescription}
                                        onChange={handlePrDescriptionChange}
                                        placeholder={intl.formatMessage(messages.prDescriptionPlaceholder)}
                                        disabled={isLoading}
                                        className={styles.textarea}
                                        rows={3}
                                    />
                                </Label>
                            </Box>
                        </>
                    )}

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
                        onClick={onCancel}
                        disabled={isLoading}
                    >
                        <FormattedMessage {...messages.cancelButton} />
                    </Button>
                    <Button
                        className={styles.actionButton}
                        onClick={handleSubmit}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <FormattedMessage {...messages.loading} />
                        ) : (
                            getButtonText()
                        )}
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

GitQuickModal.propTypes = {
    intl: intlShape.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onCancel: PropTypes.func,
    type: PropTypes.oneOf(['commit', 'fetch', 'pullrequest']).isRequired,
    repository: PropTypes.string.isRequired,
    token: PropTypes.string.isRequired,
    vm: PropTypes.object.isRequired,
    onSuccess: PropTypes.func
};

export default injectIntl(GitQuickModal);