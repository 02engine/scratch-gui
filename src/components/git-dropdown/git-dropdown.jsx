import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import Input from '../forms/input.jsx';
import Label from '../forms/label.jsx';

import sharedMessages from '../../lib/shared-messages';
import githubApi from '../../lib/github-api.js';
import styles from './git-dropdown.css';

const messages = defineMessages({
    title: {
        id: 'gui.gitSidebar.title',
        defaultMessage: 'Git Operations',
        description: 'Title of the Git sidebar'
    },
    backButton: {
        id: 'gui.gitSidebar.backButton',
        defaultMessage: '← Back',
        description: 'Button to go back to main menu'
    },
    closeButton: {
        id: 'gui.gitSidebar.closeButton',
        defaultMessage: 'Close',
        description: 'Button to close the sidebar'
    },
    tokenLabel: {
        id: 'gui.gitSidebar.tokenLabel',
        defaultMessage: 'GitHub Personal Token',
        description: 'Label for the GitHub token input'
    },
    tokenPlaceholder: {
        id: 'gui.gitSidebar.tokenPlaceholder',
        defaultMessage: 'Enter your GitHub Personal Access Token',
        description: 'Placeholder for the GitHub token input'
    },
    repositoryLabel: {
        id: 'gui.gitSidebar.repositoryLabel',
        defaultMessage: 'Repository',
        description: 'Label for the repository input'
    },
    repositoryPlaceholder: {
        id: 'gui.gitSidebar.repositoryPlaceholder',
        defaultMessage: 'owner/repository',
        description: 'Placeholder for the repository input'
    },
    summaryLabel: {
        id: 'gui.gitSidebar.summaryLabel',
        defaultMessage: 'Commit Summary',
        description: 'Label for the commit summary input'
    },
    summaryPlaceholder: {
        id: 'gui.gitSidebar.summaryPlaceholder',
        defaultMessage: 'Brief summary of changes',
        description: 'Placeholder for the commit summary input'
    },
    descriptionLabel: {
        id: 'gui.gitSidebar.descriptionLabel',
        defaultMessage: 'Commit Description',
        description: 'Label for the commit description textarea'
    },
    descriptionPlaceholder: {
        id: 'gui.gitSidebar.descriptionPlaceholder',
        defaultMessage: 'Detailed description of changes (optional)',
        description: 'Placeholder for the commit description textarea'
    },
    readmeLabel: {
        id: 'gui.gitSidebar.readmeLabel',
        defaultMessage: 'README.md (Optional)',
        description: 'Label for the README file input'
    },
    prTitleLabel: {
        id: 'gui.gitSidebar.prTitleLabel',
        defaultMessage: 'Pull Request Title',
        description: 'Label for the PR title input'
    },
    prTitlePlaceholder: {
        id: 'gui.gitSidebar.prTitlePlaceholder',
        defaultMessage: 'Pull request title',
        description: 'Placeholder for the PR title input'
    },
    prDescriptionLabel: {
        id: 'gui.gitSidebar.prDescriptionLabel',
        defaultMessage: 'Pull Request Description',
        description: 'Label for the PR description textarea'
    },
    prDescriptionPlaceholder: {
        id: 'gui.gitSidebar.prDescriptionPlaceholder',
        defaultMessage: 'Description of what this PR changes (optional)',
        description: 'Placeholder for the PR description textarea'
    },
    saveToken: {
        id: 'gui.gitSidebar.saveToken',
        defaultMessage: 'Save token for future use',
        description: 'Checkbox to save the GitHub token'
    },
    loading: {
        id: 'gui.gitSidebar.loading',
        defaultMessage: 'Processing...',
        description: 'Loading message during operation'
    },
    fetching: {
        id: 'gui.gitSidebar.fetching',
        defaultMessage: 'Fetching...',
        description: 'Loading message during fetch'
    }
});

const GitDropdown = props => {
    const {
        intl,
        isOpen,
        onCommit,
        onFetch,
        onPullRequest,
        onClose,
        vm
    } = props;

    // View states
    const [currentView, setCurrentView] = React.useState('main'); // 'main', 'settings', 'commit', 'quick-commit', 'fetch', 'pull-request'

    // Form states
    const [token, setToken] = React.useState('');
    const [repository, setRepository] = React.useState('');
    const [summary, setSummary] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [readmeFile, setReadmeFile] = React.useState(null);
    const [prTitle, setPrTitle] = React.useState('');
    const [prDescription, setPrDescription] = React.useState('');
    const [saveToken, setSaveToken] = React.useState(false);

    // UI states
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [success, setSuccess] = React.useState('');

    // Initialize saved token
    React.useEffect(() => {
        const savedToken = githubApi.getToken();
        if (savedToken) {
            setToken(savedToken);
            setSaveToken(true);
        }
    }, []);

    // Reset form when view changes
    React.useEffect(() => {
        setError('');
        setSuccess('');
        setIsLoading(false);
    }, [currentView]);

    if (!isOpen) return null;

    const handleMenuClick = (view) => {
        setCurrentView(view);
    };

    const handleBack = () => {
        setCurrentView('main');
        setError('');
        setSuccess('');
    };

    const validateInputs = () => {
        const savedToken = githubApi.getToken();
        if (!savedToken) {
            setError('Please configure your GitHub token in Settings first');
            return false;
        }

        if (!repository.trim()) {
            setError('Please enter a repository');
            return false;
        }

        const repoPattern = /^[^/]+\/[^/]+$/;
        if (!repoPattern.test(repository.trim())) {
            setError('Repository must be in format: owner/repository');
            return false;
        }

        return true;
    };

    const handleFullCommit = async () => {
        if (!validateInputs()) return;

        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            if (saveToken && token) {
                githubApi.saveToken(token);
            }

            // Export project data
            const sb3Data = await vm.saveProjectSb3();
            const sb3Blob = new Blob([sb3Data], {type: 'application/zip'});
            const sb3File = new File([sb3Blob], 'project.sb3', {type: 'application/zip'});

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
                vm.runtime.platform.git.repository = result.repository;
                vm.runtime.platform.git.lastCommit = new Date().toISOString();
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
        if (!validateInputs()) return;

        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            const result = await githubApi.fetchProject(token.trim(), repository.trim());

            if (result.success) {
                const arrayBuffer = result.projectData;
                await vm.loadProject(arrayBuffer);

                setSuccess(`Successfully fetched project from ${result.repository} (${result.branch})`);
                vm.runtime.platform.git.repository = repository;
                vm.runtime.platform.git.lastFetch = new Date().toISOString();
                onFetch && onFetch(result);
            } else {
                setError(result.error || 'Failed to fetch from GitHub');
            }
        } catch (err) {
            console.error('Fetch error:', err);
            setError(err.message || 'An unexpected error occurred while fetching');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePullRequest = async () => {
        if (!prTitle.trim()) {
            setError('Please enter a pull request title');
            return;
        }

        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            const [owner, repo] = repository.split('/').filter(part => part.trim());

            const supportsPR = await githubApi.supportsPullRequests(token, owner, repo);
            if (!supportsPR) {
                throw new Error('This repository does not support pull requests or you do not have permission');
            }

            const repoInfo = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }).then(res => res.json());

            if (repoInfo.fork) {
                const upstreamUrl = `https://github.com/${repoInfo.parent.owner.login}/${repoInfo.parent.name}/compare/${repoInfo.parent.default_branch}...${owner}:${repoInfo.default_branch}`;
                setSuccess(`This is a fork repository. Create a pull request at: ${upstreamUrl}`);
                return;
            }

            const defaultBranch = await githubApi.getDefaultBranch(token, owner, repo);
            const repoUrl = `https://github.com/${owner}/${repo}`;

            setSuccess(`Repository ready for pull requests. Create a new branch and submit a PR at: ${repoUrl}/pulls`);
            onPullRequest && onPullRequest({ success: true, repository: repository });
        } catch (err) {
            console.error('Pull request check failed:', err);
            setError(err.message || 'Failed to prepare pull request. Make sure you have created a feature branch first.');
        } finally {
            setIsLoading(false);
        }
    };

    const renderMainMenu = () => (
        <>
            <div style={{ marginBottom: 'auto' }}>
                <h3 style={{
                    margin: '0 0 20px 0',
                    fontSize: '18px',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    borderBottom: '2px solid var(--ui-black-transparent)',
                    paddingBottom: '10px'
                }}>
                    <FormattedMessage {...messages.title} />
                </h3>
            </div>

            <div style={{ flex: 1 }}>
                <button
                    className={styles.dropdownItem}
                    onClick={() => handleMenuClick('commit')}
                >
                    <FormattedMessage {...sharedMessages.gitDropdownCommit} />
                </button>
                <button
                    className={styles.dropdownItem}
                    onClick={() => handleMenuClick('fetch')}
                >
                    <FormattedMessage {...sharedMessages.gitDropdownFetch} />
                </button>
                <button
                    className={styles.dropdownItem}
                    onClick={() => handleMenuClick('pull-request')}
                >
                    <FormattedMessage {...sharedMessages.gitDropdownPullRequest} />
                </button>
                <button
                    className={styles.dropdownItem}
                    onClick={() => handleMenuClick('settings')}
                >
                    ⚙️ Settings
                </button>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                <button
                    onClick={onClose}
                    style={{
                        width: '100%',
                        padding: '10px',
                        background: 'var(--ui-black-transparent)',
                        color: 'var(--text-primary)',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                        transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => e.target.style.background = 'var(--ui-black-transparent)'}
                    onMouseOut={(e) => e.target.style.background = 'var(--ui-black-transparent)'}
                >
                    <FormattedMessage {...messages.closeButton} />
                </button>
            </div>
        </>
    );

    const renderFormHeader = (title) => (
        <div style={{ marginBottom: '20px' }}>
            <h3 style={{
                margin: '0',
                fontSize: '16px',
                fontWeight: '600',
                color: 'var(--text-primary)'
            }}>
                {title}
            </h3>
        </div>
    );

    const renderCommitForm = () => (
        <>
            {renderFormHeader('Full Commit')}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Repository */}
                <Box style={{ marginBottom: '15px' }}>
                    <Label text={intl.formatMessage(messages.repositoryLabel)}>
                        <Input
                            type="text"
                            value={repository}
                            onChange={(e) => setRepository(e.target.value)}
                            placeholder={intl.formatMessage(messages.repositoryPlaceholder)}
                            disabled={isLoading}
                        />
                    </Label>
                </Box>

                {/* Summary */}
                <Box style={{ marginBottom: '15px' }}>
                    <Label text={intl.formatMessage(messages.summaryLabel)}>
                        <Input
                            type="text"
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            placeholder={intl.formatMessage(messages.summaryPlaceholder)}
                            disabled={isLoading}
                        />
                    </Label>
                </Box>

                {/* Description */}
                <Box style={{ marginBottom: '15px' }}>
                    <Label text={intl.formatMessage(messages.descriptionLabel)}>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={intl.formatMessage(messages.descriptionPlaceholder)}
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                minHeight: '80px',
                                padding: '8px',
                                border: '1px solid var(--ui-black-transparent)',
                                borderRadius: '4px',
                                fontFamily: 'inherit',
                                fontSize: '14px'
                            }}
                            rows={3}
                        />
                    </Label>
                </Box>

                {/* README File */}
                <Box style={{ marginBottom: '15px' }}>
                    <Label text={intl.formatMessage(messages.readmeLabel)}>
                        <input
                            type="file"
                            accept=".md,.markdown"
                            onChange={(e) => {
                                const file = e.target.files[0];
                                if (file && file.name.toLowerCase().endsWith('.md')) {
                                    setReadmeFile(file);
                                } else if (file) {
                                    setError('Please select a valid .md file');
                                    e.target.value = '';
                                }
                            }}
                            disabled={isLoading}
                            style={{ width: '100%' }}
                        />
                    </Label>
                    {readmeFile && (
                        <div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--text-primary)' }}>
                            Selected: {readmeFile.name}
                        </div>
                    )}
                </Box>

                {/* Messages */}
                {error && (
                    <Box style={{
                        marginBottom: '15px',
                        padding: '10px',
                        background: '#fee',
                        border: '1px solid #fcc',
                        borderRadius: '4px',
                        color: '#c33',
                        fontSize: '14px'
                    }}>
                        {error}
                    </Box>
                )}

                {success && (
                    <Box style={{
                        marginBottom: '15px',
                        padding: '10px',
                        background: '#efe',
                        border: '1px solid #cfc',
                        borderRadius: '4px',
                        color: '#363',
                        fontSize: '14px'
                    }}>
                        {success}
                    </Box>
                )}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                <Button
                    onClick={handleFullCommit}
                    disabled={isLoading}
                    style={{ width: '100%', marginBottom: '10px' }}
                >
                    {isLoading ? <FormattedMessage {...messages.loading} /> : 'Commit to GitHub'}
                </Button>
                <Button
                    onClick={handleBack}
                    disabled={isLoading}
                    style={{ width: '100%' }}
                >
                    <FormattedMessage {...messages.backButton} />
                </Button>
            </div>
        </>
    );



    const renderFetchForm = () => (
        <>
            {renderFormHeader('Fetch from GitHub')}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Repository */}
                <Box style={{ marginBottom: '15px' }}>
                    <Label text={intl.formatMessage(messages.repositoryLabel)}>
                        <Input
                            type="text"
                            value={repository}
                            onChange={(e) => setRepository(e.target.value)}
                            placeholder={intl.formatMessage(messages.repositoryPlaceholder)}
                            disabled={isLoading}
                        />
                    </Label>
                </Box>

                {/* Messages */}
                {error && (
                    <Box style={{
                        marginBottom: '15px',
                        padding: '10px',
                        background: '#fee',
                        border: '1px solid #fcc',
                        borderRadius: '4px',
                        color: '#c33',
                        fontSize: '14px'
                    }}>
                        {error}
                    </Box>
                )}

                {success && (
                    <Box style={{
                        marginBottom: '15px',
                        padding: '10px',
                        background: '#efe',
                        border: '1px solid #cfc',
                        borderRadius: '4px',
                        color: '#363',
                        fontSize: '14px'
                    }}>
                        {success}
                    </Box>
                )}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                <Button
                    onClick={handleFetch}
                    disabled={isLoading}
                    style={{ width: '100%', marginBottom: '10px' }}
                >
                    {isLoading ? <FormattedMessage {...messages.fetching} /> : 'Fetch'}
                </Button>
                <Button
                    onClick={handleBack}
                    disabled={isLoading}
                    style={{ width: '100%' }}
                >
                    <FormattedMessage {...messages.backButton} />
                </Button>
            </div>
        </>
    );

    const renderPullRequestForm = () => (
        <>
            {renderFormHeader('Create Pull Request')}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Repository Info */}
                <Box style={{ marginBottom: '15px', padding: '10px', background: 'var(--ui-white-dim)', borderRadius: '4px' }}>
                    <strong>Repository:</strong> {repository || 'Not set'}
                </Box>

                {/* PR Title */}
                <Box style={{ marginBottom: '15px' }}>
                    <Label text={intl.formatMessage(messages.prTitleLabel)}>
                        <Input
                            type="text"
                            value={prTitle}
                            onChange={(e) => setPrTitle(e.target.value)}
                            placeholder={intl.formatMessage(messages.prTitlePlaceholder)}
                            disabled={isLoading}
                        />
                    </Label>
                </Box>

                {/* PR Description */}
                <Box style={{ marginBottom: '15px' }}>
                    <Label text={intl.formatMessage(messages.prDescriptionLabel)}>
                        <textarea
                            value={prDescription}
                            onChange={(e) => setPrDescription(e.target.value)}
                            placeholder={intl.formatMessage(messages.prDescriptionPlaceholder)}
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                minHeight: '80px',
                                padding: '8px',
                                border: '1px solid var(--ui-black-transparent)',
                                borderRadius: '4px',
                                fontFamily: 'inherit',
                                fontSize: '14px'
                            }}
                            rows={3}
                        />
                    </Label>
                </Box>

                {/* Messages */}
                {error && (
                    <Box style={{
                        marginBottom: '15px',
                        padding: '10px',
                        background: '#fee',
                        border: '1px solid #fcc',
                        borderRadius: '4px',
                        color: '#c33',
                        fontSize: '14px'
                    }}>
                        {error}
                    </Box>
                )}

                {success && (
                    <Box style={{
                        marginBottom: '15px',
                        padding: '10px',
                        background: '#efe',
                        border: '1px solid #cfc',
                        borderRadius: '4px',
                        color: '#363',
                        fontSize: '14px'
                    }}>
                        {success}
                    </Box>
                )}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                <Button
                    onClick={handlePullRequest}
                    disabled={isLoading}
                    style={{ width: '100%', marginBottom: '10px' }}
                >
                    {isLoading ? <FormattedMessage {...messages.loading} /> : 'Create Pull Request'}
                </Button>
                <Button
                    onClick={handleBack}
                    disabled={isLoading}
                    style={{ width: '100%' }}
                >
                    <FormattedMessage {...messages.backButton} />
                </Button>
            </div>
        </>
    );

    const renderSettingsForm = () => (
        <>
            {renderFormHeader('Git Settings')}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Current Token Status */}
                <Box style={{ marginBottom: '20px', padding: '15px', background: 'var(--ui-white-dim)', borderRadius: '6px' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                        Token Status
                    </h4>
                    <div style={{ fontSize: '13px', color: token ? '#363' : '#c33' }}>
                        {token ? '✓ Token configured' : '✗ No token configured'}
                    </div>
                    {token && (
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '5px', opacity: 0.7 }}>
                            Token ends with: ...{token.slice(-4)}
                        </div>
                    )}
                </Box>

                {/* GitHub Token */}
                <Box style={{ marginBottom: '15px' }}>
                    <Label text={intl.formatMessage(messages.tokenLabel)}>
                        <Input
                            type="password"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder={intl.formatMessage(messages.tokenPlaceholder)}
                            disabled={isLoading}
                        />
                    </Label>
                </Box>

                {/* Save Token */}
                <Box style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="checkbox"
                            checked={saveToken}
                            onChange={(e) => setSaveToken(e.target.checked)}
                            disabled={isLoading}
                        />
                        <FormattedMessage {...messages.saveToken} />
                    </label>
                </Box>

                {/* Repository */}
                <Box style={{ marginBottom: '15px' }}>
                    <Label text={intl.formatMessage(messages.repositoryLabel)}>
                        <Input
                            type="text"
                            value={repository}
                            onChange={(e) => setRepository(e.target.value)}
                            placeholder={intl.formatMessage(messages.repositoryPlaceholder)}
                            disabled={isLoading}
                        />
                    </Label>
                </Box>

                {/* Messages */}
                {error && (
                    <Box style={{
                        marginBottom: '15px',
                        padding: '10px',
                        background: '#fee',
                        border: '1px solid #fcc',
                        borderRadius: '4px',
                        color: '#c33',
                        fontSize: '14px'
                    }}>
                        {error}
                    </Box>
                )}

                {success && (
                    <Box style={{
                        marginBottom: '15px',
                        padding: '10px',
                        background: '#efe',
                        border: '1px solid #cfc',
                        borderRadius: '4px',
                        color: '#363',
                        fontSize: '14px'
                    }}>
                        {success}
                    </Box>
                )}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                <Button
                    onClick={() => {
                        if (saveToken && token) {
                            githubApi.saveToken(token);
                            setSuccess('Settings saved successfully!');
                        } else if (!saveToken) {
                            githubApi.clearToken();
                            setToken('');
                            setSuccess('Token cleared successfully!');
                        }
                    }}
                    disabled={isLoading}
                    style={{ width: '100%', marginBottom: '10px' }}
                >
                    Save Settings
                </Button>
                <Button
                    onClick={handleBack}
                    disabled={isLoading}
                    style={{ width: '100%' }}
                >
                    <FormattedMessage {...messages.backButton} />
                </Button>
            </div>
        </>
    );

    const renderCurrentView = () => {
        switch (currentView) {
            case 'settings':
                return renderSettingsForm();
            case 'commit':
                return renderCommitForm();
            case 'fetch':
                return renderFetchForm();
            case 'pull-request':
                return renderPullRequestForm();
            default:
                return renderMainMenu();
        }
    };

    return (
        <div className={styles.dropdownContainer}>
            <div className={styles.dropdownMenu}>
                {renderCurrentView()}
            </div>
        </div>
    );
};

GitDropdown.propTypes = {
    intl: intlShape.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onCommit: PropTypes.func,
    onFetch: PropTypes.func,
    onPullRequest: PropTypes.func,
    onClose: PropTypes.func.isRequired,
    vm: PropTypes.object.isRequired
};

export default injectIntl(GitDropdown);
