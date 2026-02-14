import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import Modal from '../modal/modal.jsx';
import Input from '../forms/input.jsx';
import Label from '../forms/label.jsx';
import styles from './github-oauth-modal.css';
import githubOAuth from '../../lib/github-oauth.js';
import customTranslations from '../../lib/tw-custom-translations.js';

const messages = defineMessages({
    title: {
        id: 'gui.githubOAuth.title',
        defaultMessage: 'GitHub OAuth Authentication',
        description: 'Title of the GitHub OAuth modal'
    },
    clientIdLabel: {
        id: 'gui.githubOAuth.clientIdLabel',
        defaultMessage: 'GitHub OAuth App Client ID',
        description: 'Label for the Client ID input'
    },
    clientIdPlaceholder: {
        id: 'gui.githubOAuth.clientIdPlaceholder',
        defaultMessage: 'Enter your GitHub OAuth App Client ID',
        description: 'Placeholder for the Client ID input'
    },
    description: {
        id: 'gui.githubOAuth.description',
        defaultMessage: 'Authenticate with GitHub using OAuth 2.0 for secure access to your repositories.',
        description: 'Description of OAuth authentication'
    },
    setupInstructions: {
        id: 'gui.githubOAuth.setupInstructions',
        defaultMessage: 'To set up OAuth authentication:',
        description: 'Setup instructions header'
    },
    step1: {
        id: 'gui.githubOAuth.step1',
        defaultMessage: '1. Go to GitHub Settings > Developer settings > OAuth Apps',
        description: 'Step 1 of setup instructions'
    },
    step2: {
        id: 'gui.githubOAuth.step2',
        defaultMessage: '2. Create a new OAuth App or use an existing one',
        description: 'Step 2 of setup instructions'
    },
    step3: {
        id: 'gui.githubOAuth.step3',
        defaultMessage: '3. Set Authorization callback URL to: {callbackUrl}',
        description: 'Step 3 of setup instructions'
    },
    step4: {
        id: 'gui.githubOAuth.step4',
        defaultMessage: '4. Copy the Client ID and paste it below',
        description: 'Step 4 of setup instructions'
    },
    authenticateButton: {
        id: 'gui.githubOAuth.authenticateButton',
        defaultMessage: 'Authenticate with GitHub',
        description: 'Button to start OAuth authentication'
    },
    cancelButton: {
        id: 'gui.githubOAuth.cancelButton',
        defaultMessage: 'Cancel',
        description: 'Button to cancel authentication'
    },
    loading: {
        id: 'gui.githubOAuth.loading',
        defaultMessage: 'Authenticating...',
        description: 'Loading message during authentication'
    },
    userInfoTitle: {
        id: 'gui.githubOAuth.userInfoTitle',
        defaultMessage: 'Authenticated User',
        description: 'Title for authenticated user info'
    },
    logoutButton: {
        id: 'gui.githubOAuth.logoutButton',
        defaultMessage: 'Logout',
        description: 'Button to logout'
    },
    tokenStatus: {
        id: 'gui.githubOAuth.tokenStatus',
        defaultMessage: 'Token Status: {status}',
        description: 'Token status display'
    }
});

// 域名配置映射
const DOMAIN_CONFIGS = {
    '02studio.xyz': {
        clientId: 'Ov23liShK8kmAipWUYCw',
        backendUrl: 'https://02engine-oauth-backend.netlify.app/.netlify/functions/token'
    },
    '0pen.top': {
        clientId: 'Ov23liAie81Wqd2u9gmK',
        backendUrl: 'https://02engine-0pen-oauth-backend.netlify.app/.netlify/functions/token' 
    },
    '02engine.org': {
        clientId: 'Ov23likcDcsmzKCashVK',
        backendUrl: 'https://02engine-org-oauth-backend.netlify.app/.netlify/functions/token' 
    }
    // 示例：添加新的域名配置
    // 'your-domain.com': {
    //     clientId: 'your-github-oauth-app-client-id',
    //     backendUrl: 'https://your-backend-service.netlify.app/.netlify/functions/token'
    // }
};

// 获取当前域名配置
const getDomainConfig = () => {
    const currentDomain = window.location.hostname;
    
    // 检查是否在 Electron 环境中
    const isElectron = typeof window.EditorPreload !== 'undefined';
    
    if (isElectron) {
        // 在 Electron 环境中，直接使用内置的配置而不显示警告
        return DOMAIN_CONFIGS['02studio.xyz'];
    }
    
    // 精确匹配域名
    if (DOMAIN_CONFIGS[currentDomain]) {
        return DOMAIN_CONFIGS[currentDomain];
    }
    
    // 子域名匹配（如 www.02studio.xyz -> 02studio.xyz）
    const domainParts = currentDomain.split('.');
    if (domainParts.length >= 2) {
        const rootDomain = domainParts.slice(-2).join('.');
        if (DOMAIN_CONFIGS[rootDomain]) {
            return DOMAIN_CONFIGS[rootDomain];
        }
    }
    
    // 默认使用 02studio.xyz 配置
    console.warn(customTranslations.t('git.domainConfigWarning', {domain: currentDomain}));
    return DOMAIN_CONFIGS['02studio.xyz'];
};

const GitHubOAuthModal = props => {
    const {
        intl,
        isOpen,
        onCancel,
        onSuccess,
        onError
    } = props;

    const [isAuthenticating, setIsAuthenticating] = React.useState(false);
    const [userInfo, setUserInfo] = React.useState(null);
    const [error, setError] = React.useState('');

    // 根据域名获取配置
    const domainConfig = React.useMemo(() => getDomainConfig(), []);
    const CLIENT_ID = domainConfig.clientId;

    // 设置后端URL（在组件挂载时）
    React.useEffect(() => {
        githubOAuth.setBackendUrl(domainConfig.backendUrl);
    }, [domainConfig.backendUrl]);

    // 组件初始化时检查是否已认证与订阅桌面端日志
    React.useEffect(() => {
        if (isOpen) {
            const savedUserInfo = githubOAuth.getUserInfo();
            if (savedUserInfo) {
                setUserInfo({
                    ...savedUserInfo,
                    email: githubOAuth.getUserEmail()
                });
            }

            // 检查 URL 参数是否包含 OAuth 回调
            const params = new URLSearchParams(window.location.search);
            if (params.has('code')) {
                handleOAuthCallback();
            }
        }
        // 订阅桌面端日志（仅在 Electron 环境）并通过 console.log 输出
        if (isOpen && typeof window.EditorPreload !== 'undefined' && window.EditorPreload.onDesktopLog) {
            const unsub = window.EditorPreload.onDesktopLog((data) => {
                try {
                    const line = `[${new Date(data.timestamp).toLocaleTimeString()}] ${String(data.level).toUpperCase()}: ${data.message}`;
                    console.log('[Desktop OAuth]', line);
                } catch (e) {
                    // ignore
                }
            });
            return () => {
                if (typeof unsub === 'function') unsub();
            };
        }
    }, [isOpen]);

    const handleOAuthCallback = async () => {
        try {
            setIsAuthenticating(true);
            setError('');

            const result = await githubOAuth.handleCallback();
            setUserInfo({
                ...result.user,
                email: result.email
            });

            onSuccess && onSuccess(result);
        } catch (err) {
            console.error('OAuth callback failed:', err);
            setError(err.message);
            onError && onError(err);
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleAuthenticate = async () => {
        try {
            setIsAuthenticating(true);
            setError('');

            // 检查是否在 Electron 环境中
    const isElectron = typeof window.EditorPreload !== 'undefined';
    
    if (isElectron) {
        // 在 Electron 环境中，设置事件监听器
        const handleOAuthCompleted = (data) => {
            console.log('收到桌面端OAuth完成事件:', data);
            // 如果拿到 token，就存入 localStorage 并重载界面
            if (data && data.token) {
                try {
                    localStorage.setItem('github_token', data.token);
                    console.log('[Desktop OAuth] 存储 github_token 到 localStorage');
                } catch (e) {
                    console.error('[Desktop OAuth] 存储 token 失败:', e);
                }
                // 小延迟后重载以让应用读取新 token
                setTimeout(() => {
                    try {
                        window.location.reload();
                    } catch (e) {
                        console.error('[Desktop OAuth] 重载页面失败:', e);
                    }
                }, 50);
            }

            if (data.user) {
                setUserInfo({
                    ...data.user,
                    email: data.email
                });
            } else {
                setUserInfo(null);
            }
            setIsAuthenticating(false);
            onSuccess && onSuccess(data);
        };
        
        const handleOAuthError = (data) => {
            console.error('收到桌面端OAuth错误事件:', data);
            setError(data.error || 'OAuth认证失败');
            setIsAuthenticating(false);
            onError && onError(new Error(data.error || 'OAuth认证失败'));
        };
        
        // 设置事件监听器
        window.EditorPreload.onOAuthCompleted(handleOAuthCompleted);
        window.EditorPreload.onOAuthError(handleOAuthError);
        
        // 启动 OAuth
        const result = await githubOAuth.startOAuth(CLIENT_ID);
        
        // 如果startOAuth立即返回了结果（不应该发生），处理它
        if (result) {
            setUserInfo({
                ...result.user,
                email: result.email
            });
            onSuccess && onSuccess(result);
        }
    } else {
                // 在浏览器环境中，启动 OAuth（这将重定向页面）
                await githubOAuth.startOAuth(CLIENT_ID);
            }
        } catch (err) {
            console.error('OAuth start failed:', err);
            setError(err.message);
            onError && onError(err);
            setIsAuthenticating(false);
        }
    };

    const handleLogout = () => {
        githubOAuth.clearAuth();
        setUserInfo(null);
        setError('');
    };

    const handleCancel = () => {
        if (!isAuthenticating) {
            onCancel && onCancel();
        }
    };

    const callbackUrl = window.location.origin + window.location.pathname;

    return (
        <Modal
            className={styles.modalContent}
            contentLabel={intl.formatMessage(messages.title)}
            isOpen={isOpen}
            onRequestClose={handleCancel}
        >
            <Box className={styles.container}>
                <Box className={styles.content}>
                    <h2 className={styles.title}>
                        <FormattedMessage {...messages.title} />
                    </h2>

                    <p className={styles.description}>
                        <FormattedMessage {...messages.description} />
                    </p>

                    {userInfo ? (
                        // 已认证状态 - 绿色成功样式
                        <div className={styles.authenticatedSection}>
                            <h4 className={styles.authenticatedTitle}>
                                <FormattedMessage {...messages.userInfoTitle} />
                            </h4>
                            <div className={styles.userInfoCard}>
                                <div className={styles.userInfoContent}>
                                    {userInfo.avatar_url && (
                                        <img
                                            src={userInfo.avatar_url}
                                            alt="Avatar"
                                            className={styles.userAvatar}
                                        />
                                    )}
                                    <div className={styles.userDetails}>
                                        <div className={styles.userName}>
                                            {userInfo.name || userInfo.login}
                                        </div>
                                        <div className={styles.userLogin}>
                                            @{userInfo.login}
                                        </div>
                                        {userInfo.email && (
                                            <div className={styles.userEmail}>
                                                {userInfo.email}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        className={styles.logoutButtonSmall}
                                        onClick={handleLogout}
                                        title="Logout"
                                    >
                                        <FormattedMessage {...messages.logoutButton} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        // 未认证状态 - 现代化的OAuth登录界面
                        <div className={styles.oauthSection}>
                            <h4 className={styles.oauthTitle}>
                                {customTranslations.t('git.oauthTitle')}
                            </h4>
                            <p className={styles.oauthDescription}>
                                {customTranslations.t('git.oauthDescription')}
                            </p>

                            {error && (
                                <div className={styles.errorMessage}>
                                    {error}
                                </div>
                            )}

                            <button
                                className={styles.githubLoginButton}
                                onClick={handleAuthenticate}
                                disabled={isAuthenticating}
                            >
                                {isAuthenticating ? (
                                    <span className={styles.loadingText}>
                                        <FormattedMessage {...messages.loading} />
                                    </span>
                                ) : (
                                    <>
                                        <svg className={styles.githubIcon} width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                        </svg>
                                        {customTranslations.t('git.useGitHubLogin')}
                                    </>
                                )}
                            </button>

                            {/* 显示当前使用的配置 */}
                            <div className={styles.domainInfo}>
                                {customTranslations.t('git.domainInfo', {domain: window.location.hostname})}
                            </div>
                        </div>
                    )}
                </Box>

                <Box className={styles.footer}>
                    <Button
                        className={styles.cancelButton}
                        onClick={handleCancel}
                        disabled={isAuthenticating}
                    >
                        <FormattedMessage {...messages.cancelButton} />
                    </Button>

                    {!userInfo && (
                        <Button
                            className={styles.authenticateButton}
                            onClick={handleAuthenticate}
                            disabled={isAuthenticating}
                        >
                            {isAuthenticating ? (
                                <FormattedMessage {...messages.loading} />
                            ) : (
                                <FormattedMessage {...messages.authenticateButton} />
                            )}
                        </Button>
                    )}
                </Box>
            </Box>
        </Modal>
    );
};

GitHubOAuthModal.propTypes = {
    intl: intlShape.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onCancel: PropTypes.func,
    onSuccess: PropTypes.func,
    onError: PropTypes.func
};

export default injectIntl(GitHubOAuthModal);
