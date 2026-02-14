# Extension Debugger 接口文档

## 概述

Extension Debugger 是一个基于 WebSocket 的实时通信服务，允许外部调试服务器向 Scratch GUI 发送扩展代码，GUI 会自动加载扩展到当前作品中。

**服务器地址**: `ws://localhost:1101`

**协议**: WebSocket

## 连接流程

### GUI 端

1. 页面加载时，GUI 会自动尝试连接 `ws://localhost:1101`
2. 连接成功后开始 30 秒心跳机制
3. 接收服务器发送的扩展代码并自动加载

### 服务器端

1. 监听端口 1101
2. 等待客户端连接
3. 向客户端发送扩展代码
4. 处理客户端的心跳消息

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

**处理流程**:
1. GUI 接收到消息
2. 从代码中提取 `extensionId`（通过正则表达式匹配 `getInfo()` 方法中的 `id` 字段）
3. 检查扩展是否已存在于作品中
4. 如果已存在，先卸载旧扩展（移除相关积木）
5. 将 JS 代码转换为 Data URL
6. 调用 `vm.extensionManager.loadExtensionURL(dataURL)` 加载新扩展
7. 返回加载结果

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

## 扩展 ID 提取规则

GUI 使用正则表达式从扩展代码中提取 `extensionId`：

**规则 1**: 匹配 `getInfo()` 方法中的 `id` 字段
```javascript
/getInfo\s*\(\)\s*\{[\s\S]*?id:\s*['"`]([^'"`]+)['"`]/
```

**规则 2**: 匹配任意位置的 `id` 字段（备用）
```javascript
/id:\s*['"`]([^'"`]+)['"`]/
```

**示例**:
```javascript
// 这个代码的 extensionId 是 "my_extension"
class MyExtension {
    getInfo() {
        return {
            id: 'my_extension',
            name: 'My Extension'
        };
    }
}
```

## 扩展卸载逻辑

当检测到相同 ID 的扩展已存在时，会先卸载旧扩展：

1. 从 `vm.extensionManager._loadedExtensions` 中移除扩展
2. 加载新扩展

## 错误处理

### 连接错误

**错误类型**: WebSocket 连接失败

**处理方式**:
- 记录错误信息到控制台
- 标记 `connectionFailed = true`
- 停止心跳机制
- 在设置窗口显示"Connection failed (server not available)"
- 不再自动重连
- 用户可以手动点击按钮重连

### 扩展加载错误

**错误类型**: 代码解析失败、加载失败

**处理方式**:
- 捕获异常
- 记录错误信息到控制台
- 发送 `loadResult` 消息（success: false）
- 不影响 WebSocket 连接

### 代码解析错误

**错误类型**: 无效的扩展代码、无法提取 extensionId

**处理方式**:
- 捕获异常
- 记录错误信息到控制台
- 发送 `loadResult` 消息（success: false）
- 不影响 WebSocket 连接

## 心跳机制

- **发送方**: GUI → 服务器
- **频率**: 每 30 秒
- **消息格式**: `{ type: 'ping' }`
- **响应格式**: `{ type: 'pong' }`
- **目的**: 检测连接是否存活

## 状态管理

GUI 使用全局状态管理扩展调试服务的连接状态：

**连接状态查询**:
```javascript
window.ScratchExtensionDebug.isConnected()  // 返回布尔值，表示是否已连接
window.ScratchDebugService.isConnectionFailed()  // 返回布尔值，表示连接是否失败
```

**事件通知**:
```javascript
// 监听状态变化
window.addEventListener('extensionDebugStatus', (event) => {
    console.log('Status:', event.detail);
    // event.detail.connected: boolean
    // event.detail.error: string | undefined
});
```

## 服务器示例代码

### Node.js (使用 ws 库)

```javascript
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 1101 });

console.log('Extension debugging server listening on port 1101');

// 存储连接的客户端
const clients = new Set();

wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch (data.type) {
            case 'ping':
                // 响应心跳
                ws.send(JSON.stringify({ type: 'pong' }));
                break;
                
            case 'status':
                console.log('Client status:', data);
                break;
                
            case 'loadResult':
                console.log('Load result:', data);
                break;
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
    });

    // 示例：发送扩展代码
    setTimeout(() => {
        const extensionCode = `
class MyExtension {
    constructor(runtime) {
        this.runtime = runtime;
    }
    
    getInfo() {
        return {
            id: 'my_extension',
            name: 'My Extension',
            color1: '#ff0000',
            color2: '#cc0000',
            blocks: [
                {
                    opcode: 'myBlock',
                    text: 'my block',
                    blockType: 'command'
                }
            ]
        };
    }
    
    myBlock() {
        return 'Hello from extension!';
    }
}

module.exports = MyExtension;
`;
        
        ws.send(JSON.stringify({
            type: 'extension',
            code: extensionCode
        }));
    }, 2000); // 等待 2 秒后发送扩展代码
});
```

### Python (使用 websockets 库)

```python
import asyncio
import websockets

async def handle_extension_debug(websocket, path):
    print(f"Client connected from {path}")
    try:
        async for message in websocket:
            data = json.loads(message)
            
            if data.get('type') == 'ping':
                await websocket.send(json.dumps({'type': 'pong'}))
                print("Received ping, sent pong")
            
            elif data.get('type') == 'status':
                print(f"Client status: {data}")
            
            elif data.get('type') == 'loadResult':
                print(f"Load result: {data}")
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")

async def main():
    async with websockets.serve(handle_extension_debug, "localhost", 1101):
        await asyncio.Future()  # 永久运行

if __name__ == "__main__":
    asyncio.run(main())
```

### 手动测试

可以使用 WebSocket 客户端工具进行测试，例如：

```javascript
// 在浏览器控制台中
const ws = new WebSocket('ws://localhost:1101');

ws.onopen = () => {
    console.log('Connected to extension debugging server');
    
    // 发送测试扩展代码
    const extensionCode = `
class TestExtension {
    constructor(runtime) {
        this.runtime = runtime;
    }
    getInfo() {
        return {
            id: 'test_extension',
            name: 'Test Extension',
            color1: '#00ff00',
            color2: '#00cc00',
            blocks: [
                {
                    opcode: 'test',
                    text: 'test block',
                    blockType: 'command'
                }
            ]
        };
    }
    test() {
        return 'Hello from test extension!';
    }
}
module.exports = TestExtension;
`;
    
    ws.send(JSON.stringify({
        type: 'extension',
        code: extensionCode
    }));
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received:', data);
};

ws.onerror = (error) => {
    console.error('WebSocket error:', error);
};
```

## GUI 端使用方法

### 自动连接

页面加载时会自动尝试连接一次，无需手动操作。

### 手动重连

如果连接失败或断开，可以在高级设置中手动重连：

1. 点击"高级"菜单
2. 点击"高级设置"
3. 滚动到"Extension Debugging"部分
4. 查看当前连接状态
5. 如果未连接或连接失败，点击"Connect to Extension Debugging Server"按钮

### 连接状态

- **已连接**: "Connected to extension debugging server"
- **未连接**: "Not connected to extension debugging server"
- **连接失败**: "Connection failed (server not available)"

## 注意事项

1. **扩展 ID 必须唯一**: 如果已存在相同 ID 的扩展，会先卸载旧扩展再加载新扩展
2. **连接失败后不自动重连**: 避免页面加载时每次都尝试连接失败的端口
3. **手动重连**: 连接失败后需要用户手动点击按钮重连

## 常见问题

### Q: 如何知道扩展是否加载成功？
A: 
1. 查看服务器收到的 `loadResult` 消息，`success` 为 `true` 表示成功
2. 检查 GUI 的积木分类，应该出现新扩展的分类

### Q: 扩展 ID 是如何获取的？
A: GUI 会自动从扩展代码的 `getInfo()` 方法中提取 `id` 字段。

### Q: 可以同时加载多个扩展吗？
A: 可以，但每个扩展的 ID 必须唯一。如果 ID 相同，会先卸载旧扩展。

### Q: 连接断开后会自动重连吗？
A: 不会。需要用户手动点击"Connect to Extension Debugging Server"按钮重新连接。

### Q: 如何调试连接问题？
A: 
1. 检查控制台日志
2. 确认 WebSocket 服务器是否在 1101 端口监听
3. 检查防火墙设置
4. 使用 WebSocket 客户端工具测试连接

### Q: 扩展代码格式有什么要求？
A: 
- 必须导出一个类
- 该类必须有 `getInfo()` 方法
- `getInfo()` 必须返回包含 `id` 字段的对象
- 必须使用 `module.exports` 导出

### Q: 支持打包后的静态版本吗？
A: 完全支持。该功能不依赖任何后端服务，打包后可以正常使用。

### Q: 心跳机制的作用是什么？
A: 用于检测连接是否仍然存活。GUI 每 30 秒发送一次 ping，服务器应该响应 pong。如果没有响应，连接可能已经断开。

### Q: 如何处理连接失败？
A: GUI 会标记连接失败状态，在设置窗口显示错误信息。用户可以点击按钮重新连接。