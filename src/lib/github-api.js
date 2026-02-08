/**
 * GitHub API 服务模块
 * 处理与 GitHub API 的交互，包括认证、仓库操作和文件上传
 * 支持 OAuth 令牌和 Personal Access Token
 */

import githubOAuth from './github-oauth.js';

class GitHubApiService {
    constructor() {
        this.baseApiUrl = 'https://api.github.com';
        this.tokenStorageKey = 'github-personal-token';
    }

    /**
     * 保存 Personal Access Token 到本地存储
     * @param {string} token - GitHub Personal Access Token
     */
    saveToken(token) {
        try {
            localStorage.setItem(this.tokenStorageKey, token);
            return true;
        } catch (error) {
            console.warn('Failed to save GitHub token:', error);
            return false;
        }
    }

    /**
     * 从本地存储获取 Personal Access Token
     * @returns {string|null} 保存的 token，如果没有则返回 null
     */
    getToken() {
        try {
            return localStorage.getItem(this.tokenStorageKey);
        } catch (error) {
            console.warn('Failed to get GitHub token:', error);
            return null;
        }
    }

    /**
     * 清除保存的 token
     */
    clearToken() {
        try {
            localStorage.removeItem(this.tokenStorageKey);
            return true;
        } catch (error) {
            console.warn('Failed to clear GitHub token:', error);
            return false;
        }
    }

    /**
     * 获取有效的令牌（优先使用 OAuth 令牌，其次是 PAT）
     * @returns {string|null} 有效的令牌
     */
    getEffectiveToken() {
        // 优先使用 OAuth 令牌
        const oauthToken = githubOAuth.getToken();
        if (oauthToken) {
            return oauthToken;
        }

        // 回退到 Personal Access Token
        return this.getToken();
    }

    /**
     * 检查是否有任何有效的认证令牌
     * @returns {boolean} 是否有有效的令牌
     */
    hasAnyToken() {
        return !!(this.getEffectiveToken());
    }

    /**
     * 获取当前认证的用户信息
     * @returns {Object|null} 用户信息
     */
    getCurrentUserInfo() {
        // 优先使用 OAuth 用户信息
        const oauthUser = githubOAuth.getUserInfo();
        if (oauthUser) {
            return {
                ...oauthUser,
                authType: 'oauth',
                email: githubOAuth.getUserEmail()
            };
        }

        // 如果有 PAT，尝试获取用户信息（需要网络请求）
        const pat = this.getToken();
        if (pat) {
            // 注意：这里返回 null，因为获取 PAT 用户信息需要异步请求
            // 调用者应该使用 getUserInfo 方法
            return null;
        }

        return null;
    }

    /**
     * 清除所有认证信息（包括 OAuth 和 PAT）
     */
    clearAllAuth() {
        // 清除 OAuth 认证
        githubOAuth.clearAuth();
        // 清除 PAT
        this.clearToken();
    }

    /**
     * 验证 token 是否有效
     * @param {string} token - GitHub Personal Access Token
     * @returns {Promise<boolean>} token 是否有效
     */
    async validateToken(token) {
        try {
            const response = await fetch(`${this.baseApiUrl}/user`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            return response.ok;
        } catch (error) {
            console.error('Token validation failed:', error);
            return false;
        }
    }

    /**
     * 获取用户信息
     * @param {string} token - GitHub Personal Access Token
     * @returns {Promise<Object|null>} 用户信息
     */
    async getUserInfo(token) {
        try {
            const response = await fetch(`${this.baseApiUrl}/user`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get user info: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to get user info:', error);
            return null;
        }
    }

    /**
     * 检查仓库是否存在以及用户是否有权限
     * @param {string} token - GitHub Personal Access Token
     * @param {string} owner - 仓库所有者
     * @param {string} repo - 仓库名称
     * @returns {Promise<boolean>} 仓库是否存在且可访问
     */
    async checkRepository(token, owner, repo) {
        try {
            const response = await fetch(`${this.baseApiUrl}/repos/${owner}/${repo}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            return response.ok;
        } catch (error) {
            console.error('Failed to check repository:', error);
            return false;
        }
    }

    /**
     * 获取仓库的默认分支
     * @param {string} token - GitHub Personal Access Token
     * @param {string} owner - 仓库所有者
     * @param {string} repo - 仓库名称
     * @returns {Promise<string|null>} 默认分支名称
     */
    async getDefaultBranch(token, owner, repo) {
        try {
            const response = await fetch(`${this.baseApiUrl}/repos/${owner}/${repo}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get repository info: ${response.status}`);
            }

            const repoInfo = await response.json();
            return repoInfo.default_branch || 'main';
        } catch (error) {
            console.error('Failed to get default branch:', error);
            return null;
        }
    }

    /**
     * 获取文件的 SHA（如果文件存在）
     * @param {string} token - GitHub Personal Access Token
     * @param {string} owner - 仓库所有者
     * @param {string} repo - 仓库名称
     * @param {string} path - 文件路径
     * @param {string} branch - 分支名称
     * @returns {Promise<string|null>} 文件 SHA，如果文件不存在则返回 null
     */
    async getFileSha(token, owner, repo, path, branch) {
        try {
            const response = await fetch(`${this.baseApiUrl}/repos/${owner}/${repo}/contents/${path}?ref=${branch}&_t=${Date.now()}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.status === 404) {
                return null; // 文件不存在
            }

            if (!response.ok) {
                throw new Error(`Failed to get file info: ${response.status}`);
            }

            const fileInfo = await response.json();
            return fileInfo.sha;
        } catch (error) {
            console.error('Failed to get file SHA:', error);
            return null;
        }
    }

    /**
     * 将文件转换为 Base64 编码
     * @param {File} file - 文件对象
     * @returns {Promise<string>} Base64 编码的文件内容
     */
    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                // 移除 data URL 前缀，只保留 Base64 部分
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * 创建或更新文件
     * @param {string} token - GitHub Personal Access Token
     * @param {string} owner - 仓库所有者
     * @param {string} repo - 仓库名称
     * @param {string} path - 文件路径
     * @param {string} content - 文件内容（Base64 编码）
     * @param {string} message - 提交消息
     * @param {string} sha - 文件 SHA（更新时需要）
     * @param {string} branch - 分支名称
     * @returns {Promise<Object>} API 响应结果
     */
    async createOrUpdateFile(token, owner, repo, path, content, message, sha = null, branch = 'main') {
        try {
            const body = {
                message,
                content,
                branch
            };

            if (sha) {
                body.sha = sha;
            }

            const response = await fetch(`${this.baseApiUrl}/repos/${owner}/${repo}/contents/${path}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || `Failed to create/update file: ${response.status}`);
            }

            return {
                success: true,
                data: result
            };
        } catch (error) {
            console.error('Failed to create/update file:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 从 Base64 解码为 ArrayBuffer
     * @param {string} base64 - Base64 编码的字符串
     * @returns {ArrayBuffer} 解码后的 ArrayBuffer
     */
    base64ToArrayBuffer(base64) {
        try {
            console.log('🔍 [Git] Base64 input length:', base64.length);
            console.log('🔍 [Git] Base64 input preview:', base64.substring(0, 100));

            // Remove any potential whitespace or newlines from base64 string
            const cleanBase64 = base64.trim();

            const binaryString = atob(cleanBase64);
            console.log('🔍 [Git] Decoded binary string length:', binaryString.length);

            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            console.log('🔍 [Git] Created ArrayBuffer with byte length:', bytes.buffer.byteLength);
            return bytes.buffer;
        } catch (error) {
            console.error('❌ [Git] Base64 decode error:', error);
            throw new Error(`Failed to decode base64 content: ${error.message}`);
        }
    }

    /**
     * 获取仓库中的文件内容 - 简化版本
     * @param {string} token - GitHub Personal Access Token
     * @param {string} owner - 仓库所有者
     * @param {string} repo - 仓库名称
     * @param {string} path - 文件路径
     * @param {string} branch - 分支名称
     * @returns {Promise<Object>} 文件内容
     */
    async getFileContent(token, owner, repo, path, branch = 'main') {
        try {
            console.log('🔍 [Git] Starting fetch for:', { owner, repo, path, branch });

            // 创建超时控制器（2分钟超时）
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.log('⏰ [Git] Fetch timeout reached (2 minutes), aborting request');
                controller.abort();
            }, 120000); // 2分钟 = 120000毫秒

            // 方案1: 直接使用 raw.githubusercontent.com URL（最简单可靠）
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
            console.log('🔍 [Git] Trying raw URL:', rawUrl);

            let response = await fetch(rawUrl, {
                signal: controller.signal
            });

            if (response.ok) {
                clearTimeout(timeoutId); // 清除超时
                console.log('✅ [Git] Raw URL fetch successful');
                const arrayBuffer = await response.arrayBuffer();
                if (arrayBuffer.byteLength === 0) {
                    throw new Error('Downloaded file is empty');
                }
                return {
                    success: true,
                    content: arrayBuffer,
                    sha: null
                };
            }

            console.log('⚠️ [Git] Raw URL failed, status:', response.status);

            // 方案2: 如果raw URL失败，尝试带token的raw URL
            if (token) {
                console.log('🔍 [Git] Trying raw URL with token...');
                response = await fetch(rawUrl, {
                    headers: {
                        'Authorization': `token ${token}`
                    },
                    signal: controller.signal
                });

                if (response.ok) {
                    clearTimeout(timeoutId); // 清除超时
                    console.log('✅ [Git] Raw URL with token successful');
                    const arrayBuffer = await response.arrayBuffer();
                    if (arrayBuffer.byteLength === 0) {
                        throw new Error('Downloaded file is empty');
                    }
                    return {
                        success: true,
                        content: arrayBuffer,
                        sha: null
                    };
                }
                console.log('⚠️ [Git] Raw URL with token failed, status:', response.status);
            }

            // 方案3: 使用GitHub API的raw media type
            if (token) {
                console.log('🔍 [Git] Trying GitHub API with raw media type...');
                response = await fetch(`${this.baseApiUrl}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3.raw'
                    },
                    signal: controller.signal
                });

                if (response.ok) {
                    clearTimeout(timeoutId); // 清除超时
                    console.log('✅ [Git] GitHub API raw media type successful');
                    const arrayBuffer = await response.arrayBuffer();
                    if (arrayBuffer.byteLength === 0) {
                        throw new Error('Downloaded file is empty');
                    }
                    return {
                        success: true,
                        content: arrayBuffer,
                        sha: null
                    };
                }
                console.log('⚠️ [Git] GitHub API raw media type failed, status:', response.status);
            }

            // 方案4: 最后尝试标准GitHub API
            if (token) {
                console.log('🔍 [Git] Trying standard GitHub API...');
                response = await fetch(`${this.baseApiUrl}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    signal: controller.signal
                });

                if (response.ok) {
                    clearTimeout(timeoutId); // 清除超时
                    const responseText = await response.text();
                    console.log('🔍 [Git] Standard API response length:', responseText.length);

                    if (!responseText.trim()) {
                        throw new Error('Empty response from GitHub API');
                    }

                    try {
                        const fileInfo = JSON.parse(responseText);
                        console.log('🔍 [Git] Parsed fileInfo:', {
                            name: fileInfo.name,
                            size: fileInfo.size,
                            type: fileInfo.type,
                            hasContent: !!fileInfo.content,
                            hasDownloadUrl: !!fileInfo.download_url
                        });

                        if (fileInfo.type !== 'file') {
                            throw new Error(`Expected file but got ${fileInfo.type}`);
                        }

                        if (fileInfo.content) {
                            console.log('✅ [Git] Using content field');
                            return {
                                success: true,
                                content: this.base64ToArrayBuffer(fileInfo.content),
                                sha: fileInfo.sha
                            };
                        }

                        if (fileInfo.download_url) {
                            console.log('🔍 [Git] Using download_url from API response');
                            const downloadResponse = await fetch(fileInfo.download_url, {
                                headers: token ? { 'Authorization': `token ${token}` } : {},
                                signal: controller.signal
                            });

                            if (downloadResponse.ok) {
                                clearTimeout(timeoutId); // 清除超时
                                const arrayBuffer = await downloadResponse.arrayBuffer();
                                if (arrayBuffer.byteLength === 0) {
                                    throw new Error('Downloaded file is empty');
                                }
                                return {
                                    success: true,
                                    content: arrayBuffer,
                                    sha: fileInfo.sha
                                };
                            }
                        }
                    } catch (parseError) {
                        console.error('❌ [Git] Failed to parse API response:', parseError);
                    }
                }
            }

            throw new Error('All fetch methods failed. Please check the repository, branch, and file path.');

        } catch (error) {
            clearTimeout(timeoutId); // 清除超时
            console.error('❌ [Git] getFileContent failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 从仓库获取项目文件
     * @param {string} token - GitHub Personal Access Token
     * @param {string} repository - 仓库路径 (owner/repo)
     * @param {string} [projectPath='projects/project.sb3'] - 项目文件路径
     * @returns {Promise<Object>} 获取结果
     */
    async fetchProject(token, repository, projectPath = 'projects/project.sb3') {
        try {
            // 验证参数
            if (!token || typeof token !== 'string') {
                throw new Error('Token is required and must be a string');
            }

            if (!repository || typeof repository !== 'string') {
                throw new Error('Repository is required and must be a string');
            }

            const [owner, repo] = repository.split('/').filter(part => part.trim());
            if (!owner || !repo) {
                throw new Error('Invalid repository format. Expected: owner/repo');
            }

            // 验证 token
            const isTokenValid = await this.validateToken(token);
            if (!isTokenValid) {
                throw new Error('Invalid GitHub token');
            }

            // 检查仓库权限
            const hasRepoAccess = await this.checkRepository(token, owner, repo);
            if (!hasRepoAccess) {
                throw new Error('Repository not found or no access permission');
            }

            // 获取默认分支
            const defaultBranch = await this.getDefaultBranch(token, owner, repo);
            if (!defaultBranch) {
                throw new Error('Failed to get default branch');
            }

            // 获取项目文件
            const projectResult = await this.getFileContent(token, owner, repo, projectPath, defaultBranch);

            if (!projectResult.success) {
                throw new Error(projectResult.error || 'Failed to fetch project file');
            }

            return {
                success: true,
                projectData: projectResult.content,
                repository: repository,
                branch: defaultBranch,
                filePath: projectPath
            };

        } catch (error) {
            console.error('Project fetch failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 创建 Pull Request
     * @param {string} token - GitHub Personal Access Token
     * @param {string} owner - 仓库所有者
     * @param {string} repo - 仓库名称
     * @param {string} title - PR 标题
     * @param {string} description - PR 描述
     * @param {string} head - 源分支
     * @param {string} base - 目标分支
     * @returns {Promise<Object>} PR 创建结果
     */
    async createPullRequest(token, owner, repo, title, description, head, base) {
        try {
            const response = await fetch(`${this.baseApiUrl}/repos/${owner}/${repo}/pulls`, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    body: description,
                    head,
                    base
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || `Failed to create pull request: ${response.status}`);
            }

            return {
                success: true,
                data: result
            };
        } catch (error) {
            console.error('Failed to create pull request:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 检查仓库是否支持 Pull Request
     * @param {string} token - GitHub Personal Access Token
     * @param {string} owner - 仓库所有者
     * @param {string} repo - 仓库名称
     * @returns {Promise<boolean>} 是否支持 PR
     */
    async supportsPullRequests(token, owner, repo) {
        try {
            const response = await fetch(`${this.baseApiUrl}/repos/${owner}/${repo}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                return false;
            }

            const repoInfo = await response.json();
            return !repoInfo.fork && repoInfo.permissions?.push;
        } catch (error) {
            console.error('Failed to check PR support:', error);
            return false;
        }
    }

    /**
     * 提交项目到 GitHub 仓库
     * @param {Object} options - 提交选项
     * @param {string} options.token - GitHub Personal Access Token
     * @param {string} options.repository - 仓库路径 (owner/repo)
     * @param {File} options.sb3File - SB3 项目文件
     * @param {File} [options.readmeFile] - README 文件（可选）
     * @param {string} [options.commitMessage] - 提交消息
     * @param {string} [options.summary] - 提交摘要
     * @param {string} [options.description] - 提交描述
     * @returns {Promise<Object>} 提交结果
     */
    async commitProject(options) {
        const {
            token,
            repository,
            sb3File,
            readmeFile = null,
            commitMessage = `Upload project ${sb3File.name}`,
            summary = '',
            description = ''
        } = options;

        try {
            // 构建完整的提交消息
            const fullCommitMessage = summary ?
                `${summary}\n\n${description}` :
                commitMessage;
            // 解析仓库路径
            const [owner, repo] = repository.split('/').filter(part => part.trim());
            if (!owner || !repo) {
                throw new Error('Invalid repository format. Expected: owner/repo');
            }

            // 验证 token
            const isTokenValid = await this.validateToken(token);
            if (!isTokenValid) {
                throw new Error('Invalid GitHub token');
            }

            // 检查仓库权限
            const hasRepoAccess = await this.checkRepository(token, owner, repo);
            if (!hasRepoAccess) {
                throw new Error('Repository not found or no access permission');
            }

            // 获取默认分支
            const defaultBranch = await this.getDefaultBranch(token, owner, repo);
            if (!defaultBranch) {
                throw new Error('Failed to get default branch');
            }

            const results = [];

            // 上传 SB3 文件
            const sb3Content = await this.fileToBase64(sb3File);
            const sb3Path = `projects/${sb3File.name}`;
            const sb3Sha = await this.getFileSha(token, owner, repo, sb3Path, defaultBranch);

            const sb3Result = await this.createOrUpdateFile(
                token,
                owner,
                repo,
                sb3Path,
                sb3Content,
                fullCommitMessage,
                sb3Sha,
                defaultBranch
            );
            results.push({ file: sb3File.name, result: sb3Result });

            // 如果有 README 文件，也上传
            if (readmeFile) {
                const readmeContent = await this.fileToBase64(readmeFile);
                const readmePath = 'README.md';
                const readmeSha = await this.getFileSha(token, owner, repo, readmePath, defaultBranch);

                const readmeResult = await this.createOrUpdateFile(
                    token,
                    owner,
                    repo,
                    readmePath,
                    readmeContent,
                    fullCommitMessage,
                    readmeSha,
                    defaultBranch
                );
                results.push({ file: readmeFile.name, result: readmeResult });
            }

            // 检查是否所有操作都成功
            const allSuccessful = results.every(r => r.result.success);
            const errors = results.filter(r => !r.result.success).map(r => r.result.error);

            return {
                success: allSuccessful,
                results,
                errors: errors.length > 0 ? errors : null,
                repository: repository,
                branch: defaultBranch
            };

        } catch (error) {
            console.error('Project commit failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// 导出单例实例
export default new GitHubApiService();
