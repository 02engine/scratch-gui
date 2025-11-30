/**
 * Custom Addon Loader
 * Handles loading addons from folders and ZIP files
 */

import JSZip from '@turbowarp/jszip';
import customAddonStorage from './custom-addon-storage.js';
import {
    validateManifest,
    validateAddonId,
    validateFiles,
    normalizeManifest
} from './custom-addon-validator.js';

/**
 * Load addon from folder (file list)
 * @param {FileList|Array} fileList - Files from folder
 * @returns {Promise<Object>} {success: boolean, addonId: string, error: string}
 */
export async function loadFromFolder(fileList) {
    try {
        // Convert FileList to array
        const files = Array.from(fileList);

        if (files.length === 0) {
            return {
                success: false,
                error: 'No files found in the selected folder'
            };
        }

        // Get folder name
        const firstFile = files[0];
        const folderName = firstFile.webkitRelativePath ?
            firstFile.webkitRelativePath.split('/')[0] :
            'custom-addon';

        // Try to find addon.json
        const manifestFile = files.find(f => f.name === 'addon.json' || f.webkitRelativePath.endsWith('/addon.json'));

        let manifest;
        if (manifestFile) {
            // Read and parse existing manifest
            const manifestText = await readFileAsText(manifestFile);
            try {
                manifest = JSON.parse(manifestText);
            } catch (e) {
                return {
                    success: false,
                    error: `Invalid JSON in addon.json: ${e.message}`
                };
            }
        } else {
            // Auto-generate manifest from folder name
            manifest = {
                name: folderName,
                description: `Custom addon: ${folderName}`,
                tags: ['custom'],
                userscripts: [],
                userstyles: [],
                enabledByDefault: true
            };

            // Auto-detect userscripts and userstyles
            for (const file of files) {
                let relativePath;
                if (file.webkitRelativePath) {
                    // Remove root folder from path
                    const parts = file.webkitRelativePath.split('/');
                    parts.shift(); // Remove root folder
                    relativePath = parts.join('/');
                } else {
                    relativePath = file.name;
                }

                if (!relativePath) continue;

                if (relativePath.endsWith('.js')) {
                    manifest.userscripts.push({ url: relativePath });
                } else if (relativePath.endsWith('.css')) {
                    manifest.userstyles.push({ url: relativePath });
                }
            }
        }

        // Generate addon ID from folder name or manifest
        const addonId = manifest.id || folderName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

        // Validate addon ID
        const idValidation = validateAddonId(addonId);
        if (!idValidation.valid) {
            return {
                success: false,
                error: `Invalid addon ID: ${idValidation.error}`
            };
        }

        // Validate manifest
        const manifestValidation = validateManifest(manifest);
        if (!manifestValidation.valid) {
            return {
                success: false,
                error: `Invalid manifest:\n${manifestValidation.errors.join('\n')}`
            };
        }

        // Read all files
        const addonFiles = {};
        const basePathLength = firstFile.webkitRelativePath ?
            firstFile.webkitRelativePath.indexOf('/') + 1 :
            0;

        for (const file of files) {
            let relativePath;
            if (file.webkitRelativePath) {
                relativePath = file.webkitRelativePath.substring(basePathLength);
            } else {
                relativePath = file.name;
            }

            if (relativePath === 'addon.json') {
                continue; // Already processed
            }

            // Read file content based on type
            if (relativePath.match(/\.(js|css|json)$/)) {
                addonFiles[relativePath] = await readFileAsText(file);
            } else if (relativePath.match(/\.(svg|png|jpg|jpeg)$/)) {
                addonFiles[relativePath] = await readFileAsDataURL(file);
            }
        }

        // Validate files
        const filesValidation = validateFiles(addonFiles, manifest);
        if (!filesValidation.valid) {
            return {
                success: false,
                error: `Invalid files:\n${filesValidation.errors.join('\n')}`
            };
        }

        // Normalize manifest
        const normalizedManifest = normalizeManifest(manifest);

        // Check for conflicts
        if (customAddonStorage.hasAddon(addonId)) {
            const confirmed = await confirm(
                `Addon "${addonId}" already exists. Do you want to replace it?`
            );
            if (!confirmed) {
                return {
                    success: false,
                    error: 'Installation cancelled by user'
                };
            }
        }

        // Save addon
        await customAddonStorage.saveAddon(addonId, normalizedManifest, addonFiles);

        return {
            success: true,
            addonId,
            manifest: normalizedManifest
        };

    } catch (error) {
        console.error('Error loading addon from folder:', error);
        return {
            success: false,
            error: `Failed to load addon: ${error.message}`
        };
    }
}

/**
 * Load addon from ZIP file
 * @param {File} zipFile - ZIP file
 * @returns {Promise<Object>} {success: boolean, addonId: string, error: string}
 */
export async function loadFromZip(zipFile) {
    try {
        // Load ZIP
        const zip = await JSZip.loadAsync(zipFile);

        // Get ZIP name for default ID
        const zipName = zipFile.name.replace(/\.zip$/i, '');

        // Try to find addon.json
        let manifestEntry = null;
        let basePath = '';

        for (const [path, entry] of Object.entries(zip.files)) {
            if (path.endsWith('addon.json') && !entry.dir) {
                manifestEntry = entry;
                basePath = path.substring(0, path.length - 'addon.json'.length);
                break;
            }
        }

        let manifest;
        if (manifestEntry) {
            // Read and parse existing manifest
            const manifestText = await manifestEntry.async('text');
            try {
                manifest = JSON.parse(manifestText);
            } catch (e) {
                return {
                    success: false,
                    error: `Invalid JSON in addon.json: ${e.message}`
                };
            }
        } else {
            // Auto-generate manifest from ZIP name
            manifest = {
                name: zipName,
                description: `Custom addon: ${zipName}`,
                tags: ['custom'],
                userscripts: [],
                userstyles: [],
                enabledByDefault: true
            };

            // Find base path (first directory in ZIP)
            for (const path of Object.keys(zip.files)) {
                if (path.includes('/')) {
                    basePath = path.substring(0, path.indexOf('/') + 1);
                    break;
                }
            }

            // Auto-detect userscripts and userstyles
            for (const [path, entry] of Object.entries(zip.files)) {
                if (entry.dir || !path.startsWith(basePath)) continue;
                const fileName = path.substring(basePath.length);
                if (!fileName) continue;

                if (fileName.endsWith('.js')) {
                    manifest.userscripts.push({ url: fileName });
                } else if (fileName.endsWith('.css')) {
                    manifest.userstyles.push({ url: fileName });
                }
            }
        }

        // Generate addon ID
        const addonId = manifest.id || zipName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

        // Validate addon ID
        const idValidation = validateAddonId(addonId);
        if (!idValidation.valid) {
            return {
                success: false,
                error: `Invalid addon ID: ${idValidation.error}`
            };
        }

        // Validate manifest
        const manifestValidation = validateManifest(manifest);
        if (!manifestValidation.valid) {
            return {
                success: false,
                error: `Invalid manifest:\n${manifestValidation.errors.join('\n')}`
            };
        }

        // Read all files
        const addonFiles = {};

        for (const [path, entry] of Object.entries(zip.files)) {
            if (entry.dir || !path.startsWith(basePath)) {
                continue;
            }

            const relativePath = path.substring(basePath.length);
            if (relativePath === 'addon.json' || relativePath === '') {
                continue;
            }

            // Read file content based on type
            if (relativePath.match(/\.(js|css|json)$/)) {
                addonFiles[relativePath] = await entry.async('text');
            } else if (relativePath.match(/\.(svg|png|jpg|jpeg)$/)) {
                const blob = await entry.async('blob');
                addonFiles[relativePath] = await blobToDataURL(blob);
            }
        }

        // Validate files
        const filesValidation = validateFiles(addonFiles, manifest);
        if (!filesValidation.valid) {
            return {
                success: false,
                error: `Invalid files:\n${filesValidation.errors.join('\n')}`
            };
        }

        // Normalize manifest
        const normalizedManifest = normalizeManifest(manifest);

        // Check for conflicts
        if (customAddonStorage.hasAddon(addonId)) {
            const confirmed = window.confirm(
                `Addon "${addonId}" already exists. Do you want to replace it?`
            );
            if (!confirmed) {
                return {
                    success: false,
                    error: 'Installation cancelled by user'
                };
            }
        }

        // Save addon
        await customAddonStorage.saveAddon(addonId, normalizedManifest, addonFiles);

        return {
            success: true,
            addonId,
            manifest: normalizedManifest
        };

    } catch (error) {
        console.error('Error loading addon from ZIP:', error);
        return {
            success: false,
            error: `Failed to load addon: ${error.message}`
        };
    }
}

/**
 * Helper: Read file as text
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

/**
 * Helper: Read file as data URL
 */
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/**
 * Helper: Convert blob to data URL
 */
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
