/**
 * Custom Addon Validator
 * Validates addon manifests and files
 */

/**
 * Validate addon manifest
 * @param {Object} manifest - Addon manifest
 * @returns {Object} {valid: boolean, errors: Array<string>}
 */
export function validateManifest(manifest) {
    const errors = [];

    // Required fields
    if (!manifest) {
        return { valid: false, errors: ['Manifest is missing'] };
    }

    if (!manifest.name || typeof manifest.name !== 'string') {
        errors.push('Missing or invalid "name" field');
    }

    if (!manifest.description || typeof manifest.description !== 'string') {
        errors.push('Missing or invalid "description" field');
    }

    // Optional but validated if present
    if (manifest.tags && !Array.isArray(manifest.tags)) {
        errors.push('Field "tags" must be an array');
    }

    if (manifest.userscripts && !Array.isArray(manifest.userscripts)) {
        errors.push('Field "userscripts" must be an array');
    }

    if (manifest.userstyles && !Array.isArray(manifest.userstyles)) {
        errors.push('Field "userstyles" must be an array');
    }

    if (manifest.settings && !Array.isArray(manifest.settings)) {
        errors.push('Field "settings" must be an array');
    }

    // Validate userscripts
    if (manifest.userscripts) {
        manifest.userscripts.forEach((script, index) => {
            if (!script.url || typeof script.url !== 'string') {
                errors.push(`Userscript ${index}: missing or invalid "url" field`);
            }
        });
    }

    // Validate userstyles
    if (manifest.userstyles) {
        manifest.userstyles.forEach((style, index) => {
            if (!style.url || typeof style.url !== 'string') {
                errors.push(`Userstyle ${index}: missing or invalid "url" field`);
            }
        });
    }

    // Validate settings
    if (manifest.settings) {
        manifest.settings.forEach((setting, index) => {
            if (!setting.id || typeof setting.id !== 'string') {
                errors.push(`Setting ${index}: missing or invalid "id" field`);
            }
            if (!setting.name || typeof setting.name !== 'string') {
                errors.push(`Setting ${index}: missing or invalid "name" field`);
            }
            if (!setting.type || typeof setting.type !== 'string') {
                errors.push(`Setting ${index}: missing or invalid "type" field`);
            }
            const validTypes = ['boolean', 'integer', 'positive_integer', 'string', 'color', 'select'];
            if (setting.type && !validTypes.includes(setting.type)) {
                errors.push(`Setting ${index}: invalid type "${setting.type}"`);
            }
        });
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate addon ID
 * @param {string} id - Addon ID
 * @returns {Object} {valid: boolean, error: string}
 */
export function validateAddonId(id) {
    if (!id || typeof id !== 'string') {
        return { valid: false, error: 'ID must be a non-empty string' };
    }

    // ID should be lowercase with hyphens only
    if (!/^[a-z0-9-]+$/.test(id)) {
        return { valid: false, error: 'ID must contain only lowercase letters, numbers, and hyphens' };
    }

    if (id.length < 3 || id.length > 50) {
        return { valid: false, error: 'ID must be between 3 and 50 characters' };
    }

    return { valid: true };
}

/**
 * Validate file structure
 * @param {Object} files - File map {filename: content}
 * @param {Object} manifest - Addon manifest
 * @returns {Object} {valid: boolean, errors: Array<string>}
 */
export function validateFiles(files, manifest) {
    const errors = [];

    // Check if all referenced userscripts exist
    if (manifest.userscripts) {
        manifest.userscripts.forEach(script => {
            if (!files[script.url]) {
                errors.push(`Referenced userscript "${script.url}" not found in files`);
            }
        });
    }

    // Check if all referenced userstyles exist
    if (manifest.userstyles) {
        manifest.userstyles.forEach(style => {
            if (!files[style.url]) {
                errors.push(`Referenced userstyle "${style.url}" not found in files`);
            }
        });
    }

    // Check file types
    Object.entries(files).forEach(([filename, content]) => {
        if (!content || (typeof content !== 'string' && !(content instanceof ArrayBuffer))) {
            errors.push(`File "${filename}" has invalid content`);
        }

        // Validate file extensions
        const validExtensions = ['.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg'];
        const hasValidExtension = validExtensions.some(ext => filename.toLowerCase().endsWith(ext));
        if (!hasValidExtension) {
            errors.push(`File "${filename}" has unsupported extension`);
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Normalize manifest to standard format
 * @param {Object} manifest - Raw manifest
 * @returns {Object} Normalized manifest
 */
export function normalizeManifest(manifest) {
    const normalized = {
        name: manifest.name || 'Unnamed Addon',
        description: manifest.description || '',
        tags: Array.isArray(manifest.tags) ? manifest.tags : [],
        credits: Array.isArray(manifest.credits) ? manifest.credits : [],
        userscripts: Array.isArray(manifest.userscripts) ? manifest.userscripts : [],
        userstyles: Array.isArray(manifest.userstyles) ? manifest.userstyles : [],
        settings: Array.isArray(manifest.settings) ? manifest.settings : [],
        enabledByDefault: manifest.enabledByDefault !== false,
        dynamicDisable: manifest.dynamicDisable === true,
        dynamicEnable: manifest.dynamicEnable === true
    };

    // Add custom tag to identify custom addons
    if (!normalized.tags.includes('custom')) {
        normalized.tags.push('custom');
    }

    return normalized;
}
