# 02engine JavaScript 直接编码功能

## 概述

02engine 扩展了 Scratch GUI，允许开发者直接在 hat 积木的注释中编写 JavaScript 代码，跳过传统的积木到 JavaScript 的编译过程。当编译器检测到 `#code` 注释时，会直接使用注释中的 JavaScript 代码作为脚本执行体。

## 功能特性

- **直接 JavaScript 执行**：在注释中编写 JS 代码，直接编译执行
- **完整运行时访问**：可访问 Scratch VM 的全部内部 API
- **生成器函数支持**：支持 `yield` 关键字实现帧间暂停
- **参数传递**：支持自定义过程的参数访问
- **向后兼容**：与现有 Scratch 项目完全兼容

## 使用方法

### 1. 添加注释
在 hat 积木（如“当绿旗被点击”）上添加注释，格式如下：

```
#code
// 您的 JavaScript 代码
console.log("Hello from JS!");
target.setXY(100, 50);
```

或者在一行内：
```
#code console.log("单行代码");
```

### 2. 注释规则
- `#code` 必须独占一行或作为行的开头
- `#code` 后的所有行都将被视为 JavaScript 代码
- 支持多行 JavaScript 代码
- 注释中可以有其他内容，但只有 `#code` 部分会被解析

### 3. 代码编写
在 JavaScript 代码中，可以访问以下预定义变量：

| 变量名 | 类型 | 描述 |
|--------|------|------|
| `target` | `RenderedTarget` | 当前执行脚本的角色 |
| `runtime` | `Runtime` | Scratch 运行时实例 |
| `stage` | `RenderedTarget` | 舞台对象 |
| `thread` | `Thread` | 当前线程对象 |
| `p0`, `p1`, ... | `any` | 过程参数（仅当脚本是自定义过程时） |

## 技术实现

### 修改的文件

#### 1. `node_modules/scratch-vm/src/compiler/intermediate.js`
在 `IntermediateScript` 类中添加 `customCode` 属性：
```javascript
/**
 * Custom JavaScript code for this script, if any.
 * @type {string|null}
 */
this.customCode = null;
```

#### 2. `node_modules/scratch-vm/src/compiler/irgen.js`
重写 `readTopBlockComment` 方法，添加对 `#code` 注释的检测和解析。核心逻辑：
- 遍历注释行，检测以 `#code` 开头的行
- 收集后续所有行作为自定义 JavaScript 代码
- 自动检测 `yield` 关键字并设置 `yields` 标志
- 将代码存储到 `this.script.customCode`

#### 3. `node_modules/scratch-vm/src/compiler/jsgen.js`
修改 `compile` 方法，支持直接使用自定义 JavaScript 代码：
- 检查 `this.script.customCode` 是否存在
- 如果存在，直接将其作为脚本源代码
- 根据代码中是否包含 `yield` 关键字自动设置 `yields` 标志
- 跳过常规的 `descendStack` 和 `stopScript` 流程

### 编译流程
1. **解析阶段**：`irgen.js` 读取 hat 积木的注释，检测 `#code` 标记
2. **代码生成**：`jsgen.js` 如果发现 `customCode`，直接使用它作为脚本体
3. **执行**：编译后的函数在 Scratch 运行时中执行，可以访问完整的 API

## JavaScript API 参考

### 核心对象访问

#### target (RenderedTarget)
当前执行脚本的角色对象，提供精灵/舞台的所有属性和方法。

**常用方法：**
- `setXY(x, y, force)` - 设置位置
- `setDirection(direction)` - 设置方向
- `setVisible(visible)` - 设置可见性
- `setSize(size)` - 设置大小
- `setEffect(effectName, value)` - 设置特效
- `clearEffects()` - 清除所有特效

**文件位置：** `node_modules/scratch-vm/src/sprites/rendered-target.js`

#### runtime (Runtime)
Scratch 运行时实例，管理所有目标、线程和扩展。

**常用方法：**
- `getTargetForStage()` - 获取舞台对象
- `startHats(requestedHat, optMatchFields)` - 启动 hat 积木
- `createClone(originalTarget)` - 创建克隆体
- `stopForTarget(target)` - 停止目标的所有脚本
- `getExtensionInstance(extensionId)` - 获取扩展实例

**文件位置：** `node_modules/scratch-vm/src/engine/runtime.js`

#### thread (Thread)
当前执行线程对象，控制脚本执行状态。

**常用属性：**
- `status` - 线程状态 (0: 运行中, 1: 等待 Promise, 2: 暂停, 3: 暂停一帧, 4: 完成)
- `target` - 所属目标
- `topBlock` - 顶层积木 ID

**文件位置：** `node_modules/scratch-vm/src/engine/thread.js`

### 扩展 API

#### 运动扩展 (scratch3_motion)
**文件位置：** `node_modules/scratch-vm/src/blocks/scratch3_motion.js`

**可调用方法：**
- `_moveSteps(steps, target)` - 移动步数
- `_ifOnEdgeBounce(target)` - 碰到边缘反弹
- `setRotationStyle(rotationStyle)` - 设置旋转样式

#### 外观扩展 (scratch3_looks)
**文件位置：** `node_modules/scratch-vm/src/blocks/scratch3_looks.js`

**可调用方法：**
- `_say(message, target)` - 说话
- `_setCostume(target, requestedCostume, optZeroIndex)` - 设置造型
- `_setBackdrop(stage, requestedBackdrop, optZeroIndex)` - 设置背景

#### 控制扩展 (scratch3_control)
**文件位置：** `node_modules/scratch-vm/src/blocks/scratch3_control.js`

**可调用方法：**
- `_createClone(cloneOption, target)` - 创建克隆体
- 使用 `_counter` 属性访问控制计数器

### 工具函数

#### Cast (类型转换)
**文件位置：** `node_modules/scratch-vm/src/util/cast.js`

**常用方法：**
- `toNumber(value)` - 转换为数字
- `toString(value)` - 转换为字符串
- `toBoolean(value)` - 转换为布尔值
- `toRgbColorList(color)` - 转换为 RGB 颜色列表

#### 日志系统
**文件位置：** `node_modules/scratch-vm/src/util/log.js`

**使用方法：**
```javascript
const log = require('../util/log');
log.info('信息');
log.warn('警告');
log.error('错误');
```

## 示例代码

### 基础示例

#### 示例 1：简单移动
```javascript
// 让精灵在舞台上弹跳
let x = 100;
let y = 100;
let dx = 5;
let dy = 3;

while (true) {
  x += dx;
  y += dy;
  
  if (x > 240 || x < -240) dx = -dx;
  if (y > 180 || y < -180) dy = -dy;
  
  target.setXY(x, y);
  yield; // 每帧更新
}
```

#### 示例 2：鼠标跟随
```javascript
// 跟随鼠标移动
while (true) {
  const mouse = runtime.ioDevices.mouse;
  const mouseX = mouse._clientX;
  const mouseY = mouse._clientY;
  
  // 转换坐标系：Scratch 坐标系原点在中心
  target.setXY(mouseX - 240, 180 - mouseY);
  yield;
}
```

#### 示例 3：粒子效果
```javascript
// 创建爆炸粒子效果
for (let i = 0; i < 30; i++) {
  const angle = Math.random() * 360;
  const speed = 5 + Math.random() * 10;
  const clone = runtime.createClone(target);
  const cloneTarget = clone.target;
  
  // 设置粒子初始状态
  cloneTarget.setXY(target.x, target.y);
  cloneTarget.setDirection(angle);
  cloneTarget._moveSteps(speed, cloneTarget);
  
  // 淡出效果
  (async function() {
    for (let j = 0; j < 20; j++) {
      cloneTarget.setEffect("ghost", j * 5);
      yield;
    }
    runtime.stopForTarget(cloneTarget);
  })();
}
yield;
```

### 高级示例

#### 示例 4：访问扩展
```javascript
// 访问音乐扩展播放声音
const musicExt = runtime.getExtensionInstance('music');
if (musicExt) {
  // 设置乐器并播放音符
  musicExt.setInstrument(1);
  musicExt.playNoteForBeats(60, 0.5); // 播放中央C，0.5拍
  
  // 等待播放完成
  for (let i = 0; i < 30; i++) {
    yield;
  }
}
```

#### 示例 5：自定义物理效果
```javascript
// 简单的重力模拟
let velocityY = 0;
const gravity = 0.5;
const groundY = -180;

while (true) {
  let [x, y] = [target.x, target.y];
  
  // 应用重力
  velocityY += gravity;
  y += velocityY;
  
  // 地面碰撞检测
  if (y <= groundY) {
    y = groundY;
    velocityY = -velocityY * 0.8; // 弹性系数
  }
  
  target.setXY(x, y);
  yield;
}
```

#### 示例 6：网络请求
```javascript
// 注意：需要确保安全设置允许网络请求
async function fetchData() {
  try {
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    target.say(`数据: ${JSON.stringify(data)}`);
  } catch (error) {
    target.say(`错误: ${error.message}`);
  }
}

// 启动异步函数
fetchData();
```

## 调试技巧

### 1. 控制台输出
```javascript
// 在浏览器控制台输出信息
console.log('当前位置:', target.x, target.y);
console.log('运行时状态:', runtime);
```

### 2. 错误处理
```javascript
try {
  // 可能出错的代码
  target.someUndefinedMethod();
} catch (error) {
  console.error('执行错误:', error);
  target.say(`错误: ${error.message}`);
}
```

### 3. 性能监控
```javascript
// 简单的帧率监控
let frameCount = 0;
let lastTime = Date.now();

while (true) {
  frameCount++;
  const currentTime = Date.now();
  if (currentTime - lastTime >= 1000) {
    console.log(`FPS: ${frameCount}`);
    frameCount = 0;
    lastTime = currentTime;
  }
  yield;
}
```

## 注意事项

### 1. 安全性
- JavaScript 代码直接执行，请确保代码来源可信
- 避免执行未经验证的用户代码
- 注意 XSS 和代码注入风险

### 2. 性能优化
- 复杂的循环应包含 `yield` 以避免阻塞
- 避免在每帧中创建大量对象
- 使用局部变量缓存频繁访问的属性

### 3. 兼容性
- API 基于 Scratch VM 内部结构，不同版本可能有所变化
- 自定义代码可能在不同浏览器中表现不同
- 建议进行充分的兼容性测试

### 4. 调试支持
- 使用浏览器开发者工具进行调试
- 可以设置断点和查看调用堆栈
- 错误信息会显示在 Scratch 的编译错误面板中

## 常见问题

### Q1: 代码不执行怎么办？
- 检查注释格式是否正确（`#code` 必须在开头）
- 确保编译器已启用（TurboWarp 编译器选项）
- 查看浏览器控制台是否有错误信息

### Q2: 如何访问精灵的变量？
```javascript
// 获取变量
const myVar = runtime.getVariable(target.id, "变量名");
if (myVar) {
  console.log('变量值:', myVar.value);
  myVar.value = 100; // 修改变量值
}
```

### Q3: 如何创建新的积木？
自定义积木需要通过 Scratch 扩展系统创建，不能直接在 JavaScript 代码中创建。

### Q4: 可以修改积木的外观吗？
不能直接修改，积木外观由 scratch-blocks 控制，需要修改相应的 Blockly 配置。

## 开发建议

### 1. 模块化代码
```javascript
// 将常用功能封装为函数
function moveTo(x, y, duration = 30) {
  const startX = target.x;
  const startY = target.y;
  
  for (let i = 0; i <= duration; i++) {
    const progress = i / duration;
    const currentX = startX + (x - startX) * progress;
    const currentY = startY + (y - startY) * progress;
    
    target.setXY(currentX, currentY);
    yield;
  }
}

// 使用函数
yield* moveTo(100, 50, 60);
```

### 2. 代码复用
可以将常用代码片段保存为文本模板，或创建代码库供多个项目使用。

### 3. 版本控制
由于直接修改 VM 代码，建议：
- 保持对修改的详细记录
- 创建补丁文件便于更新
- 定期同步上游版本

## 文件结构参考

```
scratch-vm/
├── src/
│   ├── blocks/                    # 积木实现
│   │   ├── scratch3_motion.js     # 运动积木
│   │   ├── scratch3_looks.js      # 外观积木
│   │   └── ...
│   ├── engine/                    # 引擎核心
│   │   ├── runtime.js            # 运行时
│   │   ├── thread.js             # 线程管理
│   │   └── ...
│   ├── sprites/                   # 精灵相关
│   │   └── rendered-target.js    # 渲染目标
│   ├── compiler/                  # 编译器
│   │   ├── intermediate.js       # 中间表示（已修改）
│   │   ├── irgen.js              # IR生成器（已修改）
│   │   ├── jsgen.js              # JS生成器（已修改）
│   │   └── ...
│   └── util/                      # 工具函数
│       ├── cast.js               # 类型转换
│       └── log.js                # 日志系统
```

## 更新日志

### v1.0.0 (初始实现)
- 添加 `#code` 注释支持
- 修改编译器支持自定义 JavaScript 代码
- 添加完整的 API 访问能力
- 支持生成器函数和 `yield` 关键字

## 贡献指南

如果您发现任何问题或有改进建议，请：
1. 在项目中创建 Issue
2. 描述具体问题和重现步骤
3. 如果可能，提供修复方案

## 许可证

本功能基于 Scratch 开源项目开发，遵循相应的开源许可证。请确保遵守 Scratch 项目的使用条款。

---

*本文档最后更新：2025年12月26日*