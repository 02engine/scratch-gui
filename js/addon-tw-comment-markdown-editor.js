(window["webpackJsonpGUI"] = window["webpackJsonpGUI"] || []).push([["addon-tw-comment-markdown-editor"],{

/***/ "./node_modules/css-loader/index.js!./src/addons/addons/tw-comment-markdown-editor/userstyle.css":
/*!**********************************************************************************************!*\
  !*** ./node_modules/css-loader!./src/addons/addons/tw-comment-markdown-editor/userstyle.css ***!
  \**********************************************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

exports = module.exports = __webpack_require__(/*! ../../../../node_modules/css-loader/lib/css-base.js */ "./node_modules/css-loader/lib/css-base.js")(false);
// imports


// module
exports.push([module.i, "/* 切换开关容器 - 集成到拖动栏 */\n.tw-md-toggle-container {\n  display: flex;\n  justify-content: flex-end;\n  align-items: center;\n  padding: 2px 6px;\n  background: transparent;\n  gap: 6px;\n  position: absolute;\n  top: 2px;\n  right: 2px;\n  z-index: 10;\n}\n\n/* 模式指示器 - 集成到拖动栏 */\n.tw-md-mode-indicator {\n  font-size: 14px;\n  color: var(--editorTheme3-commentText, #888);\n  margin-right: 8px;\n  font-weight: 600;\n  text-transform: uppercase;\n  letter-spacing: 0.8px;\n  opacity: 0.8;\n  transition: all 0.2s ease;\n  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);\n}\n\n.tw-md-mode-indicator.preview-mode {\n  color: #4CAF50;\n  opacity: 1;\n  font-weight: 600;\n}\n\n/* 切换按钮 - 集成到拖动栏 */\n.tw-md-toggle-button {\n  background: rgba(var(--editorTheme3-commentBorder-rgb, 200, 200, 200), 0.3);\n  color: var(--editorTheme3-commentText, #555);\n  border: 1px solid rgba(0, 0, 0, 0.1);\n  border-radius: 6px;\n  padding: 6px 12px;\n  font-size: 14px;\n  font-weight: 600;\n  cursor: pointer;\n  opacity: 0.8;\n  transition: all 0.2s ease;\n  user-select: none;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  backdrop-filter: blur(2px);\n}\n\n.tw-md-toggle-button:hover {\n  opacity: 1;\n  background: rgba(var(--editorTheme3-commentBorder-rgb, 200, 200, 200), 0.5);\n}\n\n.tw-md-toggle-button:active {\n  transform: scale(0.95);\n}\n\n.tw-md-toggle-button[data-mode=\"preview\"] {\n  background: rgba(76, 175, 80, 0.3);\n  color: #2E7D32;\n  border-color: rgba(76, 175, 80, 0.3);\n}\n\n/* 预览容器 - 无背景框 */\n.tw-md-preview-container {\n  width: 100%;\n  height: 100%;\n  padding: 12px;\n  background: transparent;\n  color: var(--editorTheme3-commentText, #333);\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n  font-size: 16px;\n  line-height: 1.7;\n  white-space: pre-wrap;\n  overflow-y: auto;\n  overflow-x: hidden;\n  box-sizing: border-box;\n  max-height: 100%;\n}\n\n/* 预览内容样式 */\n.tw-md-preview-container h1,\n.tw-md-preview-container h2,\n.tw-md-preview-container h3 {\n  margin-top: 8px;\n  margin-bottom: 6px;\n  font-weight: 600;\n  line-height: 1.3;\n}\n\n.tw-md-preview-container h1 {\n  font-size: 22px;\n  color: var(--editorTheme3-commentText, #333);\n  border-bottom: 2px solid var(--editorTheme3-commentBorder, #ddd);\n  padding-bottom: 6px;\n}\n\n.tw-md-preview-container h2 {\n  font-size: 20px;\n  color: var(--editorTheme3-commentText, #444);\n}\n\n.tw-md-preview-container h3 {\n  font-size: 18px;\n  color: var(--editorTheme3-commentText, #555);\n}\n\n\n.tw-md-preview-container strong {\n  font-weight: 600;\n  color: var(--editorTheme3-commentText, #333);\n}\n\n.tw-md-preview-container em {\n  font-style: italic;\n  color: var(--editorTheme3-commentText, #444);\n}\n\n.tw-md-preview-container code {\n  background-color: rgba(0, 0, 0, 0.08);\n  color: #d73a49;\n  padding: 3px 8px;\n  border-radius: 4px;\n  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;\n  font-size: 15px;\n  border: 1px solid rgba(0, 0, 0, 0.1);\n}\n\n/* 引用块样式 */\n.tw-md-preview-container blockquote {\n  border-left: 4px solid #dfe2e5;\n  padding: 0 16px;\n  margin: 8px 0;\n  color: #6a737d;\n  background-color: #f8f9fa;\n  border-radius: 0 4px 4px 0;\n  font-size: 14px;\n  line-height: 1.6;\n}\n\n.tw-md-preview-container pre code {\n  display: block;\n  padding: 12px 16px;\n  margin: 8px 0;\n  overflow-x: auto;\n  background-color: #f6f8fa;\n  border-radius: 4px;\n  font-size: 14px;\n  line-height: 1.6;\n}\n\n.tw-md-preview-container a {\n  color: #0366d6;\n  text-decoration: none;\n  font-weight: 500;\n  border-bottom: 1px solid transparent;\n  transition: border-color 0.2s ease;\n}\n\n.tw-md-preview-container a:hover {\n  text-decoration: underline;\n  border-bottom-color: #0366d6;\n}\n\n.tw-md-preview-container ul {\n  margin: 8px 0;\n  padding-left: 20px;\n}\n\n.tw-md-preview-container li {\n  margin: 2px 0;\n  padding-left: 4px;\n}\n\n.tw-md-preview-container li::marker {\n  color: var(--editorTheme3-commentText, #666);\n}\n\n/* 确保注释框内的滚动条正常显示 */\n.tw-md-preview-container::-webkit-scrollbar {\n  width: 10px;\n  height: 10px;\n}\n\n.tw-md-preview-container::-webkit-scrollbar-track {\n  background: rgba(0, 0, 0, 0.05);\n  border-radius: 5px;\n}\n\n.tw-md-preview-container::-webkit-scrollbar-thumb {\n  background: rgba(0, 0, 0, 0.3);\n  border-radius: 5px;\n  border: 2px solid transparent;\n  background-clip: content-box;\n}\n\n.tw-md-preview-container::-webkit-scrollbar-thumb:hover {\n  background: rgba(0, 0, 0, 0.4);\n  border: 2px solid transparent;\n  background-clip: content-box;\n}\n\n/* 确保注释框本身支持滚动 */\n.tw-md-preview-container {\n  scrollbar-width: thin;\n  scrollbar-color: rgba(0, 0, 0, 0.3) rgba(0, 0, 0, 0.05);\n}\n", ""]);

// exports


/***/ }),

/***/ "./src/addons/addons/tw-comment-markdown-editor/_runtime_entry.js":
/*!************************************************************************!*\
  !*** ./src/addons/addons/tw-comment-markdown-editor/_runtime_entry.js ***!
  \************************************************************************/
/*! exports provided: resources */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "resources", function() { return resources; });
/* harmony import */ var _userscript_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./userscript.js */ "./src/addons/addons/tw-comment-markdown-editor/userscript.js");
/* harmony import */ var _css_loader_userstyle_css__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! css-loader!./userstyle.css */ "./node_modules/css-loader/index.js!./src/addons/addons/tw-comment-markdown-editor/userstyle.css");
/* harmony import */ var _css_loader_userstyle_css__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_css_loader_userstyle_css__WEBPACK_IMPORTED_MODULE_1__);
/* generated by pull.js */


const resources = {
  "userscript.js": _userscript_js__WEBPACK_IMPORTED_MODULE_0__["default"],
  "userstyle.css": _css_loader_userstyle_css__WEBPACK_IMPORTED_MODULE_1___default.a
};

/***/ }),

/***/ "./src/addons/addons/tw-comment-markdown-editor/userscript.js":
/*!********************************************************************!*\
  !*** ./src/addons/addons/tw-comment-markdown-editor/userscript.js ***!
  \********************************************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony default export */ __webpack_exports__["default"] = (async function (_ref) {
  let addon = _ref.addon,
    console = _ref.console;
  const vm = addon.tab.traps.vm;

  // 等待Blockly加载
  const Blockly = await addon.tab.traps.getBlockly();

  // 处理注释元素的函数
  const processCommentElements = () => {
    // 如果插件被禁用，不处理任何元素
    if (addon.self.disabled) return;

    // 查找所有注释元素
    const commentElements = document.querySelectorAll('.blocklyBubbleCanvas > g');
    commentElements.forEach(commentEl => {
      var _commentEl$querySelec;
      // 检查是否已经处理过
      if (commentEl.dataset.markdownProcessed) return;

      // 查找textarea
      const textarea = commentEl.querySelector('textarea');
      if (!textarea) return;

      // 查找顶部栏（拖动栏）
      const topBar = commentEl.querySelector('.scratchCommentBody') || commentEl.querySelector('[class*="TopBar"]') || commentEl.firstElementChild;
      if (!topBar) return;

      // 标记为已处理
      commentEl.dataset.markdownProcessed = 'true';

      // 创建切换开关容器
      const toggleContainer = document.createElement('div');
      toggleContainer.className = 'tw-md-toggle-container';

      // 创建模式指示器
      const modeIndicator = document.createElement('span');
      modeIndicator.className = 'tw-md-mode-indicator';
      modeIndicator.textContent = '编辑模式';

      // 创建切换按钮
      const toggleButton = document.createElement('button');
      toggleButton.className = 'tw-md-toggle-button';
      toggleButton.innerHTML = '📝 编辑';
      toggleButton.dataset.mode = 'edit';
      toggleButton.title = '切换到预览模式 (Ctrl+M)';

      // 将元素添加到容器
      toggleContainer.appendChild(modeIndicator);
      toggleContainer.appendChild(toggleButton);

      // 创建预览容器
      const previewContainer = document.createElement('div');
      previewContainer.className = 'tw-md-preview-container';
      previewContainer.style.display = 'none';

      // 将元素添加到DOM
      toggleContainer.appendChild(toggleButton);
      topBar.appendChild(toggleContainer);

      // 找到注释内容区域并添加预览容器
      const contentArea = ((_commentEl$querySelec = commentEl.querySelector('.scratchCommentTextarea')) === null || _commentEl$querySelec === void 0 ? void 0 : _commentEl$querySelec.parentElement) || textarea.parentElement;
      if (contentArea) {
        contentArea.appendChild(previewContainer);
      }

      // 切换模式的事件处理
      toggleButton.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        toggleMode();
      });

      // 键盘快捷键支持 (Ctrl/Cmd + M) - 全局监听
      document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
          // 检查是否有活动的注释编辑 - 通过焦点元素或当前模式
          const activeElement = document.activeElement;
          const isEditingComment = activeElement && (activeElement === textarea || activeElement.closest('[data-markdown-processed]') === commentEl);

          // 如果在编辑此注释，或者当前处于预览模式，都允许切换
          const isInPreviewMode = toggleButton.dataset.mode === 'preview';
          if ((isEditingComment || isInPreviewMode) && commentEl.dataset.markdownProcessed === 'true') {
            e.preventDefault();
            toggleMode();
          }
        }
      });

      // 切换模式的函数
      function toggleMode() {
        const mode = toggleButton.dataset.mode;
        if (mode === 'edit') {
          // 切换到预览模式
          toggleButton.dataset.mode = 'preview';
          toggleButton.innerHTML = '🐟 预览';
          toggleButton.title = '切换到编辑模式 (Ctrl+M)';
          modeIndicator.textContent = '预览模式';
          modeIndicator.classList.add('preview-mode');
          textarea.style.display = 'none';
          previewContainer.style.display = 'block';

          // 渲染Markdown
          renderMarkdown(textarea.value, previewContainer);
        } else {
          // 切换到编辑模式
          toggleButton.dataset.mode = 'edit';
          toggleButton.innerHTML = '📝 编辑';
          toggleButton.title = '切换到预览模式 (Ctrl+M)';
          modeIndicator.textContent = '编辑模式';
          modeIndicator.classList.remove('preview-mode');
          textarea.style.display = 'block';
          previewContainer.style.display = 'none';

          // 重新聚焦到textarea
          textarea.focus();
        }
      }

      // 当textarea内容改变时，更新预览
      textarea.addEventListener('input', () => {
        if (toggleButton.dataset.mode === 'preview') {
          renderMarkdown(textarea.value, previewContainer);
        }
      });
      console.log('Processed comment element:', commentEl);
    });
  };

  // 增强的Markdown渲染函数
  function renderMarkdown(text, container) {
    // 清空容器
    container.innerHTML = '';

    // 增强的Markdown渲染实现
    let html = text
    // 引用 - 必须在其他处理之前
    .replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>')
    // 标题
    .replace(/^### (.*$)/gm, '<h3>$1</h3>').replace(/^## (.*$)/gm, '<h2>$1</h2>').replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // 粗体和斜体
    .replace(/\*\*(.*?)\*\*/gm, '<strong>$1</strong>').replace(/\*(.*?)\*/gm, '<em>$1</em>')
    // 代码块
    .replace(/```([\s\S]*?)```/gm, '<pre><code>$1</code></pre>')
    // 行内代码
    .replace(/`(.*?)`/gm, '<code>$1</code>')
    // 图片
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/gm, '<img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0;">')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gm, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // 列表项
    .replace(/^\* (.*$)/gm, '<li>$1</li>').replace(/^- (.*$)/gm, '<li>$1</li>')
    // 换行
    .replace(/\n/g, '<br>');

    // 处理列表
    html = html.replace(/(<li>[^]*<\/li>)/, '<ul>$1</ul>');
    container.innerHTML = html;
  }

  // 监听DOM变化，处理新添加的注释
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
  });

  // 开始监听
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 初始处理
  setTimeout(processCommentElements, 1000);

  // 定期处理新元素
  setInterval(processCommentElements, 2000);

  // 插件禁用时清理功能
  addon.self.addEventListener('disabled', () => {
    // 移除所有添加的切换元素
    const toggleContainers = document.querySelectorAll('.tw-md-toggle-container');
    const previewContainers = document.querySelectorAll('.tw-md-preview-container');
    toggleContainers.forEach(container => container.remove());
    previewContainers.forEach(container => container.remove());

    // 重置所有注释元素的处理状态
    const processedElements = document.querySelectorAll('[data-markdown-processed]');
    processedElements.forEach(el => {
      delete el.dataset.markdownProcessed;
      // 显示所有textarea
      const textarea = el.querySelector('textarea');
      if (textarea) {
        textarea.style.display = 'block';
      }
    });
    console.log('Markdown comment editor addon disabled');
  });

  // 插件启用时重新处理
  addon.self.addEventListener('enabled', () => {
    setTimeout(processCommentElements, 500);
    console.log('Markdown comment editor addon enabled');
  });
  console.log('Markdown comment editor addon loaded');
});

/***/ })

}]);
//# sourceMappingURL=addon-tw-comment-markdown-editor.js.map