(window["webpackJsonpGUI"] = window["webpackJsonpGUI"] || []).push([["addon-comment-vscode-sync"],{

/***/ "./node_modules/css-loader/index.js!./src/addons/addons/comment-vscode-sync/userstyle.css":
/*!***************************************************************************************!*\
  !*** ./node_modules/css-loader!./src/addons/addons/comment-vscode-sync/userstyle.css ***!
  \***************************************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

exports = module.exports = __webpack_require__(/*! ../../../../node_modules/css-loader/lib/css-base.js */ "./node_modules/css-loader/lib/css-base.js")(false);
// imports


// module
exports.push([module.i, "/* Comment VSCode Sync Button Styles */\n\n.sa-comment-vscode-btn {\n  position: absolute;\n  right: 2px;\n  top: 2px;\n  width: 16px;\n  height: 16px;\n  padding: 0;\n  margin: 0;\n  border: none;\n  background: transparent;\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  opacity: 0.7;\n  transition: opacity 0.2s, filter 0.2s;\n  z-index: 100;\n}\n\n.sa-comment-vscode-btn:hover {\n  opacity: 1;\n  filter: brightness(1.2);\n}\n\n.sa-comment-vscode-btn.sa-comment-vscode-disabled {\n  opacity: 0.3;\n  cursor: not-allowed;\n  filter: grayscale(100%);\n}\n\n.sa-comment-vscode-btn.sa-comment-vscode-synced {\n  opacity: 1;\n}\n\n.sa-comment-vscode-btn.sa-comment-vscode-synced::after {\n  content: '';\n  position: absolute;\n  bottom: -2px;\n  right: -2px;\n  width: 6px;\n  height: 6px;\n  background-color: #4caf50;\n  border-radius: 50%;\n  border: 1px solid var(--ui-modal-background, #fff);\n}\n\n.sa-comment-vscode-icon {\n  width: 14px;\n  height: 14px;\n  pointer-events: none;\n}\n\n/* 确保按钮在注释顶部栏正确显示 */\n.scratchCommentBody,\n[class*=\"scratchCommentBody\"],\n[class*=\"TopBar\"] {\n  position: relative;\n}\n\n/* 暗色模式适配 */\n[data-theme=\"dark\"] .sa-comment-vscode-btn,\n.dark .sa-comment-vscode-btn {\n  opacity: 0.8;\n}\n\n[data-theme=\"dark\"] .sa-comment-vscode-btn:hover,\n.dark .sa-comment-vscode-btn:hover {\n  opacity: 1;\n}\n\n[data-theme=\"dark\"] .sa-comment-vscode-btn.sa-comment-vscode-disabled,\n.dark .sa-comment-vscode-btn.sa-comment-vscode-disabled {\n  opacity: 0.2;\n}\n", ""]);

// exports


/***/ }),

/***/ "./node_modules/url-loader/dist/cjs.js!./src/addons/addons/comment-vscode-sync/icons/vscode.svg":
/*!******************************************************************************************************!*\
  !*** ./node_modules/url-loader/dist/cjs.js!./src/addons/addons/comment-vscode-sync/icons/vscode.svg ***!
  \******************************************************************************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony default export */ __webpack_exports__["default"] = ("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj4KICA8cG9seWxpbmUgcG9pbnRzPSIxNiAxOCAyMiAxMiAxNiA2Ij48L3BvbHlsaW5lPgogIDxwb2x5bGluZSBwb2ludHM9IjggNiAyIDEyIDggMTgiPjwvcG9seWxpbmU+Cjwvc3ZnPg==");

/***/ }),

/***/ "./src/addons/addons/comment-vscode-sync/_runtime_entry.js":
/*!*****************************************************************!*\
  !*** ./src/addons/addons/comment-vscode-sync/_runtime_entry.js ***!
  \*****************************************************************/
/*! exports provided: resources */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "resources", function() { return resources; });
/* harmony import */ var _userscript_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./userscript.js */ "./src/addons/addons/comment-vscode-sync/userscript.js");
/* harmony import */ var _css_loader_userstyle_css__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! css-loader!./userstyle.css */ "./node_modules/css-loader/index.js!./src/addons/addons/comment-vscode-sync/userstyle.css");
/* harmony import */ var _css_loader_userstyle_css__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_css_loader_userstyle_css__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _url_loader_icons_vscode_svg__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! url-loader!./icons/vscode.svg */ "./node_modules/url-loader/dist/cjs.js!./src/addons/addons/comment-vscode-sync/icons/vscode.svg");



const resources = {
  "userscript.js": _userscript_js__WEBPACK_IMPORTED_MODULE_0__["default"],
  "userstyle.css": _css_loader_userstyle_css__WEBPACK_IMPORTED_MODULE_1___default.a,
  "icons/vscode.svg": _url_loader_icons_vscode_svg__WEBPACK_IMPORTED_MODULE_2__["default"]
};

/***/ }),

/***/ "./src/addons/addons/comment-vscode-sync/userscript.js":
/*!*************************************************************!*\
  !*** ./src/addons/addons/comment-vscode-sync/userscript.js ***!
  \*************************************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony default export */ __webpack_exports__["default"] = (async function (_ref) {
  let {
    addon,
    console,
    msg
  } = _ref;
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
   * 从 DOM 或 Blockly 对象中提取唯一标识
   */
  function getCommentId(commentEl) {
    // 尝试从 data 属性获取
    if (commentEl.dataset.commentId) {
      return commentEl.dataset.commentId;
    }

    // 尝试从 Blockly 工作区获取
    const workspace = Blockly.getMainWorkspace();
    if (workspace) {
      const topComments = workspace.getTopComments();
      for (const comment of topComments) {
        // 通过位置匹配查找注释
        const commentSvg = comment.getSvgRoot();
        if (commentSvg === commentEl || commentSvg.contains(commentEl)) {
          return comment.id;
        }
      }
    }

    // 生成临时 ID
    return 'comment_' + Math.random().toString(36).substr(2, 9);
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
   */
  function setCommentContent(commentEl, content) {
    const textarea = commentEl.querySelector('textarea');
    if (textarea) {
      // 保存焦点状态
      const wasFocused = document.activeElement === textarea;
      textarea.value = content;

      // 触发 input 事件以更新其他监听器
      const inputEvent = new Event('input', {
        bubbles: true
      });
      textarea.dispatchEvent(inputEvent);

      // 如果之前有焦点，恢复焦点
      if (wasFocused) {
        textarea.focus();
      }
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
    const commentId = getCommentId(commentEl);
    const content = getCommentContent(commentEl);
    const target = getCurrentTarget();

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
    const topBar = commentEl.querySelector('.scratchCommentBody') || commentEl.querySelector('[class*="TopBar"]') || commentEl.firstElementChild;
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
    button.addEventListener('click', e => {
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
    const {
      commentId,
      content
    } = detail;

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
  window.addEventListener('extensionDebugStatus', e => {
    if (e.detail) {
      isConnected = e.detail.connected;
      updateButtonStates();
    }
  });

  // 监听 DOM 变化
  const observer = new MutationObserver(mutations => {
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
});

/***/ })

}]);
//# sourceMappingURL=addon-comment-vscode-sync.js.map