/**
 * Git diff utilities for file comparison
 * Integrates with isomorphic-git and MyersDiff
 */

import git from 'isomorphic-git';
import MyersDiff from './diff-utils.js';
import {getFs, REPO_DIR} from './browser-git.js';

const DIFF_LINE_COUNT_THRESHOLD = 1000;

export {MyersDiff};

/**
 * Get file contents for merge conflict resolution
 * @param {string} branchA - First branch (ours)
 * @param {string} branchB - Second branch (theirs)
 * @param {string} filepath - Path to file
 * @returns {Promise<{ours: string|null, theirs: string|null, base: string|null}>}
 */
export const getMergeFileContents = async ({branchA, branchB, filepath} = {}) => {
    if (!branchA || !branchB || !filepath) {
        throw new Error('Branch names and filepath are required');
    }

    const fs = getFs();
    const dir = REPO_DIR;

    try {
        const baseOid = await git.mergeBase({fs, dir, ours: branchA, theirs: branchB});

        const [oursContent, theirsContent, baseContent] = await Promise.all([
            getFileContentAtCommit({fs, dir, oid: branchA, filepath}),
            getFileContentAtCommit({fs, dir, oid: branchB, filepath}),
            baseOid ? getFileContentAtCommit({fs, dir, oid: baseOid, filepath}) : Promise.resolve({text: null})
        ]);

        return {
            ours: oursContent.text,
            theirs: theirsContent.text,
            base: baseContent.text
        };
    } catch (e) {
        console.error('Failed to get merge file contents:', e);
        return {
            ours: null,
            theirs: null,
            base: null
        };
    }
};

/**
 * Auto-merge non-conflicting changes between branches
 * @param {string} branchA - First branch (ours)
 * @param {string} branchB - Second branch (theirs)
 * @param {Array<{path: string, resolutions?: object}>} conflicts - List of conflicts
 * @returns {Promise<Array<{path: string, resolution: string}>>}
 */
export const autoMergeNonConflictingChanges = async ({branchA, branchB, conflicts} = {}) => {
    if (!branchA || !branchB) {
        throw new Error('Branch names are required');
    }

    const fs = getFs();
    const dir = REPO_DIR;

    try {
        const changedFiles = await getChangedFilesBetweenCommits({fs, dir, oidA: branchA, oidB: branchB});
        const resolutions = [];

        for (const file of changedFiles) {
            if (file.type === 'modified') {
                const {ours, theirs, base} = await getMergeFileContents({branchA, branchB, filepath: file.path});

                if (ours && theirs && base) {
                    const diffOurs = MyersDiff.compute(base, ours);
                    const diffTheirs = MyersDiff.compute(base, theirs);

                    const hasNoConflict = diffOurs.totalAdditions === 0 && diffTheirs.totalDeletions === 0 ||
                                      diffOurs.totalDeletions === 0 && diffTheirs.totalAdditions === 0;

                    if (hasNoConflict) {
                        resolutions.push({
                            path: file.path,
                            resolution: theirs
                        });
                    }
                }
            } else if (file.type === 'added') {
                resolutions.push({
                    path: file.path,
                    resolution: 'theirs'
                });
            }
        }

        return resolutions;
    } catch (e) {
        console.error('Failed to auto-merge:', e);
        return [];
    }
};

/**
 * Get file content at a specific commit
 * @param {object} fs - Filesystem object
 * @param {string} dir - Repository directory
 * @param {string} oid - Commit or tree OID
 * @param {string} filepath - Path to file (relative to repo root)
 * @returns {Promise<{text: string|null, oid: string|null}>}
 */
export const getFileContentAtCommit = async ({fs, dir, oid, filepath}) => {
    if (!fs || !dir || !oid || !filepath) {
        throw new Error('Missing required parameters');
    }

    try {
        const {blob} = await git.readBlob({fs, dir, oid, filepath});
        
        if (!blob) {
            return {text: null, oid: null};
        }

        const uint8Array = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
        let text;

        try {
            text = new TextDecoder().decode(uint8Array);
        } catch (e) {
            text = Array.from(uint8Array).map(b => String.fromCharCode(b))
                .join('');
        }

        return {text, oid: oid};
    } catch (e) {
        if (e && e.code === 'NotFoundError') {
            return {text: null, oid: null};
        }
        throw e;
    }
};

/**
 * Get the tree at a specific commit
 * @param {object} fs - Filesystem object
 * @param {string} dir - Repository directory
 * @param {string} commitOid - Commit OID
 * @returns {Promise<{oid: string, tree: object}>}
 */
export const getTreeAtCommit = async ({fs, dir, commitOid}) => {
    if (!fs || !dir || !commitOid) {
        throw new Error('Missing required parameters');
    }

    const {commit} = await git.readCommit({fs, dir, oid: commitOid});
    const treeOid = commit.tree;
    const {tree} = await git.readTree({fs, dir, oid: treeOid});

    return {oid: treeOid, tree, commit};
};

/**
 * List all files in a tree recursively
 * @param {object} fs - Filesystem object
 * @param {string} dir - Repository directory
 * @param {string} treeOid - Tree OID
 * @returns {Promise<Array<{path: string, mode: number, oid: string}>>}
 */
export const listFilesInTree = async ({fs, dir, treeOid, basePath = ''}) => {
    const files = [];
    const {tree} = await git.readTree({fs, dir, oid: treeOid});

    for (const entry of tree) {
        const fullPath = basePath ? `${basePath}/${entry.path}` : entry.path;

        if (entry.type === 'blob') {
            files.push({
                path: fullPath,
                mode: entry.mode,
                oid: entry.oid,
                type: 'blob'
            });
        } else if (entry.type === 'tree') {
            const subFiles = await listFilesInTree({fs, dir, treeOid: entry.oid, basePath: fullPath});
            files.push(...subFiles);
        }
    }

    return files;
};

/**
 * Get changed files between two commits
 * @param {object} fs - Filesystem object
 * @param {string} dir - Repository directory
 * @param {string} oidA - First commit OID
 * @param {string} oidB - Second commit OID
 * @returns {Promise<Array<{path: string, type: 'added'|'removed'|'modified', oidA: string|null, oidB: string|null}>>}
 */
export const getChangedFilesBetweenCommits = async ({fs, dir, oidA, oidB}) => {
    if (!fs || !dir || !oidA || !oidB) {
        throw new Error('Missing required parameters');
    }

    const treeA = await listFilesInTree({fs, dir, treeOid: (await git.readCommit({fs, dir, oid: oidA})).commit.tree});
    const treeB = await listFilesInTree({fs, dir, treeOid: (await git.readCommit({fs, dir, oid: oidB})).commit.tree});

    const mapA = new Map(treeA.map(f => [f.path, f]));
    const mapB = new Map(treeB.map(f => [f.path, f]));

    const changedFiles = [];

    const allPaths = new Set([...mapA.keys(), ...mapB.keys()]);

    for (const path of allPaths) {
        const fileA = mapA.get(path);
        const fileB = mapB.get(path);

        if (!fileA) {
            changedFiles.push({
                path,
                type: 'added',
                oidA: null,
                oidB: fileB.oid
            });
        } else if (!fileB) {
            changedFiles.push({
                path,
                type: 'removed',
                oidA: fileA.oid,
                oidB: null
            });
        } else if (fileA.oid !== fileB.oid) {
            changedFiles.push({
                path,
                type: 'modified',
                oidA: fileA.oid,
                oidB: fileB.oid
            });
        }
    }

    return changedFiles;
};

/**
 * Get parent commits of a commit
 * @param {object} fs - Filesystem object
 * @param {string} dir - Repository directory
 * @param {string} oid - Commit OID
 * @returns {Promise<string[]>} Array of parent OIDs
 */
export const getCommitParents = async ({fs, dir, oid}) => {
    try {
        const {commit} = await git.readCommit({fs, dir, oid});
        return Array.isArray(commit.parent) ? commit.parent : [commit.parent].filter(Boolean);
    } catch (e) {
        return [];
    }
};

/**
 * Check if diff computation should use a worker
 * @param {string} textA - First text
 * @param {string} textB - Second text
 * @returns {boolean}
 */
export const shouldUseWorker = (textA, textB) => {
    const linesA = textA.split('\n').length;
    const linesB = textB.split('\n').length;
    return linesA > DIFF_LINE_COUNT_THRESHOLD || linesB > DIFF_LINE_COUNT_THRESHOLD;
};

/**
 * Compute line diff between two texts
 * @param {string} contentA - Original content
 * @param {string} contentB - Modified content
 * @param {object} options - Options for diff computation
 * @param {boolean} options.ignoreWhitespace - Ignore whitespace changes
 * @param {Worker} options.worker - Web Worker to use for large diffs
 * @returns {Promise<DiffResult>}
 */
export const computeLineDiff = async (contentA, contentB, options = {}) => {
    const {ignoreWhitespace = false, worker} = options;

    let processedA = contentA || '';
    let processedB = contentB || '';

    if (ignoreWhitespace) {
        processedA = normalizeWhitespace(processedA);
        processedB = normalizeWhitespace(processedB);
    }

    if (shouldUseWorker(processedA, processedB) && worker) {
        return computeDiffWithWorker(worker, processedA, processedB);
    }

    return MyersDiff.compute(processedA, processedB);
};

/**
 * Normalize whitespace by removing leading/trailing and collapsing runs of spaces
 * @param {string} text
 * @returns {string}
 */
function normalizeWhitespace (text) {
    return text
        .split('\n')
        .map(line => line.trim().replace(/\s+/g, ' '))
        .join('\n');
}

/**
 * Compute diff using a Web Worker
 * @param {Worker} worker
 * @param {string} contentA
 * @param {string} contentB
 * @returns {Promise<DiffResult>}
 */
function computeDiffWithWorker (worker, contentA, contentB) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Diff computation timeout'));
            worker.terminate();
        }, 30000);

        worker.onmessage = e => {
            clearTimeout(timeout);
            resolve(e.data);
        };

        worker.onerror = e => {
            clearTimeout(timeout);
            reject(new Error(`Worker error: ${e.message}`));
        };

        worker.postMessage({
            type: 'compute-diff',
            contentA,
            contentB
        });
    });
}

/**
 * Get simplified change type comparison
 * @param {string} typeA
 * @param {string} typeB
 * @returns {string}
 */
export const getChangeType = (typeA, typeB) => {
    if (!typeA) return 'add';
    if (!typeB) return 'remove';
    if (typeA !== typeB) return 'modify';
    return 'none';
};

/**
 * Create a worker for diff computation
 * @returns {Worker}
 */
export const createDiffWorker = () => {
    const workerCode = `
        const MyersDiff = {
            compute(textA, textB) {
                const linesA = this.splitLines(textA);
                const linesB = this.splitLines(textB);

                if (linesA.length === 0 && linesB.length === 0) {
                    return {hunks: [], linesA: [], linesB: [], totalAdditions: 0, totalDeletions: 0};
                }

                if (linesA.length === 0) {
                    return this.createAddAllResult(linesB);
                }

                if (linesB.length === 0) {
                    return this.createRemoveAllResult(linesA);
                }

                const editScript = this.myersDiffAlgorithm(linesA, linesB);
                return this.convertToDiffHunks(linesA, linesB, editScript);
            },

            splitLines(text) {
                if (!text) return [];
                const lines = text.split('\\n');
                if (lines[lines.length - 1] === '') {
                    lines.pop();
                }
                return lines;
            },

            myersDiffAlgorithm(linesA, linesB) {
                const N = linesA.length;
                const M = linesB.length;
                const MAX = N + M;

                const V = new Int32Array(2 * MAX + 1);
                V[MAX] = 0;

                for (let D = 0; D <= MAX; D++) {
                    for (let k = -D; k <= D; k += 2) {
                        let x;
                        if (k === -D || (k !== D && V[MAX + k - 1] < V[MAX + k + 1])) {
                            x = V[MAX + k + 1];
                        } else {
                            x = V[MAX + k - 1] + 1;
                        }

                        let y = x - k;

                        while (x < N && y < M && linesA[x] === linesB[y]) {
                            x++;
                            y++;
                        }

                        V[MAX + k] = x;

                        if (x >= N && y >= M) {
                            return this.backtrace(V, D, N, M, MAX, linesA, linesB);
                        }
                    }
                }
                return [];
            },

            backtrace(V, D, N, M, offset, linesA, linesB) {
                const result = [];
                let x = N, y = M;
                let k = x - y;

                for (; D > 0; D--) {
                    let prevK;
                    if (k === -D || (k !== D && V[offset + k - 1] < V[offset + k + 1])) {
                        prevK = k + 1;
                    } else {
                        prevK = k - 1;
                    }

                    const prevX = V[offset + prevK];
                    const prevY = prevX - prevK;

                    while (x > prevX && y > prevY) {
                        result.unshift({type: 'same', lineA: x - 1, lineB: y - 1});
                        x--;
                        y--;
                    }

                    if (x > prevX) {
                        result.unshift({type: 'remove', lineA: x - 1, lineB: y});
                        x--;
                    } else if (y > prevY) {
                        result.unshift({type: 'add', lineA: x, lineB: y - 1});
                        y--;
                    }

                    k = prevK;
                }

                while (x > 0 && y > 0) {
                    result.unshift({type: 'same', lineA: x - 1, lineB: y - 1});
                    x--;
                    y--;
                }

                return result;
            },

            convertToDiffHunks(linesA, linesB, editScript) {
                const hunks = [];
                let currentHunk = null;

                for (const change of editScript) {
                    if (change.type === 'same') {
                        if (currentHunk) {
                            hunks.push(currentHunk);
                            currentHunk = null;
                        }
                        continue;
                    }

                    if (!currentHunk) {
                        currentHunk = {
                            oldStart: change.lineA + 1,
                            oldLines: 0,
                            newStart: change.lineB + 1,
                            newLines: 0,
                            changes: []
                        };
                    }

                    if (change.type === 'remove') {
                        currentHunk.oldLines++;
                        currentHunk.changes.push({
                            type: 'remove',
                            content: linesA[change.lineA],
                            lineA: change.lineA,
                            lineB: null
                        });
                    } else if (change.type === 'add') {
                        currentHunk.newLines++;
                        currentHunk.changes.push({
                            type: 'add',
                            content: linesB[change.lineB],
                            lineA: null,
                            lineB: change.lineB
                        });
                    }
                }

                if (currentHunk) {
                    hunks.push(currentHunk);
                }

                return {
                    hunks,
                    linesA,
                    linesB,
                    totalAdditions: editScript.filter(c => c.type === 'add').length,
                    totalDeletions: editScript.filter(c => c.type === 'remove').length
                };
            },

            createAddAllResult(linesB) {
                const changes = linesB.map((line, i) => ({
                    type: 'add',
                    content: line,
                    lineA: null,
                    lineB: i
                }));

                return {
                    hunks: [{
                        oldStart: 1,
                        oldLines: 0,
                        newStart: 1,
                        newLines: linesB.length,
                        changes
                    }],
                    linesA: [],
                    linesB,
                    totalAdditions: linesB.length,
                    totalDeletions: 0
                };
            },

            createRemoveAllResult(linesA) {
                const changes = linesA.map((line, i) => ({
                    type: 'remove',
                    content: line,
                    lineA: i,
                    lineB: null
                }));

                return {
                    hunks: [{
                        oldStart: 1,
                        oldLines: linesA.length,
                        newStart: 1,
                        newLines: 0,
                        changes
                    }],
                    linesA,
                    linesB: [],
                    totalAdditions: 0,
                    totalDeletions: linesA.length
                };
            }
        };

        onmessage = (e) => {
            const {type, contentA, contentB} = e.data;
            if (type === 'compute-diff') {
                const result = MyersDiff.compute(contentA, contentB);
                postMessage(result);
            }
        };
    `;

    const blob = new Blob([workerCode], {type: 'application/javascript'});
    return new Worker(URL.createObjectURL(blob));
};
