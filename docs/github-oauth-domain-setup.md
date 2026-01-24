# GitHub OAuth 域名配置指南

本文档说明了如何为新的域名添加 GitHub OAuth 认证支持。

## 域名配置说明

系统通过 `DOMAIN_CONFIGS` 对象来管理不同域名的 OAuth 配置。每个域名需要配置以下信息：

1. `clientId` - GitHub OAuth App 的客户端 ID
2. `backendUrl` - 处理 OAuth 回调的后端服务 URL

## 添加新域名步骤

### 1. 创建 GitHub OAuth App

1. 访问 GitHub Settings > Developer settings > OAuth Apps
2. 点击 "New OAuth App"
3. 填写应用信息：
   - Application name: 为你的域名起一个名字
   - Homepage URL: 你的域名 URL
   - Authorization callback URL: 你的应用 URL（通常是 `https://your-domain.com/`）
4. 点击 "Register application"
5. 记录下生成的 "Client ID"

### 2. 配置后端服务

OAuth 认证需要一个后端服务来处理 GitHub 的回调，以保护 "Client Secret"。

你需要部署一个后端服务来处理 OAuth 回调，可以参考现有的实现：
- https://github.com/02studioxyz/02engine-oauth-backend

部署后记录下服务的 URL。

### 3. 在代码中添加域名配置

编辑 `src/components/github-oauth-modal/github-oauth-modal.jsx` 文件：

在 `DOMAIN_CONFIGS` 对象中添加新的域名配置：

```javascript
const DOMAIN_CONFIGS = {
    '02studio.xyz': {
        clientId: 'Ov23liShK8kmAipWUYCw',
        backendUrl: 'https://02engine-oauth-backend.netlify.app/.netlify/functions/token'
    },
    '0pen.top': {
        clientId: 'Ov23liAie81Wqd2u9gmK',
        backendUrl: 'https://02engine-0pen-oauth-backend.netlify.app/.netlify/functions/token'
    },
    // 添加你的新域名配置
    'your-new-domain.com': {
        clientId: 'your-client-id-here',
        backendUrl: 'https://your-backend-url.netlify.app/.netlify/functions/token'
    }
};
```

### 4. 测试配置

1. 部署你的应用到新域名
2. 访问应用并打开 GitHub OAuth 认证模态框
3. 点击 "Authenticate with GitHub" 按钮
4. 确认能够成功完成 OAuth 认证流程

## 注意事项

1. 确保后端服务 URL 是 HTTPS 的，因为 GitHub OAuth 要求 HTTPS 回调地址
2. Client Secret 绝对不能暴露在前端代码中，必须保存在后端服务中
3. 不同域名需要不同的 GitHub OAuth App 和后端服务配置
4. 如果需要支持子域名，可以在 `getDomainConfig` 函数中添加相应的匹配逻辑

## 故障排除

如果遇到问题，请检查：

1. GitHub OAuth App 的回调 URL 是否正确配置
2. 后端服务是否正常运行
3. 网络连接是否正常
4. 浏览器控制台是否有错误信息