import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import {FormattedMessage, injectIntl, intlShape} from 'react-intl';
import Button from '../button/button.jsx';
import MenuLabel from '../menu-bar/tw-menu-label.jsx';
import MenuBarMenu from '../menu-bar/menu-bar-menu.jsx';
import {MenuItem, MenuSection} from '../menu/menu.jsx';
import styles from './flarum-login.css';
import {loadFlarumConfig, getDefaultForum} from '../../lib/flarum/config';
import {getCurrentUser} from '../../lib/flarum/api';

class FlarumLogin extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            loggedIn: false,
            user: null,
            token: '',
            isAuthenticating: false,
            menuOpen: false,
            showForumSelector: false,
            forums: [],
            selectedForumId: null
        };
        this.onMessage = this.onMessage.bind(this);
    }

    updateToken (token) {
        this.setState({token});
        if (this.props.onTokenUpdate) {
            this.props.onTokenUpdate(token);
        }
    }

    componentDidMount () {
        window.addEventListener('message', this.onMessage);
        // 检查localStorage中是否有已保存的token
        this.checkSavedToken();
        // 检查URL参数是否有OAuth回调
        this.checkUrlForOAuthCallback();
        // debug: confirm mount
        // eslint-disable-next-line no-console
        console.log('FlarumLogin mounted', this.state);
    }
    componentWillUnmount () {
        window.removeEventListener('message', this.onMessage);
        // eslint-disable-next-line no-console
        console.log('FlarumLogin unmounted');
    }

    async checkUrlForOAuthCallback () {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');

        // 先检查 sessionStorage 中是否有 Flarum OAuth 的 state 记录
        // 如果没有，说明这个回调不是 Flarum OAuth 发起的（可能是 GitHub OAuth 等），直接跳过
        const savedState = sessionStorage.getItem('flarum_oauth_state');
        if (!savedState) {
            return;
        }

        if (error) {
            alert(this.props.intl.formatMessage({id: 'gui.flarumLogin.authorizationFailed', defaultMessage: 'Authorization failed: {error}', description: 'Authorization failed'}, {error: error}));
            // 清理URL
            sessionStorage.removeItem('flarum_oauth_state');
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }

        if (code && state) {
            // 验证state参数防止CSRF攻击
            if (state !== savedState) {
                alert(this.props.intl.formatMessage({id: 'gui.flarumLogin.stateValidationFailed', defaultMessage: 'State validation failed, please re-authorize', description: 'State validation failed'}));
                // 清理URL
                sessionStorage.removeItem('flarum_oauth_state');
                window.history.replaceState({}, document.title, window.location.pathname);
                return;
            }

            // 处理OAuth回调
            await this.handleOAuthCallback(code, state);
            // 清理URL和state
            sessionStorage.removeItem('flarum_oauth_state');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    async handleOAuthCallback (code, state) {
        // 设置认证状态
        this.setState({isAuthenticating: true});

        const config = await loadFlarumConfig();
        
        // 从sessionStorage中获取之前选中的论坛，如果没有则使用默认论坛
        let forum = null;
        const savedForum = sessionStorage.getItem('flarum_selected_forum');
        if (savedForum) {
            try {
                forum = JSON.parse(savedForum);
                sessionStorage.removeItem('flarum_selected_forum');
            } catch (e) {
                console.warn('解析保存的论坛信息失败：', e);
                forum = getDefaultForum(config);
            }
        } else {
            forum = getDefaultForum(config);
        }

        if (!forum) {
            this.setState({isAuthenticating: false});
            alert(this.props.intl.formatMessage({id: 'gui.flarumLogin.forumNotConfigured', defaultMessage: 'Forum not configured', description: 'Forum not configured'}));
            return;
        }

        const clientId = forum.oauth && forum.oauth.clientId;
        const clientSecret = forum.oauth && forum.oauth.clientSecret;
        const redirectUri = window.location.origin + window.location.pathname;

        if (!clientSecret) {
            this.setState({isAuthenticating: false});
            alert(this.props.intl.formatMessage({id: 'gui.flarumLogin.clientSecretNotConfigured', defaultMessage: 'clientSecret not configured, please add it to flarum.config.json', description: 'clientSecret not configured'}));
            return;
        }

        try {
            // 直接使用 clientSecret 交换 token
            const tokenResponse = await fetch(`${forum.baseUrl.replace(/\/$/, '')}/oauth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri,
                    client_id: clientId,
                    client_secret: clientSecret
                })
            });

            if (!tokenResponse.ok) {
                throw new Error(`Token exchange failed: ${tokenResponse.status}`);
            }

            const tokenData = await tokenResponse.json();

            if (tokenData.error) {
                throw new Error(`OAuth Error: ${tokenData.error_description || tokenData.error}`);
            }

            const token = tokenData.access_token;
            // 将token存储到localStorage
            localStorage.setItem('flarum_token', token);
            // 保存论坛信息
            localStorage.setItem('flarum_forum_info', JSON.stringify(forum));

            let user = null;
            try {
                user = await getCurrentUser(forum.baseUrl, token);
            } catch (e) {
                console.warn('获取用户信息失败：', e.message);
                // 即使获取用户信息失败，也允许登录
            }

            this.updateToken(token);
            this.setState({loggedIn: true, user, isAuthenticating: false});
        } catch (err) {
            this.setState({isAuthenticating: false});
            alert(this.props.intl.formatMessage({id: 'gui.flarumLogin.authenticationFailed', defaultMessage: 'OAuth authentication failed: {error}', description: 'OAuth authentication failed'}, {error: err.message}));
        }
    }

    async onMessage (e) {
        const m = e.data || {};
        if (m && m.type === 'flarum-oauth-callback') {
            if (m.error) {
                alert(this.props.intl.formatMessage({id: 'gui.flarumLogin.authorizationFailed', defaultMessage: 'Authorization failed: {error}', description: 'Authorization failed'}, {error: m.error}));
                return;
            }
            // m.code + m.state
            // 如果配置了 exchangeEndpoint，我们可以发往后端换取 token
            const config = await loadFlarumConfig();
            const forum = getDefaultForum(config);
            if (!forum) return alert(this.props.intl.formatMessage({id: 'gui.flarumLogin.forumNotConfigured', defaultMessage: 'Forum not configured', description: 'Forum not configured'}));
            const exchange = forum.oauth && forum.oauth.exchangeEndpoint;
            if (exchange) {
                try {
                    const resp = await fetch(exchange, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({code: m.code, redirect_uri: forum.oauth.redirectUri, clientId: forum.oauth.clientId})
                    });
                    if (!resp.ok) throw new Error('换取 token 失败');
                    const data = await resp.json();
                    const token = data.token;
                    let user = data.user || null;
                    if (!user) {
                        try {
                            user = await getCurrentUser(forum.baseUrl, token);
                        } catch (e) {
                            // 忽略 user 获取失败
                        }
                    }
                    this.setState({token, loggedIn: true, user});
                } catch (err) {
                    alert('无法自动换取 token: ' + err.message + '\n你可以在设置里粘贴 API Token 以继续');
                }
            } else {
                // 没有后端，提示用户粘贴 token
                const token = prompt('请将服务器端用 code 换 token 后把 Bearer token 粘贴到此处（例如：Bearer xxxxx）：');
                if (token) {
                    let clean = token.trim();
                    if (clean.toLowerCase().startsWith('bearer ')) clean = clean.split(' ')[1];
                    let user = null;
                    try {
                        user = await getCurrentUser(forum.baseUrl, clean);
                    } catch (e) {
                        // 用户获取失败时仍然允许登录，但会提示
                        console.warn('获取用户信息失败：', e.message);
                    }
                    this.setState({token: clean, loggedIn: true, user});
                }
            }
        }
    }

    async startOAuth () {
        // 加载配置
        const config = await loadFlarumConfig();
        const forums = config.forums || [];

        if (forums.length === 0) {
            alert(this.props.intl.formatMessage({id: 'gui.flarumLogin.forumNotConfiguredPrompt', defaultMessage: 'Forum not configured (please add it to flarum.config.json)', description: 'Forum not configured prompt'}));
            return;
        }

        // 如果只有一个论坛，直接进行OAuth认证
        if (forums.length === 1) {
            await this.performOAuth(forums[0]);
            return;
        }

        // 如果有多个论坛，显示选择框
        this.setState({
            showForumSelector: true,
            forums: forums,
            selectedForumId: forums[0].name
        });
    }

    async performOAuth (forum) {
        this.setState({isAuthenticating: true, showForumSelector: false});

        const clientId = forum.oauth && forum.oauth.clientId;
        const scope = forum.oauth && forum.oauth.scope || 'user.read discussions.create discussions.read uploads.create';
        if (!clientId) {
            this.setState({isAuthenticating: false});
            return alert(this.props.intl.formatMessage({id: 'gui.flarumLogin.clientIdNotSet', defaultMessage: 'forum.oauth.clientId is not set', description: 'clientId not set'}));
        }

        // 生成随机state用于CSRF保护
        const state = Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem('flarum_oauth_state', state);
        // 保存当前选中的论坛信息到sessionStorage，用于OAuth回调时使用
        sessionStorage.setItem('flarum_selected_forum', JSON.stringify(forum));

        // 使用当前页面的URL作为redirectUri
        const redirectUri = window.location.origin + window.location.pathname;

        // 使用授权码模式发起授权
        const authUrl = `${forum.baseUrl.replace(/\/$/, '')}/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
        window.location.href = authUrl;
    }

    handleForumSelect (forum) {
        this.performOAuth(forum);
    }

    handleCloseForum () {
        this.setState({showForumSelector: false, isAuthenticating: false});
    }

    async checkSavedToken() {
        const savedToken = localStorage.getItem('flarum_token');
        if (savedToken) {
            try {
                // 验证token是否仍然有效
                const config = await loadFlarumConfig();
                const forum = getDefaultForum(config);
                if (forum) {
                    const user = await getCurrentUser(forum.baseUrl, savedToken);
                    this.updateToken(savedToken);
                    this.setState({loggedIn: true, user});
                }
            } catch (error) {
                console.warn('保存的token已失效:', error);
                // 如果token失效，清除它
                localStorage.removeItem('flarum_token');
            }
        }
    }

    logout () {
        // 清除localStorage中的token
        localStorage.removeItem('flarum_token');
        this.setState({loggedIn: false, user: null, token: ''});
        // 通知父组件登录状态变化
        if (this.props.onTokenUpdate) {
            this.props.onTokenUpdate('');
        }
    }

    render () {
        const {loggedIn, user, isAuthenticating, showForumSelector, forums} = this.state;

        // 论坛选择对话框
        if (showForumSelector) {
            return (
                <div className={styles.modalOverlay} onClick={this.handleCloseForum.bind(this)}>
                    <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>
                                <FormattedMessage
                                    defaultMessage="Select Forum"
                                    description="Select forum to authenticate"
                                    id="gui.flarumLogin.selectForum"
                                />
                            </h2>
                            <button className={styles.closeBtn} onClick={this.handleCloseForum.bind(this)}>×</button>
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.forumList}>
                                {forums.map((forum) => (
                                    <button
                                        key={forum.name}
                                        className={styles.forumItem}
                                        onClick={() => this.handleForumSelect(forum)}
                                        disabled={isAuthenticating}
                                    >
                                        <div className={styles.forumName}>{forum.name}</div>
                                        <div className={styles.forumUrl}>{forum.baseUrl}</div>
                                        {isAuthenticating && <span className={styles.loadingSpinner}></span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (loggedIn) {
            return (
                <MenuLabel
                    open={this.state.menuOpen}
                    onOpen={() => this.setState({menuOpen: true})}
                    onClose={() => this.setState({menuOpen: false})}
                    className={styles.withShadow}
                >
                    {user && user.avatarUrl ? (
                        <img className={styles.flarumAvatar} src={user.avatarUrl} alt={user.username} />
                    ) : (
                        <div className={styles.flarumAvatarPlaceholder}>
                            {(user?.username || 'U')[0].toUpperCase()}
                        </div>
                    )}
                    <MenuBarMenu
                        className={styles.menuBarMenu}
                        open={this.state.menuOpen}
                        place={this.props.isRtl ? 'right' : 'left'}
                    >
                        <MenuItem onClick={() => {
                            this.setState({menuOpen: false});
                            this.props.onOpenComposer && this.props.onOpenComposer();
                        }}>
                            <FormattedMessage
                                defaultMessage="Post"
                                description="Post to forum"
                                id="gui.flarumLogin.post"
                            />
                        </MenuItem>
                        <MenuItem onClick={() => {
                            this.logout();
                            this.setState({menuOpen: false});
                        }}>
                            <FormattedMessage
                                defaultMessage="Logout"
                                description="Logout from forum"
                                id="gui.flarumLogin.logout"
                            />
                        </MenuItem>
                    </MenuBarMenu>
                </MenuLabel>
            );
        }
        return (
            <button className={styles.flarumLoginBtn} onClick={() => this.startOAuth()} disabled={isAuthenticating}>
                <svg className={styles.flarumIcon} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                </svg>
                <span>
                    {isAuthenticating ? (
                        <FormattedMessage
                            defaultMessage="Authenticating..."
                            description="Authenticating"
                            id="gui.flarumLogin.authenticating"
                        />
                    ) : (
                        <FormattedMessage
                            defaultMessage="Forum Login"
                            description="Forum login button"
                            id="gui.flarumLogin.button"
                        />
                    )}
                </span>
                {isAuthenticating && <span className={styles.loadingSpinner}></span>}
            </button>
        );
    }
}

FlarumLogin.propTypes = {
    isRtl: PropTypes.bool,
    intl: intlShape.isRequired
};
export default injectIntl(FlarumLogin);
