/**
 * Custom Addon Import Component
 * UI for importing custom addons from folders or ZIP files
 */

import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { loadFromFolder, loadFromZip } from '../custom-addon-loader.js';
import styles from './custom-addon-import.css';

class CustomAddonImport extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            importing: false,
            message: null,
            messageType: null // 'success' or 'error'
        };
        this.handleFolderSelect = this.handleFolderSelect.bind(this);
        this.handleZipSelect = this.handleZipSelect.bind(this);
    }

    async handleFolderSelect() {
        try {
            // Try modern Directory Picker API first (Chrome 86+)
            if ('showDirectoryPicker' in window) {
                const dirHandle = await window.showDirectoryPicker();
                const files = await this.readDirectory(dirHandle);
                await this.importAddon(files);
            } else {
                // Fallback to webkitdirectory
                const input = document.createElement('input');
                input.type = 'file';
                input.webkitdirectory = true;
                input.multiple = true;

                input.onchange = async (e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        await this.importAddon(e.target.files);
                    }
                };

                input.click();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.showMessage(`Error: ${error.message}`, 'error');
            }
        }
    }

    async handleZipSelect() {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.zip';

            input.onchange = async (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    await this.importZip(e.target.files[0]);
                }
            };

            input.click();
        } catch (error) {
            this.showMessage(`Error: ${error.message}`, 'error');
        }
    }

    async readDirectory(dirHandle) {
        const files = [];

        async function readDir(handle, path = '') {
            for await (const entry of handle.values()) {
                const entryPath = path ? `${path}/${entry.name}` : entry.name;

                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    // Add webkitRelativePath property for compatibility
                    Object.defineProperty(file, 'webkitRelativePath', {
                        value: entryPath,
                        writable: false
                    });
                    files.push(file);
                } else if (entry.kind === 'directory') {
                    await readDir(entry, entryPath);
                }
            }
        }

        await readDir(dirHandle);
        return files;
    }

    async importAddon(files) {
        this.setState({ importing: true, message: null });

        try {
            const result = await loadFromFolder(files);

            if (result.success) {
                this.showMessage(
                    `Successfully imported "${result.manifest.name}"!`,
                    'success'
                );

                // Trigger reload
                if (this.props.onImportSuccess) {
                    this.props.onImportSuccess(result.addonId);
                }
            } else {
                this.showMessage(result.error, 'error');
            }
        } catch (error) {
            this.showMessage(`Failed to import: ${error.message}`, 'error');
        } finally {
            this.setState({ importing: false });
        }
    }

    async importZip(zipFile) {
        this.setState({ importing: true, message: null });

        try {
            const result = await loadFromZip(zipFile);

            if (result.success) {
                this.showMessage(
                    `Successfully imported "${result.manifest.name}"!`,
                    'success'
                );

                // Trigger reload
                if (this.props.onImportSuccess) {
                    this.props.onImportSuccess(result.addonId);
                }
            } else {
                this.showMessage(result.error, 'error');
            }
        } catch (error) {
            this.showMessage(`Failed to import: ${error.message}`, 'error');
        } finally {
            this.setState({ importing: false });
        }
    }

    showMessage(message, type) {
        this.setState({ message, messageType: type });

        // Auto-clear success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                this.setState({ message: null, messageType: null });
            }, 5000);
        }
    }

    render() {
        const { translations } = this.props;
        const { importing, message, messageType } = this.state;

        return (
            <div className={styles.customImportContainer}>
                <div className={styles.importButtons}>
                    <button
                        className={classNames(styles.button, styles.importButton)}
                        onClick={this.handleFolderSelect}
                        disabled={importing}
                    >
                        {importing ? translations.importing : translations.selectFolder}
                    </button>
                    <button
                        className={classNames(styles.button, styles.importButton)}
                        onClick={this.handleZipSelect}
                        disabled={importing}
                    >
                        {importing ? translations.importing : translations.importZip}
                    </button>
                </div>

                {message && (
                    <div className={classNames(styles.message, {
                        [styles.messageSuccess]: messageType === 'success',
                        [styles.messageError]: messageType === 'error'
                    })}>
                        {message}
                    </div>
                )}
            </div>
        );
    }
}

CustomAddonImport.propTypes = {
    translations: PropTypes.shape({
        selectFolder: PropTypes.string,
        importZip: PropTypes.string,
        importing: PropTypes.string
    }),
    onImportSuccess: PropTypes.func
};

CustomAddonImport.defaultProps = {
    translations: {
        selectFolder: 'Select Folder',
        importZip: 'Import ZIP',
        importing: 'Importing...'
    }
};

export default CustomAddonImport;
