import JSZip from 'jszip';

import {
    deleteRepo,
    exportRepoToGitJsonString,
    importRepoFromGitJsonString
} from './browser-git.js';

const GIT_META_KEY = 'git';
const LEGACY_GIT_META_KEY = 'mwGit';

const getGitDataFromProjectJson = projectJson => {
    if (!projectJson || !projectJson.meta || !projectJson.meta.platform) return null;
    return projectJson.meta.platform[GIT_META_KEY] || projectJson.meta.platform[LEGACY_GIT_META_KEY] || null;
};

const extractGitDataFromSb3 = async sb3Data => {
    if (!sb3Data) return null;

    try {
        const zip = await JSZip.loadAsync(sb3Data);
        const projectFile = zip.file('project.json');
        if (!projectFile) return null;

        const projectJson = JSON.parse(await projectFile.async('string'));
        return getGitDataFromProjectJson(projectJson);
    } catch (e) {
        // Non-SB3 project data should not block normal loading.
        return null;
    }
};

const restoreGitDataFromSb3 = async sb3Data => {
    const gitData = await extractGitDataFromSb3(sb3Data);
    if (!gitData) {
        await deleteRepo();
        return false;
    }

    try {
        await importRepoFromGitJsonString(JSON.stringify(gitData));
        return true;
    } catch (e) {
        await deleteRepo();
        return false;
    }
};

const appendGitDataToSb3 = async (sb3Data, type = 'blob') => {
    const gitJsonString = await exportRepoToGitJsonString();
    if (!gitJsonString) return sb3Data;

    let gitData;
    try {
        gitData = JSON.parse(gitJsonString);
    } catch (e) {
        return sb3Data;
    }

    const zip = await JSZip.loadAsync(sb3Data);
    const projectFile = zip.file('project.json');
    if (!projectFile) return sb3Data;

    const projectJson = JSON.parse(await projectFile.async('string'));
    projectJson.meta = projectJson.meta || {};
    projectJson.meta.platform = projectJson.meta.platform || {};
    projectJson.meta.platform[GIT_META_KEY] = gitData;
    delete projectJson.meta.platform[LEGACY_GIT_META_KEY];

    zip.file('project.json', JSON.stringify(projectJson));

    return zip.generateAsync({
        type,
        mimeType: 'application/x.scratch.sb3'
    });
};

export {
    appendGitDataToSb3,
    extractGitDataFromSb3,
    restoreGitDataFromSb3,
    GIT_META_KEY
};
