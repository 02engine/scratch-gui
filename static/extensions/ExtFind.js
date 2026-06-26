// ExtFind TurboWarp loader extension.
// Loads published extensions from https://extfindbackend.0pen.top by extension ID.
(function (Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    throw new Error('ExtFind must run unsandboxed');
  }

  const API_BASE = 'https://extfindbackend.0pen.top/api';

  const css = `
    .extfind-backdrop{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(0,0,0,.35);font-family:Inter,Roboto,Arial,sans-serif}
    .extfind-dialog{width:min(460px,calc(100vw - 32px));border-radius:24px;background:#f8fffd;color:#173330;box-shadow:0 18px 60px rgba(0,0,0,.28);padding:24px;box-sizing:border-box}
    .extfind-dialog h2{margin:0 0 8px;font-size:24px;line-height:1.2}
    .extfind-dialog p{margin:0 0 18px;color:#52615f;font-size:14px;line-height:1.5}
    .extfind-field{display:flex;gap:8px;margin-bottom:14px}
    .extfind-input,.extfind-select{width:100%;border:1px solid #b8ccca;border-radius:12px;background:#fff;padding:12px 14px;font:inherit;color:#173330;box-sizing:border-box}
    .extfind-button{border:0;border-radius:999px;background:#00baad;color:#00201d;padding:11px 18px;font-weight:700;cursor:pointer;white-space:nowrap}
    .extfind-button.secondary{background:#d7f5f1;color:#173330}
    .extfind-button.text{background:transparent;color:#52615f}
    .extfind-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
    .extfind-status{min-height:20px;margin-top:10px;color:#52615f;font-size:13px}
    .extfind-card{display:none;margin-top:14px;border:1px solid #cce4e1;border-radius:16px;padding:14px;background:#fff}
    .extfind-card strong{display:block;margin-bottom:6px}
  `;

  const sanitizeId = (value) => String(value || '').trim();
  const pickLatest = (versions) => versions.find((version) => version.isLatest) || versions[0];
  const pickPrimaryFile = (version) => version?.files?.find((file) => file.isPrimary) || version?.files?.[0];

  const fetchExtensionSource = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`文件下载失败：${response.status}`);
    return response.text();
  };

  const toDataURL = (code, sourceURL) => {
    const source = `${code}\n//# sourceURL=${sourceURL}`;
    const bytes = new TextEncoder().encode(source);
    let binary = '';
    bytes.forEach(byte => {
      binary += String.fromCharCode(byte);
    });
    return `data:application/javascript;base64,${btoa(binary)}`;
  };

  const loadUnsandboxedExtensionURL = async (extensionManager, dataURL) => {
    const securityManager = extensionManager.securityManager;
    const originalGetSandboxMode = securityManager?.getSandboxMode;
    if (securityManager && typeof originalGetSandboxMode === 'function') {
      securityManager.getSandboxMode = (url) => (url === dataURL ? 'unsandboxed' : originalGetSandboxMode.call(securityManager, url));
    }
    try {
      return await extensionManager.loadExtensionURL(dataURL);
    } finally {
      if (securityManager && typeof originalGetSandboxMode === 'function') {
        securityManager.getSandboxMode = originalGetSandboxMode;
      }
    }
  };

  const loadExtensionUrl = async (url, extensionId) => {
    const extensionManager = Scratch.vm?.extensionManager;
    if (extensionId && extensionManager?.isExtensionLoaded?.(extensionId)) {
      return;
    }

    const code = await fetchExtensionSource(url);
    if (extensionManager?.loadExtensionURL) {
      return loadUnsandboxedExtensionURL(extensionManager, toDataURL(code, url));
    }
    throw new Error('无法访问 Scratch VM 扩展加载器。');
  };

  const createDialog = () => {
    const existing = document.querySelector('.extfind-backdrop');
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.className = 'extfind-backdrop';
    backdrop.innerHTML = `
      <div class="extfind-dialog" role="dialog" aria-modal="true" aria-label="ExtFind 扩展加载器">
        <h2>ExtFind 扩展加载器</h2>
        <p>从 <a href="https://extfind.0pen.top/" target="_blank" rel="noreferrer">extfind.0pen.top</a> 获取、上传和点评扩展，并输入扩展 ID 后选择版本和文件加载。</p>
        <div class="extfind-field">
          <input class="extfind-input" type="text" placeholder="输入扩展 ID" autocomplete="off" />
          <button class="extfind-button secondary" type="button">获取</button>
        </div>
        <div class="extfind-card">
          <strong class="extfind-name"></strong>
          <p class="extfind-summary"></p>
          <select class="extfind-select" data-field="version"></select>
          <select class="extfind-select" data-field="file"></select>
        </div>
        <div class="extfind-status">请输入扩展 ID。</div>
        <div class="extfind-actions">
          <button class="extfind-button text" type="button" data-action="close">取消</button>
          <button class="extfind-button" type="button" data-action="load">加载扩展</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    return backdrop;
  };

  const openLoader = () => {
    const dialog = createDialog();
    const input = dialog.querySelector('.extfind-input');
    const fetchButton = dialog.querySelector('.extfind-button.secondary');
    const loadButton = dialog.querySelector('[data-action="load"]');
    const closeButton = dialog.querySelector('[data-action="close"]');
    const status = dialog.querySelector('.extfind-status');
    const card = dialog.querySelector('.extfind-card');
    const name = dialog.querySelector('.extfind-name');
    const summary = dialog.querySelector('.extfind-summary');
    const versionSelect = dialog.querySelector('[data-field="version"]');
    const fileSelect = dialog.querySelector('[data-field="file"]');
    let extensionData = null;

    const setStatus = (message) => {
      status.textContent = message;
    };

    const getVersions = () => Array.isArray(extensionData?.versions) ? extensionData.versions : [];

    const getSelectedVersion = () => {
      const versions = getVersions();
      return versions.find((item) => item.id === versionSelect.value) || pickLatest(versions);
    };

    const renderFiles = () => {
      const version = getSelectedVersion();
      const files = Array.isArray(version?.files) ? version.files : [];
      fileSelect.innerHTML = '';
      files.forEach((file) => {
        const option = document.createElement('option');
        option.value = file.id;
        option.textContent = `${file.displayName || file.originalName || '文件'}${file.isPrimary ? ' 主文件' : ''}`;
        fileSelect.appendChild(option);
      });
      const primary = pickPrimaryFile(version);
      if (primary) fileSelect.value = primary.id;
    };

    const fetchInfo = async () => {
      const extensionId = sanitizeId(input.value);
      if (!extensionId) {
        setStatus('扩展 ID 不能为空。');
        input.focus();
        return;
      }
      setStatus('正在获取扩展信息...');
      const response = await fetch(`${API_BASE}/extensions/${encodeURIComponent(extensionId)}`);
      if (!response.ok) throw new Error(response.status === 404 ? '扩展不存在或未发布。' : `获取失败：${response.status}`);
      extensionData = await response.json();
      const versions = getVersions();
      versionSelect.innerHTML = '';
      versions.forEach((version) => {
        const option = document.createElement('option');
        option.value = version.id;
        option.textContent = `${version.version}${version.isLatest ? ' 最新' : ''}`;
        versionSelect.appendChild(option);
      });
      const latest = pickLatest(versions);
      if (latest) versionSelect.value = latest.id;
      renderFiles();
      name.textContent = extensionData.name || extensionId;
      summary.textContent = extensionData.summary || '暂无简介';
      card.style.display = 'block';
      setStatus(versions.length ? '请选择版本和文件，然后点击加载扩展。' : '这个扩展没有可用版本。');
    };

    const loadSelected = async () => {
      if (!extensionData) await fetchInfo();
      if (!extensionData) return;
      const version = getSelectedVersion();
      if (!version) throw new Error('没有可加载的版本。');
      const files = Array.isArray(version.files) ? version.files : [];
      const file = files.find((item) => item.id === fileSelect.value) || pickPrimaryFile(version);
      if (!file) throw new Error(`版本 ${version.version} 没有文件。`);
      setStatus(`正在加载 ${extensionData.name} ${version.version} / ${file.displayName || file.originalName || '文件'}...`);
      await loadExtensionUrl(`${API_BASE}/files/${encodeURIComponent(file.id)}/load.js`, extensionData.extensionId);
      setStatus(`已加载 ${extensionData.name} ${version.version} / ${file.displayName || file.originalName || '文件'}`);
      setTimeout(() => dialog.remove(), 600);
    };

    fetchButton.addEventListener('click', () => fetchInfo().catch((error) => setStatus(error.message || '获取失败。')));
    loadButton.addEventListener('click', () => loadSelected().catch((error) => setStatus(error.message || '加载失败。')));
    closeButton.addEventListener('click', () => dialog.remove());
    versionSelect.addEventListener('change', renderFiles);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') fetchInfo().catch((error) => setStatus(error.message || '获取失败。'));
    });
    input.focus();
  };

  class ExtFindLoader {
    getInfo () {
      return {
        id: 'extfind',
        name: 'ExtFind',
        color1: '#00baad',
        color2: '#00998f',
        color3: '#006d66',
        blocks: [
          {
            blockType: Scratch.BlockType.BUTTON,
            text: '打开 ExtFind 扩展加载器',
            func: 'openLoader'
          }
        ]
      };
    }

    openLoader () {
      openLoader();
    }
  }

  Scratch.extensions.register(new ExtFindLoader());

  setTimeout(openLoader, 0);
})(Scratch);
