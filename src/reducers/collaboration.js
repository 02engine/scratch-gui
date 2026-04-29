const OPEN_COLLABORATION_MODAL = 'scratch-gui/collaboration/OPEN_COLLABORATION_MODAL';
const CLOSE_COLLABORATION_MODAL = 'scratch-gui/collaboration/CLOSE_COLLABORATION_MODAL';
const SET_COLLABORATION_CONNECTED = 'scratch-gui/collaboration/SET_COLLABORATION_CONNECTED';
const SET_COLLABORATION_USERS = 'scratch-gui/collaboration/SET_COLLABORATION_USERS';
const SET_COLLABORATION_ERROR = 'scratch-gui/collaboration/SET_COLLABORATION_ERROR';
const SET_COLLABORATION_ROOM_ID = 'scratch-gui/collaboration/SET_COLLABORATION_ROOM_ID';
const SET_COLLABORATION_ROOM_PRIVACY = 'scratch-gui/collaboration/SET_COLLABORATION_ROOM_PRIVACY';
const SET_COLLABORATION_LOADING = 'scratch-gui/collaboration/SET_COLLABORATION_LOADING';
const SET_COLLABORATION_HOST_LOADING_PROGRESS = 'scratch-gui/collaboration/SET_HOST_LOADING_PROGRESS';
const SET_SPRITE_EDITOR = 'scratch-gui/collaboration/SET_SPRITE_EDITOR';
const REMOVE_SPRITE_EDITOR = 'scratch-gui/collaboration/REMOVE_SPRITE_EDITOR';

const initialState = {
    modalVisible: false,
    isConnected: false,
    roomId: null,
    roomPrivacy: 'public',
    connectedUsers: [],
    connectionError: null,
    isCollabLoading: false,
    collabLoadingMessage: null,
    hostLoadingProgress: 0,
    spriteEditors: {}
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    
    switch (action.type) {
    case OPEN_COLLABORATION_MODAL:
        return Object.assign({}, state, {
            modalVisible: true,
            connectionError: null
        });
    
    case CLOSE_COLLABORATION_MODAL:
        return Object.assign({}, state, {
            modalVisible: false
        });
    
    case SET_COLLABORATION_CONNECTED:
        return Object.assign({}, state, {
            isConnected: action.connected,
            connectionError: action.connected ? null : state.connectionError
        });
    
    case SET_COLLABORATION_USERS:
        return Object.assign({}, state, {
            connectedUsers: action.users || []
        });
    
    case SET_COLLABORATION_ERROR:
        return Object.assign({}, state, {
            connectionError: action.error
        });
    
    case SET_COLLABORATION_ROOM_ID:
        return Object.assign({}, state, {
            roomId: action.roomId
        });
    
    case SET_COLLABORATION_ROOM_PRIVACY:
        return Object.assign({}, state, {
            roomPrivacy: action.privacy
        });

    case SET_COLLABORATION_LOADING:
        return Object.assign({}, state, {
            isCollabLoading: action.isLoading,
            collabLoadingMessage: action.message || null,
            hostLoadingProgress: action.isLoading ? state.hostLoadingProgress : 0
        });

    case SET_COLLABORATION_HOST_LOADING_PROGRESS:
        return Object.assign({}, state, {
            hostLoadingProgress: action.progress
        });

    case SET_SPRITE_EDITOR: {
        const spriteId = action.spriteId;
        const existingEditors = state.spriteEditors[spriteId] || [];

        const existingIndex = existingEditors.findIndex(editor => editor.userId === action.userId);

        let newEditors;
        if (existingIndex >= 0) {
            newEditors = existingEditors.map((editor, index) => {
                if (index === existingIndex) {
                    return {
                        userId: action.userId,
                        username: action.username,
                        timestamp: action.timestamp
                    };
                }
                return editor;
            });
        } else {
            newEditors = [
                ...existingEditors,
                {
                    userId: action.userId,
                    username: action.username,
                    timestamp: action.timestamp
                }
            ];
        }

        return Object.assign({}, state, {
            spriteEditors: Object.assign({}, state.spriteEditors, {
                [spriteId]: newEditors
            })
        });
    }

    case REMOVE_SPRITE_EDITOR: {
        const spriteId = action.spriteId;
        const existingEditors = state.spriteEditors[spriteId] || [];
        const newEditors = existingEditors.filter(editor => editor.userId !== action.userId);

        if (newEditors.length === 0) {
            const newSpriteEditors = Object.assign({}, state.spriteEditors);
            delete newSpriteEditors[spriteId];
            return Object.assign({}, state, {
                spriteEditors: newSpriteEditors
            });
        }

        return Object.assign({}, state, {
            spriteEditors: Object.assign({}, state.spriteEditors, {
                [spriteId]: newEditors
            })
        });
    }
    
    default:
        return state;
    }
};

const openCollaborationModal = function () {
    return {
        type: OPEN_COLLABORATION_MODAL
    };
};

const closeCollaborationModal = function () {
    return {
        type: CLOSE_COLLABORATION_MODAL
    };
};

const setCollaborationConnected = function (connected) {
    return {
        type: SET_COLLABORATION_CONNECTED,
        connected
    };
};

const setCollaborationUsers = function (users) {
    return {
        type: SET_COLLABORATION_USERS,
        users
    };
};

const setCollaborationError = function (error) {
    return {
        type: SET_COLLABORATION_ERROR,
        error
    };
};

const setCollaborationRoomId = function (roomId) {
    return {
        type: SET_COLLABORATION_ROOM_ID,
        roomId
    };
};

const setCollaborationRoomPrivacy = function (privacy) {
    return {
        type: SET_COLLABORATION_ROOM_PRIVACY,
        privacy
    };
};

const setCollaborationLoading = function (isLoading, message = null) {
    return {
        type: SET_COLLABORATION_LOADING,
        isLoading,
        message
    };
};

const setCollaborationHostLoadingProgress = function (progress) {
    return {
        type: SET_COLLABORATION_HOST_LOADING_PROGRESS,
        progress
    };
};

const setSpriteEditor = function (spriteId, userId, username, timestamp) {
    return {
        type: SET_SPRITE_EDITOR,
        spriteId,
        userId,
        username,
        timestamp
    };
};

const removeSpriteEditor = function (spriteId, userId) {
    return {
        type: REMOVE_SPRITE_EDITOR,
        spriteId,
        userId
    };
};

export {
    reducer as default,
    initialState as collaborationInitialState,
    openCollaborationModal,
    closeCollaborationModal,
    setCollaborationConnected,
    setCollaborationUsers,
    setCollaborationError,
    setCollaborationRoomId,
    setCollaborationRoomPrivacy,
    setCollaborationLoading,
    setCollaborationHostLoadingProgress,
    setSpriteEditor,
    removeSpriteEditor
};
