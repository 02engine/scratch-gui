import {gentlyRequestPersistentStorage} from './tw-persistent-storage';

const DATABASE_NAME = 'TW_EditorBackground';
const DATABASE_VERSION = 1;
const STORE_NAME = 'editorBackground';
const STORE_KEY = 'current';

let _db;

const openDB = () => new Promise((resolve, reject) => {
    if (_db) {
        resolve(_db);
        return;
    }

    if (typeof indexedDB === 'undefined') {
        reject(new Error('indexedDB is not supported'));
        return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
        }
    };

    request.onsuccess = event => {
        _db = event.target.result;
        resolve(_db);
    };

    request.onerror = event => {
        reject(new Error(`Editor background DB error: ${event.target.error}`));
    };
});

const savePersistentEditorBackgroundBlob = async blob => {
    gentlyRequestPersistentStorage();
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.onerror = event => {
            reject(new Error(`Saving editor background: ${event.target.error}`));
        };
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(blob, STORE_KEY);
        request.onsuccess = () => resolve();
    });
};

const loadPersistentEditorBackgroundBlob = async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        transaction.onerror = event => {
            reject(new Error(`Loading editor background: ${event.target.error}`));
        };
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(STORE_KEY);
        request.onsuccess = () => resolve(request.result || null);
    });
};

const clearPersistentEditorBackgroundBlob = async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.onerror = event => {
            reject(new Error(`Clearing editor background: ${event.target.error}`));
        };
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(STORE_KEY);
        request.onsuccess = () => resolve();
    });
};

const createPersistentEditorBackgroundURL = blob => (
    (typeof URL !== 'undefined' && blob) ? URL.createObjectURL(blob) : null
);

const revokePersistentEditorBackgroundURL = url => {
    if (typeof URL === 'undefined' || typeof url !== 'string' || !url.startsWith('blob:')) {
        return;
    }
    URL.revokeObjectURL(url);
};

export {
    clearPersistentEditorBackgroundBlob,
    createPersistentEditorBackgroundURL,
    loadPersistentEditorBackgroundBlob,
    revokePersistentEditorBackgroundURL,
    savePersistentEditorBackgroundBlob
};
