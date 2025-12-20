import ScratchStorage from '@turbowarp/scratch-storage';

import defaultProject from './default-project';

/**
 * Wrapper for ScratchStorage which adds default web sources.
 * @todo make this more configurable
 */
class Storage extends ScratchStorage {
    constructor () {
        super();
        this.CUSTOM_DEFAULT_PROJECT_KEY = 'scratch-gui.customDefaultProject';
        this.cacheDefaultProject();
    }
    addOfficialScratchWebStores () {
        this.addWebStore(
            [this.AssetType.Project],
            this.getProjectGetConfig.bind(this),
            this.getProjectCreateConfig.bind(this),
            this.getProjectUpdateConfig.bind(this)
        );
        this.addWebStore(
            [this.AssetType.ImageVector, this.AssetType.ImageBitmap, this.AssetType.Sound, this.AssetType.Font],
            this.getAssetGetConfig.bind(this),
            // We set both the create and update configs to the same method because
            // storage assumes it should update if there is an assetId, but the
            // asset store uses the assetId as part of the create URI.
            this.getAssetCreateConfig.bind(this),
            this.getAssetCreateConfig.bind(this)
        );
    }
    setProjectHost (projectHost) {
        this.projectHost = projectHost;
    }
    setProjectToken (projectToken) {
        this.projectToken = projectToken;
    }
    getProjectGetConfig (projectAsset) {
        const path = `${this.projectHost}/${projectAsset.assetId}`;
        const qs = this.projectToken ? `?token=${this.projectToken}` : '';
        return path + qs;
    }
    getProjectCreateConfig () {
        return {
            url: `${this.projectHost}/`,
            withCredentials: true
        };
    }
    getProjectUpdateConfig (projectAsset) {
        return {
            url: `${this.projectHost}/${projectAsset.assetId}`,
            withCredentials: true
        };
    }
    setAssetHost (assetHost) {
        this.assetHost = assetHost;
    }
    getAssetGetConfig (asset) {
        return `${this.assetHost}/internalapi/asset/${asset.assetId}.${asset.dataFormat}/get/`;
    }
    getAssetCreateConfig (asset) {
        return {
            // There is no such thing as updating assets, but storage assumes it
            // should update if there is an assetId, and the asset store uses the
            // assetId as part of the create URI. So, force the method to POST.
            // Then when storage finds this config to use for the "update", still POSTs
            method: 'post',
            url: `${this.assetHost}/${asset.assetId}.${asset.dataFormat}`,
            withCredentials: true
        };
    }
    setTranslatorFunction (translator) {
        this.translator = translator;
        this.cacheDefaultProject();
    }
    setCustomDefaultProject (projectData) {
        // projectData should be ArrayBuffer of SB3 file
        try {
            console.log('setCustomDefaultProject received projectData:', typeof projectData, projectData.byteLength);
            if (!projectData || projectData.byteLength === 0) {
                console.error('Project data is empty');
                return;
            }
            const uint8Array = new Uint8Array(projectData);
            console.log('Uint8Array length:', uint8Array.length);
            const dataArray = Array.from(uint8Array);
            console.log('Array length:', dataArray.length);
            const storageData = JSON.stringify({
                data: dataArray
            });
            console.log('Storage data string length:', storageData.length);
            localStorage.setItem(this.CUSTOM_DEFAULT_PROJECT_KEY, storageData);
            console.log('Saved to localStorage, key:', this.CUSTOM_DEFAULT_PROJECT_KEY);
            
            // Verify the stored data
            const stored = localStorage.getItem(this.CUSTOM_DEFAULT_PROJECT_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                console.log('Verified stored data array length:', parsed.data ? parsed.data.length : 0);
            }
            
            this.cacheDefaultProject();
        } catch (error) {
            console.error('Failed to save custom default project:', error);
        }
    }
    removeCustomDefaultProject () {
        try {
            localStorage.removeItem(this.CUSTOM_DEFAULT_PROJECT_KEY);
            this.cacheDefaultProject();
        } catch (error) {
            console.error('Failed to remove custom default project:', error);
        }
    }
    cacheDefaultProject () {
        // Check for custom default project in localStorage
        let customProjectData = null;
        try {
            const stored = localStorage.getItem(this.CUSTOM_DEFAULT_PROJECT_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.data && Array.isArray(parsed.data)) {
                    customProjectData = new Uint8Array(parsed.data).buffer;
                    console.log('Loaded custom default project from localStorage, size:', customProjectData.byteLength);
                }
            }
        } catch (error) {
            console.error('Failed to load custom default project:', error);
        }

        if (customProjectData && customProjectData.byteLength > 0) {
            // Use custom default project
            console.log('Using custom default project');
            const asset = {
                id: 0,
                assetType: 'Project',
                dataFormat: 'JSON',
                data: customProjectData
            };
            this.builtinHelper._store(
                this.AssetType[asset.assetType],
                this.DataFormat[asset.dataFormat],
                asset.data,
                asset.id
            );
        } else {
            // Use built-in default project
            console.log('Using built-in default project');
            const defaultProjectAssets = defaultProject(this.translator);
            defaultProjectAssets.forEach(asset => this.builtinHelper._store(
                this.AssetType[asset.assetType],
                this.DataFormat[asset.dataFormat],
                asset.data,
                asset.id
            ));
        }
    }
}

const storage = new Storage();

export default storage;
