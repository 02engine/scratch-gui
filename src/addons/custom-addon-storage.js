/**
 * Custom Addon Storage Manager
 * Manages persistent storage of custom addons using LocalStorage and IndexedDB
 */

const DB_NAME = 'CustomAddonsDB';
const DB_VERSION = 1;
const STORE_NAME = 'addonFiles';
const LOCALSTORAGE_KEY = 'customAddonsMetadata';

class CustomAddonStorage {
    constructor() {
        this.db = null;
        this.initPromise = this.initDB();
    }

    /**
     * Initialize IndexedDB
     */
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }

    /**
     * Save a custom addon
     * @param {string} id - Addon ID
     * @param {Object} manifest - Addon manifest
     * @param {Object} files - File contents {filename: content}
     */
    async saveAddon(id, manifest, files) {
        await this.initPromise;

        // Save files to IndexedDB
        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const filePromises = Object.entries(files).map(([filename, content]) => {
            const key = `${id}/${filename}`;
            return new Promise((resolve, reject) => {
                const request = store.put(content, key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        });

        await Promise.all(filePromises);

        // Save metadata to LocalStorage
        const metadata = this.getMetadata();
        metadata[id] = {
            manifest,
            fileNames: Object.keys(files),
            installTime: Date.now(),
            enabled: true
        };
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(metadata));

        return true;
    }

    /**
     * Get an addon's data
     * @param {string} id - Addon ID
     * @returns {Object} {manifest, files}
     */
    async getAddon(id) {
        await this.initPromise;

        const metadata = this.getMetadata();
        const addonMeta = metadata[id];

        if (!addonMeta) {
            return null;
        }

        // Retrieve files from IndexedDB
        const transaction = this.db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        const files = {};
        const filePromises = addonMeta.fileNames.map(filename => {
            const key = `${id}/${filename}`;
            return new Promise((resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => {
                    files[filename] = request.result;
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        });

        await Promise.all(filePromises);

        return {
            manifest: addonMeta.manifest,
            files,
            enabled: addonMeta.enabled,
            installTime: addonMeta.installTime
        };
    }

    /**
     * Remove an addon
     * @param {string} id - Addon ID
     */
    async removeAddon(id) {
        await this.initPromise;

        const metadata = this.getMetadata();
        const addonMeta = metadata[id];

        if (!addonMeta) {
            return false;
        }

        // Remove files from IndexedDB
        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const deletePromises = addonMeta.fileNames.map(filename => {
            const key = `${id}/${filename}`;
            return new Promise((resolve, reject) => {
                const request = store.delete(key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        });

        await Promise.all(deletePromises);

        // Remove metadata
        delete metadata[id];
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(metadata));

        return true;
    }

    /**
     * Get all custom addon IDs
     * @returns {Array<string>}
     */
    getAllAddonIds() {
        const metadata = this.getMetadata();
        return Object.keys(metadata);
    }

    /**
     * Get all custom addon manifests
     * @returns {Object} {addonId: manifest}
     */
    getAllManifests() {
        const metadata = this.getMetadata();
        const manifests = {};
        for (const [id, data] of Object.entries(metadata)) {
            manifests[id] = data.manifest;
        }
        return manifests;
    }

    /**
     * Check if an addon exists
     * @param {string} id - Addon ID
     * @returns {boolean}
     */
    hasAddon(id) {
        const metadata = this.getMetadata();
        return id in metadata;
    }

    /**
     * Set addon enabled state
     * @param {string} id - Addon ID
     * @param {boolean} enabled - Enabled state
     */
    setAddonEnabled(id, enabled) {
        const metadata = this.getMetadata();
        if (metadata[id]) {
            metadata[id].enabled = enabled;
            localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(metadata));
            return true;
        }
        return false;
    }

    /**
     * Get metadata from LocalStorage
     * @private
     */
    getMetadata() {
        try {
            const data = localStorage.getItem(LOCALSTORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error('Error reading custom addons metadata:', e);
            return {};
        }
    }

    /**
     * Create blob URLs for addon files
     * @param {string} id - Addon ID
     * @returns {Object} {filename: blobURL}
     */
    async createBlobURLs(id) {
        const addon = await this.getAddon(id);
        if (!addon) return null;

        const blobURLs = {};
        for (const [filename, content] of Object.entries(addon.files)) {
            let mimeType = 'text/plain';
            if (filename.endsWith('.js')) {
                mimeType = 'application/javascript';
            } else if (filename.endsWith('.css')) {
                mimeType = 'text/css';
            } else if (filename.endsWith('.svg')) {
                mimeType = 'image/svg+xml';
            } else if (filename.endsWith('.png')) {
                mimeType = 'image/png';
            }

            const blob = new Blob([content], { type: mimeType });
            blobURLs[filename] = URL.createObjectURL(blob);
        }

        return blobURLs;
    }
}

// Create singleton instance
const customAddonStorage = new CustomAddonStorage();

export default customAddonStorage;
