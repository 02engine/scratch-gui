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
     * 检查是否在 Electron 环境中
     * @returns {boolean} 是否在 Electron 环境中
     */
    get isElectron() {
        return typeof window.EditorPreload !== 'undefined';
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
     * @returns {Promise<any>} - 在 Electron 环境中返回认证结果，否则返回 undefined
     */
    async startOAuth(clientId) {
        if (!clientId) {
            throw new Error('Client ID is required');
        }

        try {
            // 检查是否在 Electron 环境中
            if (this.isElectron) {
                // 在 Electron 中，使用 window.open 打开 oauth-proxy 页面
                // 它会被 handleWindowOpen 捕获并正确配置
                window.open('https://idyllic-kangaroo-a50663.netlify.app/', '_blank', 'width=600,height=800');
                
                // 启动轮询检查是否收到 token，并返回结果
                return await this.pollForToken();
            } else {
                // 在浏览器环境中，生成 PKCE 挑战码
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
            }
        } catch (error) {
            console.error('OAuth start failed:', error);
            throw error;
        }
    }

    /**
     * 轮询检查是否在 localStorage 中接收到 token
     * @returns {Promise<Object>} 用户信息
     */
    async pollForToken() {
        return new Promise((resolve, reject) => {
            const maxAttempts = 180; // 最多等待 90 秒 (180 次 * 500ms)
            let attempts = 0;
            
            const poll = async () => {
                attempts++;
                
                if (attempts > maxAttempts) {
                    reject(new Error('OAuth timeout: No token received within 90 seconds'));
                    return;
                }

                try {
                    // 检查是否在 localStorage 中存在 OAuth 相关信息
                    const token = localStorage.getItem('oauth_token_received');
                    const user = localStorage.getItem('github_user');
                    const email = localStorage.getItem('github_email');

                    if (token && user && email) {
                        // 清除临时存储
                        localStorage.removeItem('oauth_token_received');
                        
                        // 保存到正常的存储位置
                        localStorage.setItem(this.tokenStorageKey, token);
                        localStorage.setItem(this.userStorageKey, user);
                        localStorage.setItem(this.emailStorageKey, email);

                        // 返回用户信息
                        const userInfo = JSON.parse(user);
                        resolve({ user: userInfo, email, token });
                        return;
                    }
                } catch (error) {
                    console.error('Error checking for token:', error);
                }

                setTimeout(poll, 500); // 每 500ms 检查一次
            };

            // 立即开始轮询，然后定期检查
            poll();
        });
    }

    /**
     * 处理 OAuth 回调
     * @returns {Promise<Object>} 用户信息
     */
    async handleCallback() {
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
