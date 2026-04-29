import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage, injectIntl} from 'react-intl';
import classNames from 'classnames';

import Modal from '../../containers/windowed-modal.jsx';
import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';
import Input from '../forms/input.jsx';
import FancyCheckbox from '../tw-fancy-checkbox/checkbox.jsx';

const BufferedInput = BufferedInputHOC(Input);

import styles from './collaboration-modal.css';

class CollaborationModal extends Component {
    constructor (props) {
        super(props);

        this.state = {
            roomId: props.roomId || '',
            isConnecting: false,
            connectionStep: props.isConnected ? 'connected' : 'join',
            error: null,
            pendingRequests: [],
            showJoinRequest: false
        };

        this.autoJoinAttempted = new Set();
        this.autoJoinInProgress = false;
        this._autoJoinTimer = null;
        this._lastAutoJoinAttempt = new Map();
        this._autoJoinFailures = new Map();

        this.handleRoomIdChange = this.handleRoomIdChange.bind(this);
        this.handleJoinRoom = this.handleJoinRoom.bind(this);
        this.handleCreateRoom = this.handleCreateRoom.bind(this);
        this.handleLeaveRoom = this.handleLeaveRoom.bind(this);
        this.handleKickUser = this.handleKickUser.bind(this);
        this.handleCopyRoomUrl = this.handleCopyRoomUrl.bind(this);
        this.fallbackCopyToClipboard = this.fallbackCopyToClipboard.bind(this);
        this.showUrlPrompt = this.showUrlPrompt.bind(this);
        this.generateRoomCode = this.generateRoomCode.bind(this);
        this.attemptAutoJoin = this.attemptAutoJoin.bind(this);
        this.handleApproveRequest = this.handleApproveRequest.bind(this);
        this.handleDenyRequest = this.handleDenyRequest.bind(this);
        this.handleCancelJoinRequest = this.handleCancelJoinRequest.bind(this);
        this.handleChangeCurrentRoomPrivacy = this.handleChangeCurrentRoomPrivacy.bind(this);
        this.handleJoinRequestEvent = this.handleJoinRequestEvent.bind(this);
        this.handleAwaitingApproval = this.handleAwaitingApproval.bind(this);
        this.handleApprovalResolved = this.handleApprovalResolved.bind(this);
        this.handleJoinDenied = this.handleJoinDenied.bind(this);
        this.resetToJoinScreen = this.resetToJoinScreen.bind(this);
        this.handleCancelClick = this.handleCancelClick.bind(this);
        this.togglePublicPrivacy = this.togglePublicPrivacy.bind(this);
        this.togglePrivatePrivacy = this.togglePrivatePrivacy.bind(this);
    }

    componentDidMount () {
        if (this.props.roomId && !this.props.isConnected && !this._autoJoinTimer && !this.autoJoinInProgress) {
            const roomIdKey = `${this.props.roomId}-${this.props.currentUsername}`;
            this.autoJoinAttempted.add(roomIdKey);
            this.autoJoinInProgress = true;
            this._autoJoinTimer = setTimeout(() => {
                this._autoJoinTimer = null;
                this.autoJoinInProgress = false;
                this.attemptAutoJoin(this.props.roomId, this.props.currentUsername);
            }, 100);
        }

        if (typeof window !== 'undefined' && window.CollaborationService) {
            try {
                const service = window.CollaborationService.getInstance();
                if (service) {
                    service.on('join-request-received', this.handleJoinRequestEvent);
                    service.on('awaiting-approval', this.handleAwaitingApproval);
                    service.on('approval-resolved', this.handleApprovalResolved);
                    service.on('join-denied', this.handleJoinDenied);
                }
            } catch (error) {
                console.warn('Could not set up collaboration service event listeners:', error);
            }
        }
    }

    componentDidUpdate (prevProps) {
        if (prevProps.isConnected !== this.props.isConnected) {
            const newConnectionStep = this.props.isConnected ? 'connected' : 'join';
            this.setState({
                connectionStep: newConnectionStep,
                isConnecting: false,
                error: null
            });

            if (!this.props.isConnected) {
                this.autoJoinInProgress = false;
                if (this._autoJoinTimer) {
                    clearTimeout(this._autoJoinTimer);
                    this._autoJoinTimer = null;
                }
                return;
            }
            const roomIdKey = `${this.props.roomId}-${this.props.currentUsername}`;
            this._autoJoinFailures.delete(roomIdKey);
        }

        const shouldResetToJoin =
            prevProps.roomId !== this.props.roomId &&
            this.props.roomId === null &&
            !this.props.isConnected;

        if (shouldResetToJoin) {
            this.resetToJoinScreen();
        }

        if (prevProps.connectionError !== this.props.connectionError && this.props.connectionError) {
            this.setState({
                error: this.props.connectionError,
                isConnecting: false,
                connectionStep: 'join'
            });
        }

        if (prevProps.roomId !== this.props.roomId && this.props.roomId && !this.props.isConnected) {
            this.setState({
                roomId: this.props.roomId
            });

            const roomIdKey = `${this.props.roomId}-${this.props.currentUsername}`;
            const now = Date.now();
            const lastAttempt = this._lastAutoJoinAttempt.get(roomIdKey) || 0;
            const timeSinceLastAttempt = now - lastAttempt;
            const cooldownPeriod = 30000;
            const failureCount = this._autoJoinFailures.get(roomIdKey) || 0;
            const hasNoPreviousRoomId = prevProps.roomId === null || prevProps.roomId === undefined;
            const hasCurrentUsername = this.props.currentUsername != null;
            const shouldAttemptAutoJoin =
                hasNoPreviousRoomId &&
                this.props.roomId &&
                hasCurrentUsername &&
                !this._autoJoinTimer &&
                !this.autoJoinInProgress &&
                timeSinceLastAttempt > cooldownPeriod &&
                failureCount < 5;

            if (shouldAttemptAutoJoin) {
                this.autoJoinAttempted.add(roomIdKey);
                this._lastAutoJoinAttempt.set(roomIdKey, now);
                this.autoJoinInProgress = true;
                this._autoJoinTimer = setTimeout(() => {
                    this._autoJoinTimer = null;
                    this.autoJoinInProgress = false;
                    this.attemptAutoJoin(this.props.roomId, this.props.currentUsername);
                }, 100);
            } else if (failureCount >= 5) {
                this.setState({
                    error: 'Unable to connect to the room. Please try again later.',
                    connectionStep: 'join'
                });
            }
        }

        if (this.props.visible && typeof window !== 'undefined' && window.CollaborationService) {
            try {
                const service = window.CollaborationService.getInstance();
                if (service && service.getPendingJoinRequests) {
                    const pendingRequests = service.getPendingJoinRequests();
                    const hasChanged =
                        JSON.stringify(pendingRequests) !== JSON.stringify(this.state.pendingRequests);

                    if (hasChanged) {
                        this.setState({pendingRequests});
                    }
                }
            } catch (error) {
                // ignore
            }
        }
    }

    componentWillUnmount () {
        if (typeof window !== 'undefined' && window.CollaborationService) {
            try {
                const service = window.CollaborationService.getInstance();
                if (service) {
                    service.off('join-request-received', this.handleJoinRequestEvent);
                    service.off('awaiting-approval', this.handleAwaitingApproval);
                    service.off('approval-resolved', this.handleApprovalResolved);
                    service.off('join-denied', this.handleJoinDenied);
                }
            } catch (error) {
                console.warn('Could not clean up collaboration service event listeners:', error);
            }
        }

        this.autoJoinAttempted.clear();
        this.autoJoinInProgress = false;
        this._lastAutoJoinAttempt.clear();
        this._autoJoinFailures.clear();
        if (this._autoJoinTimer) {
            clearTimeout(this._autoJoinTimer);
            this._autoJoinTimer = null;
        }
    }

    resetToJoinScreen () {
        this.setState({
            connectionStep: 'join',
            isConnecting: false,
            error: null
        });
    }

    handleCancelClick () {
        this.resetToJoinScreen();
        this.props.onCancelConnection();
    }

    togglePublicPrivacy () {
        this.handleChangeCurrentRoomPrivacy('public');
    }

    togglePrivatePrivacy () {
        this.handleChangeCurrentRoomPrivacy('private');
    }

    handleRoomIdChange (roomId) {
        this.setState({roomId});
    }

    async handleJoinRoom () {
        if (!this.state.roomId.trim()) {
            this.setState({error: 'Please enter a room ID'});
            return;
        }

        this.setState({
            isConnecting: true,
            connectionStep: 'connecting',
            error: null
        });

        try {
            await this.props.onJoinRoom(this.state.roomId.trim(), this.props.currentUsername);
        } catch (error) {
            this.setState({
                error: error.message || 'Failed to join room',
                isConnecting: false,
                connectionStep: 'join'
            });
        }
    }

    async handleCreateRoom () {
        const roomCode = this.generateRoomCode();

        this.setState({
            isConnecting: true,
            connectionStep: 'connecting',
            error: null
        });

        try {
            await this.props.onCreateRoom(roomCode, this.props.currentUsername, 'public');

            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('room', roomCode);
            currentUrl.searchParams.delete('username');
            window.history.replaceState(null, null, currentUrl.toString());

            this.setState({roomId: roomCode});

        } catch (error) {
            this.setState({
                error: error.message || 'Failed to create room',
                isConnecting: false,
                connectionStep: 'join'
            });
        }
    }

    handleLeaveRoom () {
        this.props.onLeaveRoom();
        this.setState({
            connectionStep: 'join',
            roomId: '',
            error: null
        });
    }

    handleKickUser (userId) {
        this.props.onKickUser(userId);
    }

    handleCopyRoomUrl () {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('room', this.props.roomId);
        currentUrl.searchParams.delete('username');
        const roomUrl = currentUrl.toString();

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(roomUrl).then(() => {
                console.log('Room URL copied to clipboard');
            })
                .catch(err => {
                    console.error('Failed to copy room URL:', err);
                    this.fallbackCopyToClipboard(roomUrl);
                });
        } else {
            this.fallbackCopyToClipboard(roomUrl);
        }
    }

    fallbackCopyToClipboard (text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);

        try {
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            if (successful) {
                console.log('Room URL copied to clipboard (fallback)');
            } else {
                this.showUrlPrompt(text);
            }
        } catch (err) {
            this.showUrlPrompt(text);
        } finally {
            document.body.removeChild(textArea);
        }
    }

    showUrlPrompt (text) {
        console.log('Room URL:', text);
    }

    generateRoomCode () {
        const adjectives = ['cool', 'fun', 'epic', 'wild', 'neat', 'rad', 'hot', 'ice', 'big', 'tiny'];
        const nouns = ['cat', 'dog', 'owl', 'fox', 'bee', 'ant', 'fish', 'bird', 'frog', 'duck'];

        const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
        const randomNum = Math.floor(Math.random() * 1000).toString()
            .padStart(3, '0');

        return `${randomAdjective}-${randomNoun}-${randomNum}`;
    }

    async attemptAutoJoin (roomCode, username) {
        try {
            if (!roomCode || !username) {
                this.setState({
                    error: !roomCode ? 'No room code provided' : 'Username not available',
                    isConnecting: false,
                    connectionStep: 'join'
                });
                return;
            }

            this.setState({
                isConnecting: true,
                connectionStep: 'connecting',
                error: null
            });

            await this.props.onJoinRoom(roomCode, username);

            const roomIdKey = `${roomCode}-${username}`;
            this._autoJoinFailures.delete(roomIdKey);
        } catch (error) {
            const roomIdKey = `${roomCode}-${username}`;
            const failureCount = (this._autoJoinFailures.get(roomIdKey) || 0) + 1;
            this._autoJoinFailures.set(roomIdKey, failureCount);

            try {
                await this.props.onCreateRoom(roomCode, username);
                this._autoJoinFailures.delete(roomIdKey);
            } catch (createError) {
                this.autoJoinInProgress = false;
                if (failureCount < 3) {
                    this.setState({
                        error: `Room "${roomCode}" doesn't exist and couldn't be created`,
                        isConnecting: false,
                        connectionStep: 'join'
                    });
                } else {
                    this.setState({
                        error: `Unable to connect. Will retry in a moment... (${failureCount} attempts)`,
                        isConnecting: false,
                        connectionStep: 'join'
                    });
                }
            }
        }
    }


    async handleApproveRequest (requesterId, requesterUsername) {
        try {
            await this.props.onApproveJoinRequest(requesterId, requesterUsername);
            this.setState(prevState => ({
                pendingRequests: prevState.pendingRequests.filter(req => req.id !== requesterId)
            }));
        } catch (error) {
            this.setState({error: 'Failed to approve join request'});
        }
    }

    async handleDenyRequest (requesterId) {
        try {
            await this.props.onDenyJoinRequest(requesterId);
            this.setState(prevState => ({
                pendingRequests: prevState.pendingRequests.filter(req => req.id !== requesterId)
            }));
        } catch (error) {
            this.setState({error: 'Failed to deny join request'});
        }
    }

    handleCancelJoinRequest () {
        if (this.props.onCancelJoinRequest) {
            this.props.onCancelJoinRequest();
        }

        if (typeof window !== 'undefined' && window.CollaborationService) {
            try {
                const service = window.CollaborationService.getInstance();
                if (service) {
                    service.disconnect();
                }
            } catch (error) {
                console.warn('Could not disconnect from collaboration service:', error);
            }
        }

        this.setState({
            connectionStep: 'join',
            isConnecting: false,
            error: null
        });
    }

    handleAwaitingApproval () {
        this.setState({
            connectionStep: 'pending-approval',
            isConnecting: false,
            error: null
        });
    }

    handleApprovalResolved () {
        this.setState({
            connectionStep: this.props.isConnected ? 'connected' : 'connecting',
            error: null
        });
    }

    handleJoinDenied (reason) {
        this.setState({
            connectionStep: 'join',
            isConnecting: false,
            error: `Join request denied: ${reason}`
        });
    }

    async handleChangeCurrentRoomPrivacy (newPrivacy) {
        try {
            await this.props.onChangeRoomPrivacy(newPrivacy);
        } catch (error) {
            this.setState({error: 'Failed to change room privacy'});
        }
    }

    handleJoinRequestEvent (data) {
        if (typeof window !== 'undefined' && window.CollaborationService) {
            try {
                const service = window.CollaborationService.getInstance();
                if (service && service.getPendingJoinRequests) {
                    const pendingRequests = service.getPendingJoinRequests();
                    this.setState({pendingRequests});
                }
            } catch (error) {
                console.warn('Could not get pending requests:', error);
            }
        }
    }

    renderJoinStep () {
        return (
            <Box className={styles.content}>
                <div className={styles.alphaBanner}>
                    <div className={styles.bannerIcon}>
                        {/* AlertTriangle 圖示已移除 */}
                    </div>
                    <div className={styles.bannerContent}>
                        <strong>{'Alpha Warning:'}</strong>
                        {'This feature is in early development. Your projects may get corrupted or broken. Use at your own risk.'}
                    </div>
                </div>

                <div className={styles.header}>
                    <div className={styles.headerIcon} />
                    <div className={styles.headerText}>
                        <FormattedMessage
                            defaultMessage="Live Collaboration"
                            description="Title for collaboration modal"
                            id="gui.collaboration.title"
                        />
                    </div>
                </div>

                <div className={styles.description}>
                    <FormattedMessage
                        defaultMessage="You will be known as: {username}"
                        description="Shows current username"
                        id="gui.collaboration.currentUsername"
                        values={{username: this.props.currentUsername}}
                    />
                    <button
                        className={styles.editUsernameButton}
                        onClick={this.props.onOpenChangeUsername}
                        title="Change username"
                    >
                        {/* PenLine 圖示已移除 */}
                    </button>
                </div>

                <div className={styles.roomActions}>
                    <div className={styles.joinSection}>
                        <h3 className={styles.sectionTitle}>
                            <FormattedMessage
                                defaultMessage="Join an Existing Room"
                                description="Join room section title"
                                id="gui.collaboration.joinTitle"
                            />
                        </h3>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>
                                <FormattedMessage
                                    defaultMessage="Room ID"
                                    description="Label for room ID input"
                                    id="gui.collaboration.roomId"
                                />
                            </label>
                            <BufferedInput
                                className={styles.input}
                                placeholder="Enter room ID..."
                                value={this.state.roomId}
                                onSubmit={this.handleRoomIdChange}
                            />
                        </div>
                        <Button
                            className={styles.primaryButton}
                            onClick={this.handleJoinRoom}
                            disabled={this.state.isConnecting}
                        >
                            <FormattedMessage
                                defaultMessage="Join Room"
                                description="Button to join collaboration room"
                                id="gui.collaboration.joinRoom"
                            />
                        </Button>
                        {this.state.error && (
                            <div className={styles.joinError}>
                                {this.state.error}
                            </div>
                        )}
                    </div>

                    <div className={styles.sectionDivider} />

                    <div className={styles.createSection}>
                        <h3 className={styles.sectionTitle}>
                            <FormattedMessage
                                defaultMessage="Create a New Room"
                                description="Create room section title"
                                id="gui.collaboration.createTitle"
                            />
                        </h3>
                        <div className={styles.createDescription}>
                            <FormattedMessage
                                defaultMessage="Generate a new room ID to start collaborating with others. Share the room URL to invite people."
                                description="Create room description"
                                id="gui.collaboration.createDescription"
                            />
                        </div>
                        <Button
                            className={styles.secondaryButton}
                            onClick={this.handleCreateRoom}
                            disabled={this.state.isConnecting}
                        >
                            <FormattedMessage
                                defaultMessage="Create New Room"
                                description="Button to create new collaboration room"
                                id="gui.collaboration.createRoom"
                            />
                        </Button>
                    </div>
                </div>
            </Box>
        );
    }

    renderConnectingStep () {
        return (
            <Box className={styles.content}>
                <div className={styles.alphaBanner}>
                    <div className={styles.bannerIcon}>
                        {/* AlertTriangle 圖示已移除 */}
                    </div>
                    <div className={styles.bannerContent}>
                        <strong>Alpha Warning:</strong> This feature is in early development. Your projects may get corrupted or broken. Use at your own risk.
                    </div>
                </div>
                <div className={styles.connecting}>
                    <div className={styles.spinner} />
                    <FormattedMessage
                        defaultMessage="Connecting to room..."
                        description="Connecting message"
                        id="gui.collaboration.connecting"
                    />
                    <div className={styles.buttonGroup}>
                        <Button
                            className={styles.secondaryButton}
                            onClick={this.handleCancelClick}
                        >
                            <FormattedMessage
                                defaultMessage="Cancel"
                                description="Cancel connection button"
                                id="gui.collaboration.cancel"
                            />
                        </Button>
                    </div>
                </div>
            </Box>
        );
    }

    renderConnectedStep () {
        const users = this.props.connectedUsers || [];
        const currentUser = users.find(user => user.id === this.props.currentUserId);
        const isHost = currentUser && currentUser.isHost;

        return (
            <Box className={styles.content}>
                <div className={styles.alphaBanner}>
                    <div className={styles.bannerIcon}>
                        {/* AlertTriangle 圖示已移除 */}
                    </div>
                    <div className={styles.bannerContent}>
                        <strong>Alpha Warning:</strong> This feature is in early development. Your projects may get corrupted or broken. Use at your own risk.
                    </div>
                </div>

                <div className={styles.header}>
                    <div className={styles.headerIcon} />
                    <div className={styles.headerText}>
                        <FormattedMessage
                            defaultMessage="Room: {roomId}"
                            description="Connected room title"
                            id="gui.collaboration.connectedRoom"
                            values={{roomId: this.props.roomId}}
                        />
                    </div>
                </div>

                <div className={styles.connectedInfo}>
                    <div className={styles.status}>
                        <span className={styles.statusIndicator} />
                        <FormattedMessage
                            defaultMessage="Connected - {userCount} {userCount, plural, one {user} other {users}} online"
                            description="Connection status"
                            id="gui.collaboration.status"
                            values={{userCount: users.length}}
                        />
                    </div>
                </div>

                <div className={styles.usersSectionWrapper}>
                    <div className={styles.usersSection}>
                        <h3 className={styles.sectionTitle}>
                            <FormattedMessage
                                defaultMessage="Connected Users"
                                description="Users section title"
                                id="gui.collaboration.connectedUsers"
                            />
                        </h3>

                        <div className={styles.usersList}>
                            {users.map(user => (
                                <div
                                    key={user.id}
                                    className={classNames(styles.userItem, {
                                        [styles.currentUser]: user.id === this.props.currentUserId
                                    })}
                                >
                                    <div className={styles.userIcon}>
                                        {/* Crown 或 User 圖示已移除 */}
                                    </div>
                                    <span className={styles.username}>
                                        {user.username}
                                        {user.isHost && (
                                            <span className={styles.hostBadge}>
                                                <FormattedMessage
                                                    defaultMessage="Host"
                                                    description="Host badge"
                                                    id="gui.collaboration.host"
                                                />
                                            </span>
                                        )}
                                        {user.id === this.props.currentUserId && (
                                            <span className={styles.youBadge}>
                                                <FormattedMessage
                                                    defaultMessage="You"
                                                    description="You badge"
                                                    id="gui.collaboration.you"
                                                />
                                            </span>
                                        )}
                                    </span>

                                    {isHost && user.id !== this.props.currentUserId && (
                                        <Button
                                            className={styles.kickButton}
                                            onClick={this.handleKickUser.bind(this, user.id)}
                                            iconClassName={styles.kickIcon}
                                        >
                                            <FormattedMessage
                                                defaultMessage="Kick"
                                                description="Kick user button"
                                                id="gui.collaboration.kick"
                                            />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {isHost && this.state.pendingRequests.length > 0 && (
                    <>
                        <div className={styles.sectionDivider} />
                        <div className={styles.requestsSection}>
                            <h3 className={styles.sectionTitle}>
                                <FormattedMessage
                                    defaultMessage="Pending Join Requests ({count})"
                                    description="Pending requests section title"
                                    id="gui.collaboration.pendingRequests"
                                    values={{count: this.state.pendingRequests.length}}
                                />
                            </h3>

                            <div className={styles.requestsList}>
                                {this.state.pendingRequests.map(request => (
                                    <div
                                        key={request.id}
                                        className={styles.requestItem}
                                    >
                                        <div className={styles.requesterInfo}>
                                            <div className={styles.userIcon} />
                                            <span className={styles.username}>
                                                {request.username}
                                            </span>
                                        </div>

                                        <div className={styles.requestActions}>
                                            <Button
                                                className={styles.approveButton}
                                                onClick={this.handleApproveRequest.bind(this, request.id, request.username)}
                                            >
                                                <FormattedMessage
                                                    defaultMessage="Approve"
                                                    description="Approve join request button"
                                                    id="gui.collaboration.approve"
                                                />
                                            </Button>
                                            <Button
                                                className={styles.denyButton}
                                                onClick={this.handleDenyRequest.bind(this, request.id)}
                                            >
                                                <FormattedMessage
                                                    defaultMessage="Deny"
                                                    description="Deny join request button"
                                                    id="gui.collaboration.deny"
                                                />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {isHost && (
                    <>
                        <div className={styles.sectionDivider} />
                        <div className={styles.privacySection}>
                            <h3 className={styles.sectionTitle}>
                                <FormattedMessage
                                    defaultMessage="Room Privacy"
                                    description="Room privacy section title"
                                    id="gui.collaboration.roomPrivacySettings"
                                />
                            </h3>

                            {this.props.roomPrivacy === 'public' ? (
                                <div className={styles.privacyCard}>
                                    <div className={styles.privacyCardTitle}>
                                        <FormattedMessage
                                            defaultMessage="Public Room"
                                            description="Public room card title"
                                            id="gui.collaboration.publicRoom"
                                        />
                                    </div>
                                    <div className={styles.privacyCardDesc}>
                                        <FormattedMessage
                                            defaultMessage="Anyone can join this room without approval"
                                            description="Public room explanation"
                                            id="gui.collaboration.publicRoomDesc"
                                        />
                                    </div>
                                </div>
                            ) : null}

                            {this.props.roomPrivacy === 'private' ? (
                                <div className={classNames(styles.privacyCard, styles.private)}>
                                    <div className={styles.privacyCardTitle}>
                                        <FormattedMessage
                                            defaultMessage="Private Room"
                                            description="Private room card title"
                                            id="gui.collaboration.privateRoom"
                                        />
                                    </div>
                                    <div className={styles.privacyCardDesc}>
                                        <FormattedMessage
                                            defaultMessage="Users must request approval to join this room"
                                            description="Private room explanation"
                                            id="gui.collaboration.privateRoomDesc"
                                        />
                                    </div>
                                </div>
                            ) : null}

                            <div className={styles.privacySelector}>
                                <label className={styles.radioLabel}>
                                    <FancyCheckbox
                                        className={styles.checkbox}
                                        checked={this.props.roomPrivacy === 'public'}
                                        onChange={this.togglePublicPrivacy}
                                    />
                                    <span className={styles.radioText}>
                                        <FormattedMessage
                                            defaultMessage="Make Public"
                                            description="Make public room option"
                                            id="gui.collaboration.makePublic"
                                        />
                                    </span>
                                </label>
                                <label className={styles.radioLabel}>
                                    <FancyCheckbox
                                        className={styles.checkbox}
                                        checked={this.props.roomPrivacy === 'private'}
                                        onChange={this.togglePrivatePrivacy}
                                    />
                                    <span className={styles.radioText}>
                                        <FormattedMessage
                                            defaultMessage="Make Private"
                                            description="Make private room option"
                                            id="gui.collaboration.makePrivate"
                                        />
                                    </span>
                                </label>
                            </div>
                        </div>
                    </>
                )}

                <div className={styles.connectedActions}>
                    <div className={styles.primaryActions}>
                        <Button
                            className={styles.primaryButton}
                            onClick={this.handleCopyRoomUrl}
                            iconClassName={styles.buttonIcon}
                        >
                            <FormattedMessage
                                defaultMessage="Copy Room URL to Share"
                                description="Button to copy room URL for sharing"
                                id="gui.collaboration.copyRoomUrl"
                            />
                        </Button>
                    </div>

                    <Button
                        className={styles.dangerButton}
                        onClick={this.handleLeaveRoom}
                    >
                        <FormattedMessage
                            defaultMessage="Leave Room"
                            description="Button to leave collaboration room"
                            id="gui.collaboration.leaveRoom"
                        />
                    </Button>
                </div>
            </Box>
        );
    }

    renderPendingApprovalStep () {
        return (
            <Box className={styles.content}>
                <div className={styles.alphaBanner}>
                    <div className={styles.bannerIcon}>
                        {/* AlertTriangle 圖示已移除 */}
                    </div>
                    <div className={styles.bannerContent}>
                        <strong>Alpha Warning:</strong> This feature is in early development. Your projects may get corrupted or broken. Use at your own risk.
                    </div>
                </div>
                <div className={styles.header}>
                    <div className={styles.headerIcon} />
                    <div className={styles.headerText}>
                        <FormattedMessage
                            defaultMessage="Waiting for Host Approval"
                            description="Title for pending approval state"
                            id="gui.collaboration.waitingApproval"
                        />
                    </div>
                </div>

                <div className={styles.description}>
                    <FormattedMessage
                        defaultMessage="Your request to join this private room has been sent to the host. Please wait for approval."
                        description="Description for pending approval"
                        id="gui.collaboration.pendingApprovalDescription"
                    />
                </div>

                <div className={styles.buttonGroup}>
                    <Button
                        className={styles.secondaryButton}
                        onClick={this.handleCancelJoinRequest}
                    >
                        <FormattedMessage
                            defaultMessage="Cancel Request"
                            description="Button to cancel join request"
                            id="gui.collaboration.cancelRequest"
                        />
                    </Button>
                </div>

                {this.state.error && (
                    <div className={styles.error}>
                        {this.state.error}
                    </div>
                )}
            </Box>
        );
    }

    render () {
        if (!this.props.visible) return null;

        let content;
        switch (this.state.connectionStep) {
        case 'join':
            content = this.renderJoinStep();
            break;
        case 'connecting':
            content = this.renderConnectingStep();
            break;
        case 'connected':
            content = this.renderConnectedStep();
            break;
        case 'pending-approval':
            content = this.renderPendingApprovalStep();
            break;
        default:
            content = this.renderJoinStep();
        }

        return (
            <Modal
                className={styles.modalContent}
                onRequestClose={this.props.onRequestClose}
                contentLabel="Live Collaboration"
                id="collaborationModal"
            >
                <Box className={styles.body}>
                    {content}
                </Box>
            </Modal>
        );
    }
}

CollaborationModal.propTypes = {
    visible: PropTypes.bool,
    currentUsername: PropTypes.string,
    currentUserId: PropTypes.string,
    isConnected: PropTypes.bool,
    roomId: PropTypes.string,
    roomPrivacy: PropTypes.string,
    connectedUsers: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        username: PropTypes.string.isRequired,
        isHost: PropTypes.bool
    })),
    connectionError: PropTypes.string,
    onRequestClose: PropTypes.func.isRequired,
    onJoinRoom: PropTypes.func.isRequired,
    onCreateRoom: PropTypes.func.isRequired,
    onLeaveRoom: PropTypes.func.isRequired,
    onKickUser: PropTypes.func.isRequired,
    onCancelConnection: PropTypes.func.isRequired,
    onApproveJoinRequest: PropTypes.func,
    onDenyJoinRequest: PropTypes.func,
    onCancelJoinRequest: PropTypes.func,
    onChangeRoomPrivacy: PropTypes.func
};

export default injectIntl(CollaborationModal);