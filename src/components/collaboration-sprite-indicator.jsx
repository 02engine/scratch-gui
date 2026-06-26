import PropTypes from 'prop-types';
import React from 'react';
import styles from './collaboration-sprite-indicator.css';

const getUsernameInitials = username => {
    if (!username) return '??';
    return username.substring(0, 2).toUpperCase();
};

const hashUsername = username => {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        const char = username.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
};

const getUserColor = username => {
    const hash = hashUsername(username);
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 45%)`;
};

const CollaborationSpriteIndicator = ({editingUsers}) => {
    if (!editingUsers || editingUsers.length === 0) {
        return null;
    }

    const displayUsers = editingUsers.slice(0, 2);
    const overflowCount = editingUsers.length - 2;

    return (
        <div className={styles.indicator}>
            {displayUsers.map((user, index) => (
                <div
                    key={user.userId}
                    className={styles.badge}
                    style={{
                        backgroundColor: getUserColor(user.username),
                        left: `${index * 14}px`
                    }}
                    title={`${user.username} is editing this sprite`}
                >
                    {getUsernameInitials(user.username)}
                </div>
            ))}
            {overflowCount > 0 && (
                <div
                    className={styles.overflowBadge}
                    style={{left: `${displayUsers.length * 14}px`}}
                    title={`${overflowCount} more user${overflowCount > 1 ? 's' : ''} editing this sprite`}
                >
                    {`+${overflowCount}`}
                </div>
            )}
        </div>
    );
};

CollaborationSpriteIndicator.propTypes = {
    editingUsers: PropTypes.arrayOf(PropTypes.shape({
        userId: PropTypes.string,
        username: PropTypes.string
    }))
};

export default CollaborationSpriteIndicator;
