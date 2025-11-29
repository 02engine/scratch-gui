/**
 * Custom Addon Runtime
 * Provides runtime resources for custom addons
 */

import customAddonStorage from './custom-addon-storage.js';

// Cache for blob URLs to prevent recreating them
const blobURLCache = new Map();

/**
 * Get custom addon manifests for settings
 * @returns {Object} {addonId: manifest}
 */
export function getCustomAddonManifests() {
    return customAddonStorage.getAllManifests();
}

/**
 * Get runtime resources for a custom addon
 * @param {string} addonId - Addon ID
 * @returns {Promise<Object>} {resources: {filename: url}}
 */
export async function getCustomAddonResources(addonId) {
    // Check cache first
    if (blobURLCache.has(addonId)) {
        return { resources: blobURLCache.get(addonId) };
    }

    // Create blob URLs for addon files
    const blobURLs = await customAddonStorage.createBlobURLs(addonId);

    if (!blobURLs) {
        return null;
    }

    // Cache the blob URLs
    blobURLCache.set(addonId, blobURLs);

    return { resources: blobURLs };
}

/**
 * Check if an addon is a custom addon
 * @param {string} addonId - Addon ID
 * @returns {boolean}
 */
export function isCustomAddon(addonId) {
    return customAddonStorage.hasAddon(addonId);
}

/**
 * Get all custom addon IDs
 * @returns {Array<string>}
 */
export function getAllCustomAddonIds() {
    return customAddonStorage.getAllAddonIds();
}

/**
 * Remove a custom addon
 * @param {string} addonId - Addon ID
 * @returns {Promise<boolean>}
 */
export async function removeCustomAddon(addonId) {
    // Revoke blob URLs
    if (blobURLCache.has(addonId)) {
        const urls = blobURLCache.get(addonId);
        Object.values(urls).forEach(url => URL.revokeObjectURL(url));
        blobURLCache.delete(addonId);
    }

    // Remove from storage
    return await customAddonStorage.removeAddon(addonId);
}

/**
 * Clear blob URL cache (for cleanup)
 */
export function clearBlobURLCache() {
    blobURLCache.forEach(urls => {
        Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    });
    blobURLCache.clear();
}

/**
 * Reload a custom addon (recreate blob URLs)
 * @param {string} addonId - Addon ID
 */
export async function reloadCustomAddon(addonId) {
    // Clear cache for this addon
    if (blobURLCache.has(addonId)) {
        const urls = blobURLCache.get(addonId);
        Object.values(urls).forEach(url => URL.revokeObjectURL(url));
        blobURLCache.delete(addonId);
    }

    // Recreate blob URLs
    return await getCustomAddonResources(addonId);
}
