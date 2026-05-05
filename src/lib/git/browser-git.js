import LightningFS from '@isomorphic-git/lightning-fs';
import http from 'isomorphic-git/http/web';
import git, {Errors} from 'isomorphic-git';
import JSZip from 'jszip';


import {
    clearWorkingTree,
    writeProjectToWorkingTree
} from './project-working-tree.js';

const FS_NAME = 'bilup-git';

// Global formatter function and intl object (can be set by calling code)
let globalFormatMessage = null;
let globalIntl = null;

const getFormattedMessage = (messageKey, defaultText) => {
    // First, try to use the intl object's messages directly
    if (globalIntl && globalIntl.messages && typeof globalIntl.messages === 'object') {
        const translated = globalIntl.messages[messageKey];
        if (translated && typeof translated === 'string') {
            return translated;
        }
    }
    
    // Fallback: try using formatMessage function
    if (globalFormatMessage && typeof globalFormatMessage === 'function') {
        try {
            const result = globalFormatMessage({id: messageKey, defaultMessage: defaultText});
            if (result && result !== messageKey) {
                return result;
            }
        } catch (e) {
            console.warn('Failed to format message:', messageKey, e);
        }
    }
    return defaultText;
};

const setFormatMessage = (formatter) => {
    globalFormatMessage = formatter;
};

const setIntl = (intlObject) => {
    globalIntl = intlObject;
};
const REPO_DIR = '/repo';
const SNAPSHOT_FILE = 'project.sb3';
const EXPORT_VERSION = 1;

let tempGitJsonString = null;

const uint8ToBase64 = uint8 => {
    if (!uint8 || uint8.length === 0) return '';
    
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < uint8.length; i += chunkSize) {
        const chunk = uint8.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
};

const base64ToUint8 = base64 => {
    if (!base64 || typeof base64 !== 'string') return new Uint8Array(0);
    
    try {
        const binary = atob(base64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            out[i] = binary.charCodeAt(i);
        }
        return out;
    } catch (e) {
        console.error('Failed to decode base64:', e);
        return new Uint8Array(0);
    }
};

let fsSingleton = null;
let shouldWipeOnStart = true;

const getFs = () => {
    if (!fsSingleton) {
        fsSingleton = new LightningFS(FS_NAME, {wipe: shouldWipeOnStart});
        shouldWipeOnStart = false;
    }
    return fsSingleton;
};

const pathJoin = (...parts) => parts
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/\//g, '/');

const exists = async (pfs, filePath) => {
    if (!pfs || typeof pfs.stat !== 'function') {
        throw new Error('Invalid filesystem object');
    }
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path');
    }
    
    try {
        await pfs.stat(filePath);
        return true;
    } catch (e) {
        return false;
    }
};
const ensureDir = async (pfs, dirPath) => {
    if (!pfs || typeof pfs.mkdir !== 'function') {
        throw new Error('Invalid filesystem object');
    }
    if (!dirPath || typeof dirPath !== 'string') {
        throw new Error('Invalid directory path');
    }
    
    try {
        await pfs.mkdir(dirPath);
    } catch (e) {
        if (e.code !== 'EEXIST') {
            throw e;
        }
    }
};

const removeRecursive = async (pfs, filePath) => {
    if (!pfs || !filePath || typeof filePath !== 'string') {
        return;
    }
    
    let stat;
    try {
        stat = await pfs.stat(filePath);
    } catch (e) {
        // File doesn't exist, nothing to remove
        return;
    }

    if (stat.isDirectory()) {
        const entries = await pfs.readdir(filePath);
        await Promise.all(entries.map(entry => removeRecursive(pfs, `${filePath}/${entry}`)));
        try {
            await pfs.rmdir(filePath);
        } catch (e) {
            // Directory might not be empty or have permission issues
            console.warn('Failed to remove directory:', filePath, e);
        }
        return;
    }

    try {
        await pfs.unlink(filePath);
    } catch (e) {
        // File might be locked or have permission issues
        console.warn('Failed to remove file:', filePath, e);
    }
};

const ensureParentDir = async (pfs, filePath) => {
    const parts = filePath.split('/').filter(Boolean);
    parts.pop();
    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : `/${part}`;
        await ensureDir(pfs, current);
    }
};

const stageAll = async (fs, dir, {onProgress} = {}) => {
    if (!fs || !dir || typeof dir !== 'string') {
        throw new Error('Invalid filesystem or directory');
    }
    
    if (typeof onProgress === 'function') {
        onProgress({phase: 'status', message: getFormattedMessage('tw.git.computing', 'Computing file status…'), completed: 0, total: 1});
    }

    const matrix = await git.statusMatrix({fs, dir});
    const rows = matrix.filter(row => row && row[0] !== '.gitignore');
    const total = Math.max(1, rows.length);
    let completed = 0;
    let lastReport = 0;

    const report = () => {
        if (typeof onProgress !== 'function') return;
        const now = Date.now();
        if (now - lastReport < 100 && completed < total) return;
        lastReport = now;
        onProgress({
            phase: 'stage',
            message: getFormattedMessage('tw.git.staging', 'Staging files…'),
            completed,
            total
        });
    };

    report();
    
    // Process files in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await Promise.all(batch.map(async row => {
            if (!row || row.length < 3) return;
            
            const [filepath, head, workdir] = row;
            if (!filepath) return;
            
            try {
                if (workdir === 0) {
                    if (head !== 0) {
                        await git.remove({fs, dir, filepath});
                    }
                } else {
                    await git.add({fs, dir, filepath});
                }
            } catch (e) {
                console.warn('Failed to stage file:', filepath, e);
            }
            report();
        }));
        completed += batch.length;
        
        // Yield control to browser between batches
        if (i + batchSize < rows.length) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
};

const getDefaultAuthor = () => {
    try {
        const saved = JSON.parse(localStorage.getItem('mw:git-author') || 'null');
        if (saved && typeof saved.name === 'string' && typeof saved.email === 'string') {
            return saved;
        }
    } catch (e) {
        // ignore
    }
    return {name: 'User', email: 'user@example.com'};
};

const setDefaultAuthor = author => {
    try {
        localStorage.setItem('mw:git-author', JSON.stringify(author));
    } catch (e) {
        // ignore
    }
};

const repoExists = () => {
    const fs = getFs();
    const pfs = fs.promises;
    return exists(pfs, pathJoin(REPO_DIR, '.git'));
};

const listFilesRecursive = async (pfs, rootDir) => {
    const out = [];
    const walk = async currentDir => {
        const entries = await pfs.readdir(currentDir);
        for (const entry of entries) {
            const full = `${currentDir}/${entry}`;
            const stat = await pfs.stat(full);
            if (stat.isDirectory()) {
                await walk(full);
            } else {
                out.push(full);
            }
        }
    };
    await walk(rootDir);
    return out;
};

const exportRepoToGitJsonString = async () => {
    const fs = getFs();
    const pfs = fs.promises;
    
    if (!(await repoExists())) {
        return null;
    }

    try {
        const gitDir = pathJoin(REPO_DIR, '.git');
        const files = await listFilesRecursive(pfs, gitDir);
        const entries = await Promise.all(files.map(async filePath => {
            try {
                const data = await pfs.readFile(filePath);
                const view = data instanceof Uint8Array ? data : new Uint8Array(data);
                return {
                    path: filePath.replace(`${REPO_DIR}/`, ''),
                    encoding: 'base64',
                    data: uint8ToBase64(view)
                };
            } catch (e) {
                console.warn('Failed to read file for export:', filePath, e);
                return null;
            }
        }));

        // Filter out null entries from failed reads
        const validEntries = entries.filter(entry => entry !== null);

        return JSON.stringify({
            version: EXPORT_VERSION,
            repoDir: REPO_DIR,
            entries: validEntries
        });
    } catch (e) {
        throw new Error(`Failed to export repository: ${e.message}`);
    }
};

const initRepo = async ({defaultBranch = 'main', vm = null, onProgress} = {}) => {
    if (!defaultBranch || typeof defaultBranch !== 'string') {
        throw new Error('Invalid branch name');
    }
    
    const fs = getFs();
    const pfs = fs.promises;
    await ensureDir(pfs, REPO_DIR);

    const already = await repoExists();
    if (!already) {
        if (typeof onProgress === 'function') {
            onProgress({phase: 'init', message: getFormattedMessage('tw.git.initializing', 'Initializing repository…'), completed: 0, total: 1});
        }
        
        try {
            await git.init({fs, dir: REPO_DIR, defaultBranch});
            await pfs.writeFile(pathJoin(REPO_DIR, '.gitignore'), '');
            await git.add({fs, dir: REPO_DIR, filepath: '.gitignore'});

            if (vm) {
                if (typeof onProgress === 'function') {
                    onProgress({phase: 'snapshot', message: getFormattedMessage('tw.git.savingSnapshot', 'Saving project snapshot…'), completed: 0, total: 1});
                }
                
                if (typeof vm.saveProjectSb3 !== 'function') {
                    throw new Error('VM does not support saveProjectSb3');
                }
                
                const sb3ArrayBuffer = await vm.saveProjectSb3('arraybuffer');
                if (!sb3ArrayBuffer || sb3ArrayBuffer.byteLength === 0) {
                    throw new Error('Failed to save project snapshot');
                }
                
                await pfs.writeFile(pathJoin(REPO_DIR, SNAPSHOT_FILE), new Uint8Array(sb3ArrayBuffer));
                await writeProjectToWorkingTree({vm, fs: pfs, dir: REPO_DIR, onProgress});
                await stageAll(fs, REPO_DIR, {onProgress});
            }

            await git.commit({
                fs,
                dir: REPO_DIR,
                message: getFormattedMessage('tw.git.initialCommit', 'Initial commit'),
                author: getDefaultAuthor()
            });
            tempGitJsonString = await exportRepoToGitJsonString();
        } catch (e) {
            // Clean up partial initialization on error
            try {
                await removeRecursive(pfs, REPO_DIR);
            } catch (cleanupError) {
                console.warn('Failed to clean up after initialization error:', cleanupError);
            }
            throw e;
        }
    }

    return {
        fs,
        dir: REPO_DIR
    };
};

const readSnapshot = async () => {
    const fs = getFs();
    const pfs = fs.promises;
    const snapshotPath = pathJoin(REPO_DIR, SNAPSHOT_FILE);
    
    if (!(await exists(pfs, snapshotPath))) {
        throw new Error('Project snapshot not found');
    }
    
    try {
        const data = await pfs.readFile(snapshotPath);
        const view = data instanceof Uint8Array ? data : new Uint8Array(data);
        return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    } catch (e) {
        throw new Error(`Failed to read project snapshot: ${e.message}`);
    }
};

const readSnapshotAtCommit = async oid => {
    if (!oid || typeof oid !== 'string') {
        throw new Error('Invalid commit OID');
    }
    
    const fs = getFs();
    try {
        const {blob} = await git.readBlob({fs, dir: REPO_DIR, oid, filepath: SNAPSHOT_FILE});
        const view = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
        return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    } catch (e) {
        throw new Error(`Failed to read snapshot at commit ${oid}: ${e.message}`);
    }
};

const restoreProjectFromCurrentRef = async vm => {
    if (!vm) throw new Error('VM is required');
    if (!(await repoExists())) throw new Error('Repository not initialized');
    
    try {
        const snapshot = await readSnapshot();
        
        if (typeof vm.quit !== 'function') {
            throw new Error('VM does not support quit method');
        }
        if (typeof vm.loadProject !== 'function') {
            throw new Error('VM does not support loadProject method');
        }
        
        vm.quit();
        await vm.loadProject(snapshot, {skipGitImport: true});
    } catch (e) {
        throw new Error(`Failed to restore project: ${e.message}`);
    }
};

const describeRepoChange = ([, head, workdir, stage]) => {
    if (head === 1 && workdir === 2 && stage === 1) return 'modified';
    if (head === 0 && workdir === 2) return 'untracked';
    if (head === 1 && stage === 2) return 'staged';
    if (head === 1 && workdir === 0) return 'deleted';
    return 'unmodified';
};

const getRepoChanges = async vm => {
    if (!(await repoExists())) {
        throw new Error('Repository not initialized');
    }
    const fs = getFs();
    const pfs = fs.promises;
    const dir = REPO_DIR;
    await writeProjectToWorkingTree({vm, fs: pfs, dir});
    const status = await git.statusMatrix({
        fs,
        dir
    });
    return status.map(row => {
        const [filepath] = row;
        const description = describeRepoChange(row);
        return {
            filepath,
            description
        };
    })
        .filter(v => v.description !== 'unmodified');
};

const getRepoStatus = async vm => {
    const fs = getFs();
    const pfs = fs.promises;
    const initialized = await exists(pfs, pathJoin(REPO_DIR, '.git'));
    if (!initialized) {
        return {
            initialized: false,
            currentBranch: null,
            branches: [],
            commits: [],
            changes: []
        };
    }

    const currentBranch = await git.currentBranch({fs, dir: REPO_DIR, fullname: false});
    const branches = await git.listBranches({fs, dir: REPO_DIR});
    const commits = await git.log({fs, dir: REPO_DIR, depth: 20});
    const changes = await getRepoChanges(vm);

    return {
        initialized: true,
        currentBranch,
        branches,
        commits,
        changes
    };
};

const createBranch = async ({ref} = {}) => {
    if (!ref || typeof ref !== 'string') {
        throw new Error('Invalid branch name');
    }
    
    if (!/^[a-zA-Z0-9._/-]+$/.test(ref) || ref.startsWith('/') || ref.endsWith('/') || ref.includes('//')) {
        throw new Error('Invalid branch name format');
    }
    
    const fs = getFs();
    const pfs = fs.promises;

    if (!(await exists(pfs, pathJoin(REPO_DIR, '.git')))) {
        throw new Error('Repository not initialized');
    }

    try {
        await git.resolveRef({fs, dir: REPO_DIR, ref: 'HEAD'});
    } catch (e) {
        throw new Error('Cannot create branch: HEAD is missing. Initialize or check out a commit.');
    }

    try {
        await git.branch({fs, dir: REPO_DIR, ref});
    } catch (e) {
        throw new Error(`Failed to create branch ${ref}: ${e.message}`);
    }
    tempGitJsonString = await exportRepoToGitJsonString();
    return 'ok';
};

const checkoutBranch = async ref => {
    if (!ref || typeof ref !== 'string') {
        throw new Error('Invalid branch reference');
    }
    
    const fs = getFs();
    try {
        await git.checkout({fs, dir: REPO_DIR, ref, force: true});
    } catch (e) {
        throw new Error(`Failed to checkout branch ${ref}: ${e.message}`);
    }
    return 'ok';
};

const checkoutCommit = async oid => {
    if (!oid || typeof oid !== 'string') {
        throw new Error('Invalid commit OID');
    }
    
    const fs = getFs();
    try {
        await git.checkout({fs, dir: REPO_DIR, ref: oid, force: true});
    } catch (e) {
        throw new Error(`Failed to checkout commit ${oid}: ${e.message}`);
    }
    return 'ok';
};

const checkoutBranchAndRestore = async ({vm, ref}) => {
    await checkoutBranch(ref);
    await restoreProjectFromCurrentRef(vm);
    return 'ok';
};

const checkoutCommitAndRestore = async ({vm, oid}) => {
    await checkoutCommit(oid);
    await restoreProjectFromCurrentRef(vm);
    return 'ok';
};

const addRemote = async ({vm, name, url}) => {
    if (!vm) {
        throw new Error('VM is required');
    }

    const fs = getFs();

    if (!(await repoExists())) {
        await initRepo({defaultBranch: 'main', vm: vm});
    }

    await git.addRemote({fs, dir: REPO_DIR, remote: name, url});
};

const removeRemote = async ({vm, name}) => {
    if (!vm) {
        throw new Error('VM is required');
    }

    const fs = getFs();

    if (!(await repoExists())) {
        await initRepo({defaultBranch: 'main', vm: vm});
    }

    await git.deleteRemote({fs, dir: REPO_DIR, name});
};

const getRemotes = async vm => {
    if (!vm) {
        throw new Error('VM is required');
    }

    const fs = getFs();

    if (!(await repoExists())) {
        await initRepo({defaultBranch: 'main', vm: vm});
    }

    const remotes = await git.listRemotes({fs, dir: REPO_DIR});

    return remotes.map(remote => ({
        name: remote.remote || remote.name,
        url: remote.url
    }));
};

const push = async ({vm, remote, branch, onAuth, onAuthFailure, disableCorsProxy, ...options}) => {
    if (!vm) {
        throw new Error('VM is required');
    }

    const fs = getFs();

    if (!(await repoExists())) {
        await initRepo({defaultBranch: 'main', vm: vm});
    }

    const pushOptions = {
        fs, 
        http, 
        dir: REPO_DIR, 
        remote, 
        branch,
        ...options
    };
    
    // Use CORS proxy for public repos, but it may not work with authentication
    // For authenticated pushes, we rely on the server having proper CORS headers
    // User can disable CORS proxy if needed
    if (!disableCorsProxy) {
        pushOptions.corsProxy = 'https://cors.isomorphic-git.org';
    }
    
    if (onAuth) {
        pushOptions.onAuth = onAuth;
    }
    
    if (onAuthFailure) {
        pushOptions.onAuthFailure = onAuthFailure;
    }

    await git.push(pushOptions);
};

const hasUncommittedChanges = async fs => {
    const matrix = await git.statusMatrix({fs, dir: REPO_DIR});
    return matrix.some(row => {
        if (!row || row[0] === '.gitignore') return false;
        const head = row[1];
        const workdir = row[2];
        const stage = row.length >= 4 ? row[3] : workdir;
        return head !== workdir || head !== stage;
    });
};

const looksLikeRemoteUrl = remote => /^https?:\/\//i.test(remote);

const pull = async ({vm, remote, branch, author, onAuth, onAuthFailure, disableCorsProxy, ...options}) => {
    if (!vm) {
        throw new Error('VM is required');
    }

    if (!remote || typeof remote !== 'string') {
        throw new Error('Remote is required');
    }

    if (!branch || typeof branch !== 'string') {
        throw new Error('Branch is required');
    }

    const fs = getFs();

    const authOptions = {
        fs,
        http,
        ...options
    };

    if (!disableCorsProxy) {
        authOptions.corsProxy = 'https://cors.isomorphic-git.org';
    }

    if (onAuth) {
        authOptions.onAuth = onAuth;
    }

    if (onAuthFailure) {
        authOptions.onAuthFailure = onAuthFailure;
    }

    if (!(await repoExists())) {
        if (!looksLikeRemoteUrl(remote)) {
            throw new Error('Remote URL is required to pull into a new project');
        }

        await deleteRepo();
        await ensureDir(fs.promises, REPO_DIR);
        await git.clone({
            ...authOptions,
            dir: REPO_DIR,
            url: remote,
            ref: branch,
            singleBranch: true,
            noCheckout: false
        });
        await restoreProjectFromCurrentRef(vm);
        tempGitJsonString = await exportRepoToGitJsonString();
        return;
    }

    if (await hasUncommittedChanges(fs)) {
        throw new Error('Commit or discard local changes before pulling');
    }

    await git.pull({
        ...authOptions,
        dir: REPO_DIR,
        remote,
        ref: branch,
        singleBranch: true,
        author: author || getDefaultAuthor()
    });

    await restoreProjectFromCurrentRef(vm);
    tempGitJsonString = await exportRepoToGitJsonString();
};

const commitProject = async ({vm, message, author, onProgress} = {}) => {
    if (!message || typeof message !== 'string' || !message.trim()) {
        throw new Error('Commit message is required');
    }
    
    if (!vm) {
        throw new Error('VM is required');
    }
    
    const fs = getFs();
    const pfs = fs.promises;

    if (!(await repoExists())) {
        await initRepo({defaultBranch: 'main', vm: vm});
    }

    if (typeof vm.saveProjectSb3 !== 'function' || typeof vm.loadProject !== 'function') {
        throw new Error('VM does not support save/load project');
    }

    let sb3ArrayBuffer;
    
    try {
        sb3ArrayBuffer = await vm.saveProjectSb3('arraybuffer');
        if (!sb3ArrayBuffer || sb3ArrayBuffer.byteLength === 0) {
            throw new Error('Failed to save project');
        }
    } catch (e) {
        throw new Error(`Failed to save project: ${e.message}`);
    }

    if (typeof onProgress === 'function') {
        onProgress({phase: 'snapshot', message: getFormattedMessage('tw.git.savingSnapshot', 'Saving project snapshot…'), completed: 0, total: 1});
    }

    try {
        await clearWorkingTree({pfs, dir: REPO_DIR});
        await pfs.writeFile(pathJoin(REPO_DIR, SNAPSHOT_FILE), new Uint8Array(sb3ArrayBuffer));
        await writeProjectToWorkingTree({vm, fs: pfs, dir: REPO_DIR, onProgress});

        // Ensure any new files are discoverable by isomorphic-git (it uses callback fs,
        // but LightningFS mirrors state).
        await stageAll(fs, REPO_DIR, {onProgress});

        // After staging, ensure there are changes to commit.
        // If there are no differences, abort the commit.
        const matrixAfter = await git.statusMatrix({fs, dir: REPO_DIR});
        const rowsAfter = matrixAfter.filter(row => row && row[0] !== '.gitignore');
        const hasChanges = rowsAfter.some(row => {
            // statusMatrix rows can be [path, HEAD, WORKDIR] or [path, HEAD, WORKDIR, STAGE]
            const head = row[1];
            if (row.length >= 4) {
                const stage = row[3];
                return head !== stage;
            }
            const workdir = row[2];
            return head !== workdir;
        });

        if (!hasChanges) {
            throw new Error('No changes to commit');
        }

        const effectiveAuthor = author || getDefaultAuthor();
        if (author) setDefaultAuthor(author);

        if (typeof onProgress === 'function') {
            onProgress({phase: 'commit', message: getFormattedMessage('tw.git.commit', 'Creating commit…'), completed: 1, total: 1});
        }

        
        const ret = await git.commit({
            fs,
            dir: REPO_DIR,
            message: message.trim(),
            author: effectiveAuthor
        });
        tempGitJsonString = await exportRepoToGitJsonString();
        return ret;
    } catch (e) {
        throw new Error(`Failed to commit: ${e.message}`);
    }
};

const deleteRepo = async () => {
    const fs = getFs();
    const pfs = fs.promises;
    if (!(await exists(pfs, REPO_DIR))) return;
    await removeRecursive(pfs, REPO_DIR);
    tempGitJsonString = await exportRepoToGitJsonString();
};

const deleteBranch = async ref => {
    if (!ref || typeof ref !== 'string') {
        throw new Error('Invalid branch name');
    }
    
    const fs = getFs();
    try {
        const currentBranch = await git.currentBranch({fs, dir: REPO_DIR, fullname: false});
        if (currentBranch && currentBranch === ref) {
            throw new Error('Cannot delete the currently checked out branch');
        }
        await git.deleteBranch({fs, dir: REPO_DIR, ref});
    } catch (e) {
        throw new Error(`Failed to delete branch ${ref}: ${e.message}`);
    }
    tempGitJsonString = await exportRepoToGitJsonString();
};

const listBranches = async () => {
    const fs = getFs();
    try {
        return await git.listBranches({fs, dir: REPO_DIR});
    } catch (e) {
        throw new Error(`Failed to list branches: ${e.message}`);
    }
};

const mergeBranchesPreview = async ({ours, theirs} = {}) => {
    if (!ours || !theirs || typeof ours !== 'string' || typeof theirs !== 'string') {
        throw new Error('Invalid branches for merge');
    }
    const fs = getFs();
    try {
        const result = await git.merge({
            fs,
            dir: REPO_DIR,
            ours,
            theirs,
            abortOnConflict: false,
            dryRun: true
        });
        return {
            result,
            conflicts: []
        };
    } catch (e) {
        if (Errors && e instanceof Errors.MergeConflictError) {
            const conflicts = Array.isArray(e.data) ? e.data : [];
            return {
                result: null,
                conflicts
            };
        }
        throw new Error(`Failed to preview merge: ${e.message}`);
    }
};

const mergeBranchesApply = async ({ours, theirs, resolutions, author} = {}) => {
    if (!ours || !theirs || typeof ours !== 'string' || typeof theirs !== 'string') {
        throw new Error('Invalid branches for merge');
    }
    const fs = getFs();
    const map = resolutions && typeof resolutions === 'object' ? resolutions : {};
    const mergeDriver = ({path, contents}) => {
        const choice = map[path];
        const useOurs = choice === 'ours';
        const useTheirs = choice === 'theirs';
        const mergedText = useOurs ? contents[1] : (useTheirs ? contents[2] : contents[1]);
        return {cleanMerge: true, mergedText};
    };
    const res = await git.merge({
        fs,
        dir: REPO_DIR,
        ours,
        theirs,
        abortOnConflict: true,
        author: author || getDefaultAuthor(),
        mergeDriver
    });
    return res;
};

const getBranchLogs = async ({depth = 50} = {}) => {
    const fs = getFs();
    const branches = await git.listBranches({fs, dir: REPO_DIR});
    const out = [];
    for (const b of branches) {
        const commits = await git.log({fs, dir: REPO_DIR, ref: b, depth});
        out.push({branch: b, commits});
    }
    return out;
};

const computeCommitGraph = async ({depth = 50} = {}) => {
    const fs = getFs();
    const branches = await git.listBranches({fs, dir: REPO_DIR});
    const logs = await getBranchLogs({depth});
    const map = new Map();
    for (const entry of logs) {
        for (const c of entry.commits) {
            const key = c.oid;
            if (!map.has(key)) {
                const parents = Array.isArray(c.commit.parent) ?
                    c.commit.parent :
                    (Array.isArray(c.commit.parents) ?
                        c.commit.parents : []);
                map.set(key, {oid: c.oid, commit: c.commit, branches: new Set(), parents});
            }
            map.get(key).branches.add(entry.branch);
        }
    }
    const nodes = Array.from(map.values())
        .map(n => ({oid: n.oid, commit: n.commit, branches: Array.from(n.branches), parents: n.parents}))
        .sort((a, b) => (b.commit.author.timestamp || 0) - (a.commit.author.timestamp || 0));
    const branchLogs = logs.map(l => ({branch: l.branch, oids: l.commits.map(c => c.oid)}));
    return {branches, nodes, branchLogs};
};

const exportRepoToGitJsonStringSync = () => tempGitJsonString || null;

const importRepoFromGitJsonString = async gitJsonString => {
    if (!gitJsonString || typeof gitJsonString !== 'string') {
        throw new Error('Invalid git.json data');
    }

    let parsed;
    try {
        parsed = JSON.parse(gitJsonString);
    } catch (e) {
        throw new Error(`Invalid git.json format: ${e.message}`);
    }

    if (!parsed || parsed.version !== EXPORT_VERSION || !Array.isArray(parsed.entries)) {
        throw new Error('Unsupported git.json format');
    }

    const hasHeadsRefs = parsed.entries.some(entry => (
        entry && typeof entry.path === 'string' && entry.path.startsWith('.git/refs/heads/')
    ));
    const hasPackedRefs = parsed.entries.some(entry => (
        entry && typeof entry.path === 'string' && entry.path === '.git/packed-refs'
    ));

    // If no heads or packed-refs are present, the export is incomplete. Avoid
    // replacing the existing repo to prevent losing branch information.
    if (!hasHeadsRefs && !hasPackedRefs) {
        return;
    }

    const fs = getFs();
    const pfs = fs.promises;
    
    try {
        await deleteRepo();
        await ensureDir(pfs, REPO_DIR);

        for (const entry of parsed.entries) {
            if (!entry || typeof entry.path !== 'string' || entry.encoding !== 'base64') {
                console.warn('Skipping invalid entry:', entry);
                continue;
            }
            
            try {
                const filePath = pathJoin(REPO_DIR, entry.path);
                await ensureParentDir(pfs, filePath);
                await pfs.writeFile(filePath, base64ToUint8(entry.data || ''));
            } catch (e) {
                console.warn('Failed to write file during import:', entry.path, e);
            }
        }

        const branches = await listBranches();
        const ref = branches.includes('main') ? 'main' : branches[0];

        if (ref) {
            await git.checkout({fs, dir: REPO_DIR, ref, force: true});
        }

        tempGitJsonString = await exportRepoToGitJsonString();
    } catch (e) {
        // Clean up on import failure
        try {
            await deleteRepo();
        } catch (cleanupError) {
            console.warn('Failed to clean up after import error:', cleanupError);
        }
        throw new Error(`Failed to import repository: ${e.message}`);
    }
};

const exportRepoToZip = async ({includeGitDir = true} = {}) => {
    const fs = getFs();
    const pfs = fs.promises;

    if (!(await repoExists())) {
        throw new Error('Repository not initialized');
    }

    const zip = new JSZip();
    const root = REPO_DIR;

    const files = await listFilesRecursive(pfs, root);

    for (const absPath of files) {
        if (!includeGitDir && absPath.startsWith(`${REPO_DIR}/.git/`)) {
            continue;
        }

        const relPath = absPath.replace(`${REPO_DIR}/`, '');

        try {
            const data = await pfs.readFile(absPath);
            const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

            zip.file(relPath, bytes);
        } catch (e) {
            console.warn('Skipping file during zip export:', relPath, e);
        }
    }

    return zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {level: 6}
    });
};

const downloadRepoZip = async options => {
    const blob = await exportRepoToZip(options);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project-repo.zip';
    a.click();
    URL.revokeObjectURL(url);
};

const commitSb3 = async ({
    sb3ArrayBuffer,
    message,
    author,
    onProgress,
    vm
} = {}) => {
    if (!sb3ArrayBuffer || !(sb3ArrayBuffer instanceof ArrayBuffer)) {
        throw new Error('Invalid SB3 buffer');
    }
    if (!message || !message.trim()) {
        throw new Error('Commit message is required');
    }

    const fs = getFs();
    const pfs = fs.promises;

    if (!(await repoExists())) {
        await initRepo({defaultBranch: 'main'});
    }

    if (typeof onProgress === 'function') {
        onProgress({phase: 'snapshot', message: getFormattedMessage('tw.git.writingSnapshot', 'Writing SB3 snapshot…')});
    }

    await clearWorkingTree({pfs, dir: REPO_DIR});
    await pfs.writeFile(
        pathJoin(REPO_DIR, SNAPSHOT_FILE),
        new Uint8Array(sb3ArrayBuffer)
    );

    // IMPORTANT: this assumes writeProjectToWorkingTree
    // already supports extracting from project.sb3
    await writeProjectToWorkingTree({
        fs: pfs,
        dir: REPO_DIR,
        onProgress,
        vm: vm
    });

    await stageAll(fs, REPO_DIR, {onProgress});

    const authorUsed = author || getDefaultAuthor();
    if (author) setDefaultAuthor(author);

    const oid = await git.commit({
        fs,
        dir: REPO_DIR,
        message: message.trim(),
        author: authorUsed
    });

    tempGitJsonString = await exportRepoToGitJsonString();
    return oid;
};

const pickSb3File = () => new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sb,.sb2,.sb3,.json';

    input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return reject(new Error(getFormattedMessage('tw.git.noFileSelected', 'No file selected')));
        resolve(file);
    };

    input.click();
});

const pickAndCommitSb3 = async ({
    message,
    author,
    onProgress,
    vm
}) => {
    const file = await pickSb3File();
    const buffer = await file.arrayBuffer();

    return commitSb3({
        sb3ArrayBuffer: buffer,
        message,
        author,
        onProgress,
        vm
    });
};

export {
    getDefaultAuthor,
    setDefaultAuthor,
    setFormatMessage,
    setIntl,
    ensureParentDir,
    getRepoStatus,
    getRepoChanges,
    getFs,
    initRepo,
    repoExists,
    createBranch,
    checkoutBranch,
    checkoutBranchAndRestore,
    listBranches,
    checkoutCommitAndRestore,
    restoreProjectFromCurrentRef,
    readSnapshotAtCommit,
    getBranchLogs,
    computeCommitGraph,
    exportRepoToGitJsonString,
    exportRepoToGitJsonStringSync,
    importRepoFromGitJsonString,
    deleteRepo,
    deleteBranch,
    commitProject,
    mergeBranchesPreview,
    mergeBranchesApply,
    addRemote,
    removeRemote,
    getRemotes,
    push,
    pull,
    exportRepoToZip,
    downloadRepoZip,
    commitSb3,
    pickAndCommitSb3,
    REPO_DIR,
    git
};
