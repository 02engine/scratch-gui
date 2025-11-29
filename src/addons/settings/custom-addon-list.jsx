/**
 * Custom Addon List Component
 * Shows all imported custom addons with delete functionality
 */

import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { getAllCustomAddonIds, removeCustomAddon } from '../custom-addon-runtime.js';
import customAddonStorage from '../custom-addon-storage.js';
import styles from './custom-addon-list.css';

class CustomAddonList extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            customAddons: [],
            deleting: null
        };
        this.loadCustomAddons = this.loadCustomAddons.bind(this);
        this.handleDelete = this.handleDelete.bind(this);
    }

    componentDidMount() {
        this.loadCustomAddons();
    }

    async loadCustomAddons() {
        const addonIds = getAllCustomAddonIds();
        const addons = [];

        for (const id of addonIds) {
            const addonData = await customAddonStorage.getAddon(id);
            if (addonData) {
                addons.push({
                    id,
                    name: addonData.manifest.name || id,
                    description: addonData.manifest.description || '',
                    installTime: addonData.installTime
                });
            }
        }

        // Sort by install time (newest first)
        addons.sort((a, b) => b.installTime - a.installTime);

        this.setState({ customAddons: addons });
    }

    async handleDelete(addonId, addonName) {
        const confirmed = window.confirm(
            `Are you sure you want to delete "${addonName}"? This action cannot be undone.`
        );

        if (!confirmed) {
            return;
        }

        this.setState({ deleting: addonId });

        try {
            await removeCustomAddon(addonId);

            // Reload the list
            await this.loadCustomAddons();

            // Notify parent to refresh
            if (this.props.onAddonDeleted) {
                this.props.onAddonDeleted(addonId);
            }
        } catch (error) {
            alert(`Failed to delete addon: ${error.message}`);
        } finally {
            this.setState({ deleting: null });
        }
    }

    render() {
        const { customAddons, deleting } = this.state;
        const { translations } = this.props;

        if (customAddons.length === 0) {
            return (
                <div className={styles.emptyMessage}>
                    {translations.noCustomAddons || 'No custom addons installed'}
                </div>
            );
        }

        return (
            <div className={styles.customAddonListContainer}>
                <div className={styles.listHeader}>
                    {translations.installedCustomAddons || 'Installed Custom Addons'} ({customAddons.length})
                </div>
                <div className={styles.addonList}>
                    {customAddons.map(addon => (
                        <div key={addon.id} className={styles.addonItem}>
                            <div className={styles.addonInfo}>
                                <div className={styles.addonName}>{addon.name}</div>
                                {addon.description && (
                                    <div className={styles.addonDescription}>{addon.description}</div>
                                )}
                                <div className={styles.addonId}>ID: {addon.id}</div>
                            </div>
                            <button
                                className={classNames(styles.button, styles.deleteButton)}
                                onClick={() => this.handleDelete(addon.id, addon.name)}
                                disabled={deleting === addon.id}
                            >
                                {deleting === addon.id ?
                                    (translations.deleting || 'Deleting...') :
                                    (translations.delete || 'Delete')
                                }
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
}

CustomAddonList.propTypes = {
    translations: PropTypes.shape({
        noCustomAddons: PropTypes.string,
        installedCustomAddons: PropTypes.string,
        delete: PropTypes.string,
        deleting: PropTypes.string
    }),
    onAddonDeleted: PropTypes.func
};

CustomAddonList.defaultProps = {
    translations: {
        noCustomAddons: 'No custom addons installed',
        installedCustomAddons: 'Installed Custom Addons',
        delete: 'Delete',
        deleting: 'Deleting...'
    }
};

export default CustomAddonList;
