export default async function ({ addon, console, msg }) {
  const vm = addon.tab.traps.vm;
  
  // 等待 Blockly 加载
  const Blockly = await addon.tab.traps.getBlockly();
  
  // WebSocket 连接状态
  let isConnected = false;
  
  // 跟踪已处理的注释
  const processedComments = new Map();
  
  // 获取 VSCode 图标 URL
  const vscodeIconUrl = addon.self.getResource('/icons/vscode.svg');
  
  /**
   * 检查 WebSocket 连接状态
   */
  function checkConnection() {
    if (typeof window !== 'undefined' && window.ScratchExtensionDebug) {
      isConnected = window.ScratchExtensionDebug.isConnected();
    }
    return isConnected;
  }
  
  /**
   * 发送消息到 WebSocket 服务器
   */
  function sendMessage(message) {
    if (typeof window !== 'undefined' && window.ScratchExtensionDebug) {
      // 使用全局的 sendMessage 函数
      const ws = window.ScratchExtensionDebug.ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        return true;
      }
    }
    return false;
  }
  
  /**
   * 获取注释 ID
   * 使用 data 属性缓存 ID，确保同一注释始终使用相同 ID
   */
  function getCommentId(commentEl) {
    // 如果已经有缓存的 ID，直接返回
    if (commentEl.dataset.commentId) {
      return commentEl.dataset.commentId;
    }
    
    // 直接生成临时 ID 并缓存到 DOM 元素
    // 注意：WorkspaceComment 没有 getSvgRoot() 方法，不使用 Blockly 匹配
    const tempId = 'comment_' + Math.random().toString(36).substr(2, 9);
    commentEl.dataset.commentId = tempId;
    return tempId;
  }
  
  /**
   * 通过内容匹配获取 VM 中的真实注释 ID
   * 适用于工作区注释和积木关联注释
   */
  function findVMCommentId(commentEl) {
    const target = vm.editingTarget;
    if (!target || !target.comments) return null;
    
    // 获取当前注释内容
    const content = getCommentContent(commentEl);
    
    // 遍历 VM 中的所有注释，通过内容匹配
    for (const [id, comment] of Object.entries(target.comments)) {
      if (comment.text === content) {
        return id;
      }
    }
    
    return null;
  }
  
  /**
   * 获取注释内容
   */
  function getCommentContent(commentEl) {
    const textarea = commentEl.querySelector('textarea');
    return textarea ? textarea.value : '';
  }
  
  /**
   * 设置注释内容
   * 同时更新 VM 数据和 DOM，并标记项目已更改
   */
  function setCommentContent(commentEl, content) {
    const textarea = commentEl.querySelector('textarea');
    if (!textarea) return;
    
    // 保存焦点状态
    const wasFocused = document.activeElement === textarea;
    
    // 1. 更新 DOM
    textarea.value = content;
    
    // 2. 触发 input 事件以更新其他监听器
    const inputEvent = new Event('input', { bubbles: true });
    textarea.dispatchEvent(inputEvent);
    
    // 3. 使用缓存的 VM 真实 ID 更新注释数据（关键！）
    const vmCommentId = commentEl.dataset.vmCommentId;
    if (vmCommentId) {
      const target = vm.editingTarget;
      if (target && target.comments && target.comments[vmCommentId]) {
        target.comments[vmCommentId].text = content;
        
        // 4. 标记项目已更改（关键！）
        if (vm.runtime && vm.runtime.emitProjectChanged) {
          vm.runtime.emitProjectChanged();
        }
        
        console.log('[CommentVSCodeSync] Updated VM comment:', vmCommentId);
      } else {
        console.warn('[CommentVSCodeSync] VM comment not found:', vmCommentId);
      }
    } else {
      console.warn('[CommentVSCodeSync] No VM comment ID cached');
    }
    
    // 5. 如果之前有焦点，恢复焦点
    if (wasFocused) {
      textarea.focus();
    }
  }
  
  /**
   * 获取当前编辑目标（角色）信息
   */
  function getCurrentTarget() {
    const editingTarget = vm.editingTarget;
    return {
      id: editingTarget ? editingTarget.id : null,
      name: editingTarget ? editingTarget.getName() : 'unknown'
    };
  }
  
  /**
   * 处理 VSCode 按钮点击
   */
  function handleVSCodeButtonClick(commentEl, buttonEl) {
    if (!checkConnection()) {
      console.warn('[CommentVSCodeSync] Not connected to server');
      alert(msg('not-connected'));
      return;
    }
    
    // 获取 VSCode 通信用 ID（临时 ID）
    const commentId = getCommentId(commentEl);
    const content = getCommentContent(commentEl);
    const target = getCurrentTarget();
    
    // 获取 VM 中的真实注释 ID（关键！）
    const vmCommentId = findVMCommentId(commentEl);
    if (vmCommentId) {
      // 缓存 VM 真实 ID 到 DOM 元素
      commentEl.dataset.vmCommentId = vmCommentId;
      console.log('[CommentVSCodeSync] Found VM comment ID:', vmCommentId);
    } else {
      console.warn('[CommentVSCodeSync] Could not find VM comment ID');
    }
    
    // 发送打开注释消息
    const message = {
      type: 'comment',
      action: 'open',
      commentId: commentId,
      content: content,
      targetId: target.id,
      targetName: target.name,
      timestamp: Date.now()
    };
    
    if (sendMessage(message)) {
      // 标记为已同步
      commentEl.dataset.vscodeSynced = 'true';
      buttonEl.classList.add('sa-comment-vscode-synced');
      buttonEl.title = msg('synced-tooltip');
      console.log('[CommentVSCodeSync] Sent open message for comment:', commentId);
    } else {
      console.error('[CommentVSCodeSync] Failed to send message');
      alert(msg('send-failed'));
    }
  }
  
  /**
   * 创建 VSCode 同步按钮
   */
  function createVSCodeButton(commentEl) {
    // 检查是否已存在
    if (commentEl.querySelector('.sa-comment-vscode-btn')) {
      return null;
    }
    
    // 查找顶部栏
    const topBar = commentEl.querySelector('.scratchCommentBody') || 
                   commentEl.querySelector('[class*="TopBar"]') ||
                   commentEl.firstElementChild;
    
    if (!topBar) {
      return null;
    }
    
    // 创建按钮
    const button = document.createElement('button');
    button.className = 'sa-comment-vscode-btn';
    button.title = msg('sync-tooltip');
    button.type = 'button';
    
    // 创建图标
    const icon = document.createElement('img');
    icon.src = vscodeIconUrl;
    icon.alt = 'VSCode';
    icon.className = 'sa-comment-vscode-icon';
    button.appendChild(icon);
    
    // 添加点击事件
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      handleVSCodeButtonClick(commentEl, button);
    });
    
    // 找到关闭按钮并插入到其前面
    const closeButton = topBar.querySelector('[class*="close"], [class*="delete"]');
    if (closeButton) {
      topBar.insertBefore(button, closeButton);
    } else {
      topBar.appendChild(button);
    }
    
    // 检查连接状态并更新按钮
    checkConnection();
    if (!isConnected) {
      button.classList.add('sa-comment-vscode-disabled');
      button.title = msg('not-connected');
    }
    
    return button;
  }
  
  /**
   * 处理所有注释元素
   */
  function processCommentElements() {
    if (addon.self.disabled) return;
    
    const commentElements = document.querySelectorAll('.blocklyBubbleCanvas > g');
    
    commentElements.forEach(commentEl => {
      // 检查是否已经处理过
      if (processedComments.has(commentEl)) {
        return;
      }
      
      // 检查是否是注释（有 textarea）
      const textarea = commentEl.querySelector('textarea');
      if (!textarea) {
        return;
      }
      
      // 创建按钮
      const button = createVSCodeButton(commentEl);
      if (button) {
        processedComments.set(commentEl, {
          button: button,
          commentId: getCommentId(commentEl)
        });
      }
    });
  }
  
  /**
   * 处理从 VSCode 返回的更新消息
   */
  function handleCommentUpdate(event) {
    const detail = event.detail;
    if (!detail || detail.type !== 'comment' || detail.action !== 'update') {
      return;
    }
    
    const { commentId, content } = detail;
    
    // 查找对应的注释元素
    for (const [commentEl, data] of processedComments.entries()) {
      if (data.commentId === commentId) {
        // 更新注释内容
        setCommentContent(commentEl, content);
        console.log('[CommentVSCodeSync] Updated comment content from VSCode:', commentId);
        break;
      }
    }
  }
  
  /**
   * 清理已移除的注释
   */
  function cleanupRemovedComments() {
    const commentElements = document.querySelectorAll('.blocklyBubbleCanvas > g');
    const currentElements = new Set(commentElements);
    
    for (const [commentEl] of processedComments) {
      if (!currentElements.has(commentEl) || !document.contains(commentEl)) {
        processedComments.delete(commentEl);
      }
    }
  }
  
  /**
   * 更新所有按钮的连接状态
   */
  function updateButtonStates() {
    checkConnection();
    
    for (const [commentEl, data] of processedComments) {
      const button = data.button;
      if (!button) continue;
      
      if (isConnected) {
        button.classList.remove('sa-comment-vscode-disabled');
        button.title = commentEl.dataset.vscodeSynced ? msg('synced-tooltip') : msg('sync-tooltip');
      } else {
        button.classList.add('sa-comment-vscode-disabled');
        button.title = msg('not-connected');
      }
    }
  }
  
  // 监听来自 extension-debug.js 的自定义事件
  window.addEventListener('commentSyncUpdate', handleCommentUpdate);
  
  // 监听连接状态变化
  window.addEventListener('extensionDebugStatus', (e) => {
    if (e.detail) {
      isConnected = e.detail.connected;
      updateButtonStates();
    }
  });
  
  // 监听 DOM 变化
  const observer = new MutationObserver((mutations) => {
    let shouldProcess = false;
    
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches && node.matches('.blocklyBubbleCanvas > g')) {
            shouldProcess = true;
          } else if (node.querySelector && node.querySelector('.blocklyBubbleCanvas > g')) {
            shouldProcess = true;
          }
        }
      });
    });
    
    if (shouldProcess) {
      setTimeout(processCommentElements, 100);
    }
    
    // 定期清理
    cleanupRemovedComments();
  });
  
  // 开始监听
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // 初始处理
  setTimeout(processCommentElements, 1000);
  
  // 定期处理新元素和更新状态
  setInterval(() => {
    processCommentElements();
    updateButtonStates();
  }, 2000);
  
  // 插件禁用时清理
  addon.self.addEventListener('disabled', () => {
    observer.disconnect();
    for (const [commentEl, data] of processedComments) {
      if (data.button) {
        data.button.remove();
      }
    }
    processedComments.clear();
    window.removeEventListener('commentSyncUpdate', handleCommentUpdate);
    console.log('[CommentVSCodeSync] Addon disabled');
  });
  
  // 插件启用时重新处理
  addon.self.addEventListener('enabled', () => {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    setTimeout(processCommentElements, 500);
    console.log('[CommentVSCodeSync] Addon enabled');
  });
  
  console.log('[CommentVSCodeSync] Addon loaded');
}
