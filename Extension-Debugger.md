# Extension Debugger 接口文档

## 概述

Extension Debugger 是一个基于 WebSocket 的实时通信服务，允许外部调试服务器向 Scratch GUI 发送扩展代码，GUI 会自动加载扩展到当前作品中。

**服务器地址**: `ws://localhost:1101`

**协议**: WebSocket

## 消息格式

所有消息均为 JSON 格式字符串。

### 服务器 → GUI

#### 1. 扩展加载请求

**类型**: `extension`

**格式**:
```json
{
    "type": "extension",
    "code": "完整的JS代码字符串"
}
```

**参数说明**:
- `type` (必需): 消息类型，固定为 `"extension"`
- `code` (必需): 扩展的完整 JavaScript 代码字符串

**要求**:
- 必须导出一个类
- 该类必须有 `getInfo()` 方法
- `getInfo()` 必须返回包含 `id` 字段的对象（用于标识扩展）

#### 2. 心跳响应

**类型**: `pong`

**格式**:
```json
{
    "type": "pong"
}
```

**说明**: 服务器响应 GUI 的 ping 消息，用于保持连接活跃。

### GUI → 服务器

#### 1. 状态更新

**类型**: `status`

**格式**:
```json
{
    "type": "status",
    "connected": true,
    "extensionId": "my_extension"
}
```

**参数说明**:
- `type` (必需): 消息类型，固定为 `"status"`
- `connected` (必需): 连接状态，`true` 表示已连接
- `extensionId` (可选): 当前加载的扩展 ID

**发送时机**:
- 连接成功时
- 扩展加载成功时

#### 2. 心跳

**类型**: `ping`

**格式**:
```json
{
    "type": "ping"
}
```

**发送时机**: 每 30 秒发送一次，用于检测连接是否存活

#### 3. 加载结果

**类型**: `loadResult`

**成功格式**:
```json
{
    "type": "loadResult",
    "success": true,
    "extensionId": "my_extension",
    "message": "Extension loaded successfully"
}
```

**失败格式**:
```json
{
    "type": "loadResult",
    "success": false,
    "error": "Error message here"
}
```

**参数说明**:
- `type` (必需): 消息类型，固定为 `"loadResult"`
- `success` (必需): 加载是否成功
- `extensionId` (成功时): 扩展 ID
- `message` (成功时): 成功消息
- `error` (失败时): 错误信息