/**
 * GitHub OAuth 服务模块
 * 处理 GitHub OAuth 2.0 认证流程（使用 PKCE）
 */

class GitHubOAuthService {
    constructor() {
        // 默认配置（会被组件中的设置覆盖）
        this.backendUrl = 'https://02engine-oauth-backend.netlify.app/.netlify/functions/token';
        this.redirectUri = window.location.origin + window.location.pathname;
        this.tokenStorageKey = 'github_token';
        this.userStorageKey = 'github_user';
        this.emailStorageKey = 'github_email';
        this.clientIdStorageKey = 'github_oauth_client_id';
    }

    /**
     * 设置后端URL（新增方法）
     * @param {string} url - 后端服务URL
     */
    setBackendUrl(url) {
        this.backendUrl = url;
    }

    /**
     * 生成随机字符串
     * @param {number} length - 字符串长度
     * @returns {string} 随机字符串
     */
    generateRandomString(length) {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        const values = crypto.getRandomValues(new Uint8Array(length));
        return Array.from(values, x => possible[x % possible.length]).join('');
    }

    /**
     * SHA256 哈希并 base64url 编码
     * @param {string} plain - 明文字符串
     * @returns {Promise<string>} base64url 编码的哈希值
     */
    async sha256(plain) {
        if (!window.crypto?.subtle) throw new Error('需要 HTTPS 环境');
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        const hash = await window.crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(hash)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    /**
     * 启动 OAuth 认证流程
     * @param {string} clientId - GitHub OAuth App Client ID
     * @returns {Promise<void>}
     */
    async startOAuth(clientId) {
        if (!clientId) {
            throw new Error('Client ID is required');
        }

        // 检查是否在桌面环境中运行
        if (typeof EditorPreload !== 'undefined' && typeof EditorPreload.startGithubOAuth === 'function') {
            // 在桌面环境中，启动外部 OAuth 流程
            try {
                await EditorPreload.startGithubOAuth();
                // 保存客户端ID用于后续使用
                localStorage.setItem(this.clientIdStorageKey, clientId);
            } catch (error) {
                console.error('Desktop OAuth start failed:', error);
                throw error;
            }
        } else {
            // 在浏览器环境中，继续原有流程
            try {
                // 生成 PKCE 挑战码
                const codeVerifier = this.generateRandomString(128);
                const codeChallenge = await this.sha256(codeVerifier);

                // 保存到 sessionStorage
                sessionStorage.setItem('code_verifier', codeVerifier);
                sessionStorage.setItem('client_id', clientId);

                // 构建授权 URL
                const authUrl = new URL('https://github.com/login/oauth/authorize');
                authUrl.searchParams.append('client_id', clientId);
                authUrl.searchParams.append('redirect_uri', this.redirectUri);
                authUrl.searchParams.append('scope', 'repo,admin:org,admin:public_key,admin:repo_hook,admin:org_hook,gist,notifications,user,delete_repo,write:packages,read:packages,delete:packages,admin:gpg_key,workflow');
                authUrl.searchParams.append('code_challenge', codeChallenge);
                authUrl.searchParams.append('code_challenge_method', 'S256');
                authUrl.searchParams.append('state', this.generateRandomString(32));

                // 保存 Client ID
                localStorage.setItem(this.clientIdStorageKey, clientId);

                // 重定向到 GitHub
                window.location.href = authUrl.toString();
            } catch (error) {
                console.error('OAuth start failed:', error);
                throw error;
            }
        }
    }

    /**
     * 处理 OAuth 回调
     * @returns {Promise<Object>} 用户信息
     */
    async handleCallback() {
        // 检查是否在桌面环境中运行
        if (typeof EditorPreload !== 'undefined') {
            // 在桌面环境中，我们没有 URL 参数，而是通过主进程接收 token
            // 这个方法将被主进程调用，所以我们返回一个 Promise 并等待主进程发送 token
            return new Promise((resolve, reject) => {
                // 设置一个定时器，如果在一定时间内没有收到 token，则超时
                const timeout = setTimeout(() => {
                    reject(new Error('OAuth token timeout'));
                }, 30000); // 30秒超时

                // 注册接收 token 的回调
                const unsubscribe = EditorPreload.receiveOAuthToken((token) => {
                    clearTimeout(timeout);
                    if (unsubscribe) unsubscribe(); // 清理监听器
                    
                    // 使用接收到的 token 获取用户信息
                    this.processToken(token).then(result => {
                        resolve(result);
                    }).catch(error => {
                        reject(error);
                    });
                });
            });
        } else {
            // 在浏览器环境中，继续原有流程
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const state = params.get('state');

            if (!code) {
                throw new Error('No authorization code received');
            }

            const codeVerifier = sessionStorage.getItem('code_verifier');
            const clientId = sessionStorage.getItem('client_id');

            if (!codeVerifier || !clientId) {
                throw new Error('OAuth session data missing');
            }

            try {
                // 交换授权码获取访问令牌
                const response = await fetch(this.backendUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: code,
                        code_verifier: codeVerifier,
                        client_id: clientId,
                        redirect_uri: this.redirectUri
                    })
                });

                const data = await response.json();
                if (!response.ok || data.error) {
                    throw new Error(data.error_description || data.error || 'Token exchange failed');
                }

                const token = data.access_token;

                // 获取用户信息
                const userResponse = await fetch('https://api.github.com/user', {
                    headers: {
                        'Authorization': `token ${token}`,
                        'User-Agent': 'Scratch-GUI-OAuth'
                    }
                });

                if (!userResponse.ok) {
                    throw new Error('Failed to get user info');
                }

                const user = await userResponse.json();

                // 获取用户邮箱
                let email = user.email;
                if (!email) {
                    const emailResponse = await fetch('https://api.github.com/user/emails', {
                        headers: {
                            'Authorization': `token ${token}`,
                            'User-Agent': 'Scratch-GUI-OAuth'
                        }
                    });
                    const emails = await emailResponse.json();
                    email = emails.find(e => e.primary)?.email || 'Not public';
                }

                // 保存到本地存储
                localStorage.setItem(this.tokenStorageKey, token);
                localStorage.setItem(this.userStorageKey, JSON.stringify(user));
                localStorage.setItem(this.emailStorageKey, email);

                // 清理 sessionStorage
                sessionStorage.removeItem('code_verifier');
                sessionStorage.removeItem('client_id');

                // 清理 URL 参数
                window.history.replaceState({}, '', window.location.pathname);

                return { user, email, token };
            } catch (error) {
                console.error('OAuth callback failed:', error);
                throw error;
            }
        }
    }
    
    /**
     * 使用接收到的 token 处理用户信息
     * @param {string} token - GitHub 访问令牌
     * @returns {Promise<Object>} 用户信息
     */
    async processToken(token) {
        try {
            // 获取用户信息
            const userResponse = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token}`,
                    'User-Agent': 'Scratch-GUI-OAuth'
                }
            });

            if (!userResponse.ok) {
                throw new Error('Failed to get user info');
            }

            const user = await userResponse.json();

            // 获取用户邮箱
            let email = user.email;
            if (!email) {
                const emailResponse = await fetch('https://api.github.com/user/emails', {
                    headers: {
                        'Authorization': `token ${token}`,
                        'User-Agent': 'Scratch-GUI-OAuth'
                    }
                });
                const emails = await emailResponse.json();
                email = emails.find(e => e.primary)?.email || 'Not public';
            }

            // 保存到本地存储
            localStorage.setItem(this.tokenStorageKey, token);
            localStorage.setItem(this.userStorageKey, JSON.stringify(user));
            localStorage.setItem(this.emailStorageKey, email);

            return { user, email, token };
        } catch (error) {
            console.error('Process token failed:', error);
            throw error;
        }
    }

    /**
     * 获取保存的访问令牌
     * @returns {string|null} 访问令牌
     */
    getToken() {
        try {
            return localStorage.getItem(this.tokenStorageKey);
        } catch (error) {
            console.warn('Failed to get OAuth token:', error);
            return null;
        }
    }

    /**
     * 获取保存的用户信息
     * @returns {Object|null} 用户信息
     */
    getUserInfo() {
        try {
            const userJson = localStorage.getItem(this.userStorageKey);
            return userJson ? JSON.parse(userJson) : null;
        } catch (error) {
            console.warn('Failed to get user info:', error);
            return null;
        }
    }

    /**
     * 获取保存的用户邮箱
     * @returns {string|null} 用户邮箱
     */
    getUserEmail() {
        try {
            return localStorage.getItem(this.emailStorageKey);
        } catch (error) {
            console.warn('Failed to get user email:', error);
            return null;
        }
    }

    /**
     * 验证令牌是否有效
     * @param {string} token - 访问令牌（可选，默认使用保存的令牌）
     * @returns {Promise<boolean>} 令牌是否有效
     */
    async validateToken(token = null) {
        const tokenToCheck = token || this.getToken();
        if (!tokenToCheck) return false;

        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${tokenToCheck}`,
                    'User-Agent': 'Scratch-GUI-OAuth'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('Token validation failed:', error);
            return false;
        }
    }

    /**
     * 清除保存的认证信息
     */
    clearAuth() {
        try {
            localStorage.removeItem(this.tokenStorageKey);
            localStorage.removeItem(this.userStorageKey);
            localStorage.removeItem(this.emailStorageKey);
            localStorage.removeItem(this.clientIdStorageKey);
            sessionStorage.removeItem('code_verifier');
            sessionStorage.removeItem('client_id');
        } catch (error) {
            console.warn('Failed to clear OAuth data:', error);
        }
    }

    /**
     * 检查是否已认证
     * @returns {boolean} 是否已认证
     */
    isAuthenticated() {
        return !!(this.getToken() && this.getUserInfo());
    }

    /**
     * 获取保存的 Client ID
     * @returns {string|null} Client ID
     */
    getClientId() {
        try {
            return localStorage.getItem(this.clientIdStorageKey);
        } catch (error) {
            console.warn('Failed to get client ID:', error);
            return null;
        }
    }
}

// 导出单例实例
export default new GitHubOAuthService();
