import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

import GitModalComponent from '../components/tw-git-modal/git-modal.jsx';
import {closeGitModal} from '../reducers/modals.js';

import downloadBlob from '../lib/utils/download-blob.js';

import {
    getDefaultAuthor,
    getRepoStatus,
    initRepo,
    createBranch,
    checkoutBranchAndRestore,
    checkoutCommitAndRestore,
    readSnapshotAtCommit,
    deleteRepo,
    deleteBranch,
    commitProject,
    mergeBranchesPreview,
    mergeBranchesApply,
    restoreProjectFromCurrentRef,
    computeCommitGraph,
    addRemote,
    removeRemote,
    getRemotes,
    push,
    pull
} from '../lib/git/browser-git.js';

const AUTH_STORAGE_KEY = 'mw:git-auth';
const GITHUB_AUTHOR_STORAGE_KEY = 'mw:git-github-author';

const getGitHubAuthorEmail = user => {
    if (!user || typeof user.login !== 'string' || !user.login) return '';
    if (typeof user.id === 'number') {
        return `${user.id}+${user.login}@users.noreply.github.com`;
    }
    return `${user.login}@users.noreply.github.com`;
};

const getGitHubAuthor = user => {
    if (!user || typeof user.login !== 'string' || !user.login) return null;
    return {
        name: user.login,
        email: getGitHubAuthorEmail(user)
    };
};

const readSavedGitHubAuthor = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(GITHUB_AUTHOR_STORAGE_KEY) || 'null');
        if (saved && typeof saved.name === 'string' && typeof saved.email === 'string') {
            return saved;
        }
    } catch (e) {
        // ignore storage failures
    }
    return null;
};

const writeSavedGitHubAuthor = author => {
    try {
        localStorage.setItem(GITHUB_AUTHOR_STORAGE_KEY, JSON.stringify(author));
    } catch (e) {
        // ignore storage failures
    }
};

const fetchGitHubAuthor = async token => {
    const response = await fetch('https://api.github.com/user', {
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`
        }
    });
    if (!response.ok) {
        throw new Error(`GitHub user lookup failed: ${response.status}`);
    }
    return getGitHubAuthor(await response.json());
};

const readSavedAuth = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}');
        return saved && typeof saved === 'object' ? saved : {};
    } catch (e) {
        return {};
    }
};

const writeSavedAuth = auth => {
    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
    } catch (e) {
        // ignore storage failures
    }
};

class TWGitModal extends React.Component {
    constructor (props) {
        super(props);

        const author = readSavedGitHubAuthor() || getDefaultAuthor();

        this.state = {
            busy: false,
            busyMessage: null,
            busyProgress: null,
            error: null,
            initialized: false,
            currentBranch: null,
            branches: [],
            commits: [],
            graphBranches: [],
            graphNodes: [],
            commitMessage: '',
            authorName: author.name,
            authorEmail: author.email,
            newBranchName: '',
            mergeSourceBranch: '',
            mergeConflicts: [],
            mergeResolutions: {},
            remotes: [],
            remoteName: 'origin',
            remoteUrl: '',
            pushRemote: '',
            pushBranch: 'main',
            authUsername: '',
            authToken: '',
            disableCorsProxy: false,
            changes: []
        };

        this._lastProgressUpdate = 0;
        this._githubAuthorRequestId = 0;

        bindAll(this, [
            'refresh',
            'handleRefresh',
            'handleInit',
            'handleCommit',
            'handleUndoCommit',
            'handleCheckoutBranch',
            'handleCreateBranch',
            'handleRestoreCommit',
            'handleDownloadCommit',
            'handleDeleteRepo',
            'handleDeleteBranch',
            'handleClose',
            'handleChangeCommitMessage',
            'handleChangeAuthorName',
            'handleChangeAuthorEmail',
            'handleChangeNewBranchName',
            'handleGitProgress',
            'handleChangeMergeSourceBranch',
            'handlePreviewMerge',
            'handleSetMergeResolution',
            'handleApplyMerge',
            'handleChangeRemoteName',
            'handleChangeRemoteUrl',
            'handleChangePushRemote',
            'handleChangePushBranch',
            'handleChangeAuthUsername',
            'handleChangeAuthToken',
            'handleChangeDisableCorsProxy',
            'handleAddRemote',
            'handleRemoveRemote',
            'handlePull',
            'handlePush'
        ]);
    }

    getRemoteUrl (remoteName = this.state.pushRemote, remotes = this.state.remotes) {
        const remote = remotes.find(item => item.name === remoteName);
        return remote ? remote.url : (remoteName || this.state.remoteUrl);
    }

    loadSavedAuthForRemote (remoteName, remotes = this.state.remotes) {
        const remoteUrl = this.getRemoteUrl(remoteName, remotes);
        if (!remoteUrl) return;

        const saved = readSavedAuth()[remoteUrl];
        if (!saved) return;

        this.setState({
            authUsername: typeof saved.username === 'string' ? saved.username : '',
            authToken: typeof saved.token === 'string' ? saved.token : '',
            disableCorsProxy: typeof saved.disableCorsProxy === 'boolean' ? saved.disableCorsProxy : this.state.disableCorsProxy
        }, () => this.updateAuthorFromGitHubAuth());
    }

    getAuthor () {
        return {
            name: this.state.authorName || 'User',
            email: this.state.authorEmail || 'user@example.com'
        };
    }

    async updateAuthorFromGitHubAuth () {
        const token = this.state.authToken;
        const username = this.state.authUsername.trim();
        const requestId = ++this._githubAuthorRequestId;

        if (token) {
            try {
                const author = await fetchGitHubAuthor(token);
                if (requestId !== this._githubAuthorRequestId || !author) return;
                writeSavedGitHubAuthor(author);
                this.setState({authorName: author.name, authorEmail: author.email});
                return;
            } catch (e) {
                // Fall through to the username-based author if the token cannot be inspected.
            }
        }

        if (username) {
            const author = {
                name: username,
                email: `${username}@users.noreply.github.com`
            };
            writeSavedGitHubAuthor(author);
            this.setState({authorName: author.name, authorEmail: author.email});
        }
    }

    saveAuthForCurrentRemote () {
        const remoteUrl = this.getRemoteUrl();
        if (!remoteUrl) return;

        const username = this.state.authUsername.trim();
        const token = this.state.authToken;
        if (!username && !token) return;

        const saved = readSavedAuth();
        saved[remoteUrl] = {
            username,
            token,
            disableCorsProxy: this.state.disableCorsProxy
        };
        writeSavedAuth(saved);
    }

    componentDidMount () {
        this.refresh();
    }

    handleGitProgress (progress) {
        if (!progress || !this.state.busy) return;

        const now = Date.now();
        if (now - this._lastProgressUpdate < 100) return;
        this._lastProgressUpdate = now;

        const completed = typeof progress.completed === 'number' ? progress.completed : null;
        const total = typeof progress.total === 'number' ? progress.total : null;
        const ratio = completed !== null && total && total > 0 ? Math.max(0, Math.min(1, completed / total)) : null;

        this.setState({
            busyMessage: progress.message || 'Working…',
            busyProgress: ratio
        });
    }

    async refresh () {
        this.setState({busy: true, busyMessage: 'Refreshing…', busyProgress: null, error: null});
        try {
            const status = await getRepoStatus(this.props.vm);
            // If a repo exists but has no commits, treat it like uninitialized
            // so the UI prompts to initialize (this covers partially-created
            // .git metadata without history).
            const hasCommits = Array.isArray(status.commits) && status.commits.length > 0;
            const graph = status.initialized ?
                (await computeCommitGraph({depth: 50})) :
                {branches: [], nodes: [], branchLogs: []};
            const remotes = status.initialized ? await getRemotes(this.props.vm) : [];
            const remoteNames = remotes.map(remote => remote.name);
            const nextPushRemote = remoteNames.indexOf(this.state.pushRemote) > -1 ?
                this.state.pushRemote :
                (remoteNames.indexOf('origin') > -1 ? 'origin' : (remoteNames[0] || ''));
            const nextPushBranch = status.branches.indexOf(this.state.pushBranch) > -1 ?
                this.state.pushBranch :
                (status.currentBranch || status.branches[0] || this.state.pushBranch || 'main');
            const remoteUrl = this.getRemoteUrl(nextPushRemote, remotes);
            const savedAuth = remoteUrl ? readSavedAuth()[remoteUrl] : null;

            const palette = [
                '#4db6ac', '#9575cd', '#64b5f6',
                '#f06292', '#ba68c8', '#4fc3f7',
                '#81c784', '#ffb74d', '#e57373'
            ];
            const branchColors = {};
            graph.branches.forEach((b, i) => {
                branchColors[b] = palette[i % palette.length];
            });
            this.setState({
                initialized: Boolean(status.initialized) && hasCommits,
                currentBranch: status.currentBranch,
                branches: status.branches,
                commits: status.commits,
                graphBranches: graph.branches,
                graphNodes: graph.nodes,
                graphBranchLogs: graph.branchLogs,
                branchColors,
                remotes,
                pushRemote: nextPushRemote,
                pushBranch: nextPushBranch,
                authUsername: savedAuth && typeof savedAuth.username === 'string' && !this.state.authUsername ?
                    savedAuth.username : this.state.authUsername,
                authToken: savedAuth && typeof savedAuth.token === 'string' && !this.state.authToken ?
                    savedAuth.token : this.state.authToken,
                disableCorsProxy: savedAuth && typeof savedAuth.disableCorsProxy === 'boolean' ?
                    savedAuth.disableCorsProxy : this.state.disableCorsProxy,
                changes: status.changes
            }, () => this.updateAuthorFromGitHubAuth());
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    handleRefresh () {
        this.refresh();
    }

    async handleInit () {
        this.setState({busy: true, busyMessage: 'Initializing repository…', busyProgress: 0, error: null});
        try {
            await initRepo({
                vm: this.props.vm,
                onProgress: this.handleGitProgress
            });
            await this.refresh();
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    async handleCommit () {
        const message = this.state.commitMessage.trim();
        if (!message) {
            this.setState({error: 'Commit message is required'});
            return;
        }

        this.setState({busy: true, busyMessage: 'Committing…', busyProgress: 0, error: null});
        try {
            await commitProject({
                vm: this.props.vm,
                message,
                author: this.getAuthor(),
                onProgress: this.handleGitProgress
            });
            this.setState({commitMessage: ''});
            await this.refresh();
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    async handleUndoCommit () {
        if (!this.state.initialized) return;
        if (!this.state.currentBranch) {
            this.setState({error: 'Cannot undo commit while detached. Check out a branch first.'});
            return;
        }

        if (!Array.isArray(this.state.commits) || this.state.commits.length < 2) {
            this.setState({error: 'No previous commit to undo to.'});
            return;
        }

        const head = this.state.commits[0];
        const previous = this.state.commits[1];

        this.setState({busy: true, busyMessage: 'Undoing commit…', busyProgress: null, error: null});
        try {
            const snapshot = await readSnapshotAtCommit(previous.oid);
            this.props.vm.quit();
            await this.props.vm.loadProject(snapshot);

            const headLine = head && head.commit && head.commit.message ? head.commit.message.split('\n')[0] : '';
            const undoMessage = `Undo: ${headLine || head.oid.slice(0, 7)}`;

            await commitProject({
                vm: this.props.vm,
                message: undoMessage,
                author: this.getAuthor(),
                onProgress: this.handleGitProgress
            });

            await this.refresh();
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    async handleCreateBranch () {
        const ref = this.state.newBranchName.trim();
        if (!ref) {
            this.setState({error: 'Branch name is required'});
            return;
        }

        this.setState({busy: true, busyMessage: 'Creating branch…', busyProgress: null, error: null});
        try {
            await createBranch({ref, vm: this.props.vm});
            await checkoutBranchAndRestore({vm: this.props.vm, ref});
            this.setState({newBranchName: ''});
            await this.refresh();
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    async handleCheckoutBranch (e) {
        const ref = e && e.target ? e.target.value : null;
        if (!ref) return;

        this.setState({busy: true, busyMessage: 'Checking out branch…', busyProgress: null, error: null});
        try {
            await checkoutBranchAndRestore({vm: this.props.vm, ref});
            await this.refresh();
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    async handleRestoreCommit (e) {
        const oid = e && e.currentTarget ? e.currentTarget.dataset.oid : null;
        if (!oid) return;

        this.setState({busy: true, busyMessage: 'Restoring commit…', busyProgress: null, error: null});
        try {
            await checkoutCommitAndRestore({vm: this.props.vm, oid});
            await this.refresh();
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    async handleDownloadCommit (e) {
        const oid = e && e.currentTarget ? e.currentTarget.dataset.oid : null;
        if (!oid) return;

        this.setState({busy: true, busyMessage: 'Preparing download…', busyProgress: null, error: null});
        try {
            const sb3ArrayBuffer = await readSnapshotAtCommit(oid);
            if (!sb3ArrayBuffer || sb3ArrayBuffer.byteLength === 0) {
                throw new Error('No project data found at this commit');
            }

            const short = oid.slice(0, 7);
            downloadBlob(`commit-${short}.sb3`, new Blob([sb3ArrayBuffer], {type: 'application/x.scratch.sb3'}));
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    async handleDeleteRepo () {
        this.setState({busy: true, busyMessage: 'Deleting repository…', busyProgress: null, error: null});
        try {
            await deleteRepo();
            await this.refresh();
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    async handleDeleteBranch (eOrRef) {
        let ref = null;
        if (typeof eOrRef === 'string') {
            ref = eOrRef;
        } else if (eOrRef && eOrRef.currentTarget) {
            ref = eOrRef.currentTarget.dataset.ref || null;
        }
        if (!ref) return;

        this.setState({busy: true, busyMessage: 'Deleting branch…', busyProgress: null, error: null});
        try {
            await deleteBranch(ref);
            await this.refresh();
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    handleClose () {
        this.props.onClose();
    }

    handleChangeCommitMessage (e) {
        this.setState({commitMessage: e.target.value});
    }

    handleChangeAuthorName (e) {
        this.setState({authorName: e.target.value});
    }

    handleChangeAuthorEmail (e) {
        this.setState({authorEmail: e.target.value});
    }

    handleChangeNewBranchName (e) {
        this.setState({newBranchName: e.target.value});
    }

    handleChangeMergeSourceBranch (e) {
        this.setState({mergeSourceBranch: e.target.value});
    }

    handleChangeRemoteName (e) {
        this.setState({remoteName: e.target.value});
    }

    handleChangeRemoteUrl (e) {
        const remoteUrl = e.target.value;
        this.setState({remoteUrl}, () => this.loadSavedAuthForRemote(''));
    }

    handleChangePushRemote (e) {
        const pushRemote = e.target.value;
        this.setState({pushRemote}, () => this.loadSavedAuthForRemote(pushRemote));
    }

    handleChangePushBranch (e) {
        this.setState({pushBranch: e.target.value});
    }

    handleChangeAuthUsername (e) {
        this.setState({authUsername: e.target.value}, () => {
            this.saveAuthForCurrentRemote();
            this.updateAuthorFromGitHubAuth();
        });
    }

    handleChangeAuthToken (e) {
        this.setState({authToken: e.target.value}, () => {
            this.saveAuthForCurrentRemote();
            this.updateAuthorFromGitHubAuth();
        });
    }

    handleChangeDisableCorsProxy (e) {
        this.setState({disableCorsProxy: e.target.checked}, () => this.saveAuthForCurrentRemote());
    }

    async handleAddRemote () {
        const name = this.state.remoteName.trim();
        const url = this.state.remoteUrl.trim();
        if (!name || !url) {
            this.setState({error: 'Remote name and URL are required'});
            return;
        }

        if (this.state.remotes.some(remote => remote.name === name)) {
            this.setState({error: `Remote "${name}" already exists. Delete it first or choose another name.`});
            return;
        }

        this.setState({busy: true, busyMessage: 'Adding remote…', busyProgress: null, error: null});
        try {
            await addRemote({vm: this.props.vm, name, url});
            this.setState({remoteUrl: '', pushRemote: name});
            await this.refresh();
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    async handleRemoveRemote (name) {
        if (!name) return;

        this.setState({busy: true, busyMessage: 'Removing remote…', busyProgress: null, error: null});
        try {
            await removeRemote({vm: this.props.vm, name});
            if (this.state.pushRemote === name) {
                this.setState({pushRemote: ''});
            }
            await this.refresh();
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    async handlePull () {
        let remote = (this.state.pushRemote || this.state.remoteUrl).trim();
        const branch = this.state.pushBranch.trim();
        if (!remote || !branch) {
            this.setState({error: 'Remote URL/name and branch are required'});
            return;
        }

        this.saveAuthForCurrentRemote();
        this.setState({busy: true, busyMessage: 'Pulling…', busyProgress: null, error: null});
        try {
            if (this.state.initialized && !this.state.pushRemote && this.state.remoteUrl.trim()) {
                const remoteName = this.state.remoteName.trim() || 'origin';
                if (!this.state.remotes.some(item => item.name === remoteName)) {
                    await addRemote({vm: this.props.vm, name: remoteName, url: this.state.remoteUrl.trim()});
                }
                remote = remoteName;
            }

            await pull({
                vm: this.props.vm,
                remote,
                branch,
                author: this.getAuthor(),
                disableCorsProxy: this.state.disableCorsProxy,
                onProgress: this.handleGitProgress,
                onAuth: () => {
                    const username = this.state.authUsername.trim();
                    const token = this.state.authToken;
                    if (!username && !token) return {};
                    return {
                        username: username || 'oauth2',
                        password: token
                    };
                },
                onAuthFailure: () => {
                    throw new Error('Authentication failed. Check your username and personal access token.');
                }
            });
            await this.refresh();
        } catch (err) {
            const message = err && err.message ? err.message : String(err);
            this.setState({error: `Pull failed: ${message}`});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    async handlePush () {
        const remote = this.state.pushRemote.trim();
        const branch = this.state.pushBranch.trim();
        if (!remote || !branch) {
            this.setState({error: 'Remote and branch are required'});
            return;
        }

        this.saveAuthForCurrentRemote();
        this.setState({busy: true, busyMessage: 'Pushing…', busyProgress: null, error: null});
        try {
            await push({
                vm: this.props.vm,
                remote,
                branch,
                disableCorsProxy: this.state.disableCorsProxy,
                onProgress: this.handleGitProgress,
                onAuth: () => {
                    const username = this.state.authUsername.trim();
                    const token = this.state.authToken;
                    if (!username && !token) return {};
                    return {
                        username: username || 'oauth2',
                        password: token
                    };
                },
                onAuthFailure: () => {
                    throw new Error('Authentication failed. Check your username and personal access token.');
                }
            });
            await this.refresh();
        } catch (err) {
            const message = err && err.message ? err.message : String(err);
            this.setState({error: `Push failed: ${message}`});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    async handlePreviewMerge () {
        const ours = this.state.currentBranch;
        const theirs = this.state.mergeSourceBranch;
        if (!ours || !theirs) return;
        if (ours === theirs) {
            this.setState({error: 'Select a different branch to merge.'});
            return;
        }
        this.setState({
            busy: true,
            busyMessage: 'Analyzing merge…',
            busyProgress: null,
            error: null,
            mergeConflicts: [],
            mergeResolutions: {}
        });
        try {
            const preview = await mergeBranchesPreview({ours, theirs});
            const conflicts = Array.isArray(preview.conflicts) ? preview.conflicts : [];
            this.setState({mergeConflicts: conflicts});
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    handleSetMergeResolution (path, choice) {
        if (!path) return;
        const c = choice === 'theirs' ? 'theirs' : 'ours';
        this.setState(prev => ({mergeResolutions: {...prev.mergeResolutions, [path]: c}}));
    }

    async handleApplyMerge () {
        const ours = this.state.currentBranch;
        const theirs = this.state.mergeSourceBranch;
        if (!ours || !theirs) return;
        this.setState({busy: true, busyMessage: 'Merging…', busyProgress: null, error: null});
        try {
            await mergeBranchesApply({
                ours,
                theirs,
                resolutions: this.state.mergeResolutions,
                author: this.getAuthor()
            });
            await restoreProjectFromCurrentRef(this.props.vm);
            this.setState({mergeConflicts: [], mergeResolutions: {}, mergeSourceBranch: ''});
            await this.refresh();
        } catch (err) {
            this.setState({error: err && err.message ? err.message : String(err)});
        } finally {
            this.setState({busy: false, busyMessage: null, busyProgress: null});
        }
    }

    render () {
        const canUndoCommit = Boolean(this.state.currentBranch) &&
            Array.isArray(this.state.commits) &&
            this.state.commits.length >= 2;

        return (
            <GitModalComponent
                busy={this.state.busy}
                busyMessage={this.state.busyMessage}
                busyProgress={this.state.busyProgress}
                error={this.state.error}
                initialized={this.state.initialized}
                currentBranch={this.state.currentBranch}
                branches={this.state.branches}
                commits={this.state.commits}
                graphBranches={this.state.graphBranches}
                graphNodes={this.state.graphNodes}
                graphBranchLogs={this.state.graphBranchLogs}
                branchColors={this.state.branchColors}
                commitMessage={this.state.commitMessage}
                authorName={this.state.authorName}
                authorEmail={this.state.authorEmail}
                newBranchName={this.state.newBranchName}
                mergeSourceBranch={this.state.mergeSourceBranch}
                mergeConflicts={this.state.mergeConflicts}
                mergeResolutions={this.state.mergeResolutions}
                canUndoCommit={canUndoCommit}
                onChangeCommitMessage={this.handleChangeCommitMessage}
                onChangeAuthorName={this.handleChangeAuthorName}
                onChangeAuthorEmail={this.handleChangeAuthorEmail}
                onChangeNewBranchName={this.handleChangeNewBranchName}
                onCheckoutBranch={this.handleCheckoutBranch}
                onCreateBranch={this.handleCreateBranch}
                onCommit={this.handleCommit}
                onUndoCommit={this.handleUndoCommit}
                onInit={this.handleInit}
                onRefresh={this.handleRefresh}
                onRestoreCommit={this.handleRestoreCommit}
                onDownloadCommit={this.handleDownloadCommit}
                onDeleteRepo={this.handleDeleteRepo}
                onDeleteBranch={this.handleDeleteBranch}
                onChangeMergeSourceBranch={this.handleChangeMergeSourceBranch}
                onPreviewMerge={this.handlePreviewMerge}
                onSetMergeResolution={this.handleSetMergeResolution}
                onApplyMerge={this.handleApplyMerge}
                remotes={this.state.remotes}
                remoteName={this.state.remoteName}
                remoteUrl={this.state.remoteUrl}
                pushRemote={this.state.pushRemote}
                pushBranch={this.state.pushBranch}
                authUsername={this.state.authUsername}
                authToken={this.state.authToken}
                disableCorsProxy={this.state.disableCorsProxy}
                onChangeRemoteName={this.handleChangeRemoteName}
                onChangeRemoteUrl={this.handleChangeRemoteUrl}
                onChangePushRemote={this.handleChangePushRemote}
                onChangePushBranch={this.handleChangePushBranch}
                onChangeAuthUsername={this.handleChangeAuthUsername}
                onChangeAuthToken={this.handleChangeAuthToken}
                onChangeDisableCorsProxy={this.handleChangeDisableCorsProxy}
                onAddRemote={this.handleAddRemote}
                onRemoveRemote={this.handleRemoveRemote}
                onPull={this.handlePull}
                onPush={this.handlePush}
                onClose={this.handleClose}
                changes={this.state.changes}
            />
        );
    }
}

TWGitModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeGitModal())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(TWGitModal);
