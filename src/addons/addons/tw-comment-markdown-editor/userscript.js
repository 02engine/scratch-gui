export default async function ({ addon, console }) {
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
      const contentArea = commentEl.querySelector('.scratchCommentTextarea')?.parentElement || textarea.parentElement;
      if (contentArea) {
        contentArea.appendChild(previewContainer);
      }

      // 切换模式的事件处理
      toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

        toggleMode();
      });

      // 键盘快捷键支持 (Ctrl/Cmd + M) - 全局监听
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
          // 检查是否有活动的注释编辑 - 通过焦点元素或当前模式
          const activeElement = document.activeElement;
          const isEditingComment = activeElement && (
            activeElement === textarea ||
            activeElement.closest('[data-markdown-processed]') === commentEl
          );

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
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      // 粗体和斜体
      .replace(/\*\*(.*?)\*\*/gm, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gm, '<em>$1</em>')
      // 代码块
      .replace(/```([\s\S]*?)```/gm, '<pre><code>$1</code></pre>')
      // 行内代码
      .replace(/`(.*?)`/gm, '<code>$1</code>')
      // 图片
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/gm, '<img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0;">')
      // 链接
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gm, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      // 列表项
      .replace(/^\* (.*$)/gm, '<li>$1</li>')
      .replace(/^- (.*$)/gm, '<li>$1</li>')
      // 换行
      .replace(/\n/g, '<br>');

    // 处理列表
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    container.innerHTML = html;
  }

  // 监听DOM变化，处理新添加的注释
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
}
