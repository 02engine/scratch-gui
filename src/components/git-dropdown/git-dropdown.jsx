import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage, injectIntl, intlShape} from 'react-intl';

import sharedMessages from '../../lib/shared-messages';
import styles from './git-dropdown.css';

const GitDropdown = props => {
    const {
        intl,
        isOpen,
        onCommit,
        onFetch,
        onPullRequest,
        onLogout,
        onClose,
        buttonRef,
        position = 'bottom-left'
    } = props;

    if (!isOpen) return null;

    const handleMenuClick = (action) => {
        action();
        onClose();
    };

    return (
        <div className={styles.dropdownContainer}>
            <div
                className={styles.dropdownMenu}
                style={{
                    bottom: position === 'bottom-left' ? '32px' : 'auto',
                    top: position === 'top-left' ? '32px' : 'auto',
                    left: position.includes('left') ? '0' : 'auto',
                    right: position.includes('right') ? '0' : 'auto'
                }}
            >
                <button
                    className={styles.dropdownItem}
                    onClick={() => handleMenuClick(onCommit)}
                >
                    <FormattedMessage {...sharedMessages.gitDropdownCommit} />
                </button>
                <button
                    className={styles.dropdownItem}
                    onClick={() => handleMenuClick(onFetch)}
                >
                    <FormattedMessage {...sharedMessages.gitDropdownFetch} />
                </button>
                <button
                    className={styles.dropdownItem}
                    onClick={() => handleMenuClick(onPullRequest)}
                >
                    <FormattedMessage {...sharedMessages.gitDropdownPullRequest} />
                </button>
                {onLogout && (
                    <div className={styles.dropdownDivider} />
                )}
                {onLogout && (
                    <button
                        className={styles.dropdownItem}
                        onClick={() => handleMenuClick(onLogout)}
                    >
                        <FormattedMessage
                            defaultMessage="Logout"
                            description="Button to logout from GitHub"
                            id="gui.gitDropdown.logout"
                        />
                    </button>
                )}
            </div>
        </div>
    );
};

GitDropdown.propTypes = {
    intl: intlShape.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onCommit: PropTypes.func.isRequired,
    onFetch: PropTypes.func.isRequired,
    onPullRequest: PropTypes.func.isRequired,
    onLogout: PropTypes.func,
    onClose: PropTypes.func.isRequired,
    buttonRef: PropTypes.object,
    position: PropTypes.oneOf(['bottom-left', 'top-left', 'bottom-right', 'top-right'])
};

export default injectIntl(GitDropdown);
