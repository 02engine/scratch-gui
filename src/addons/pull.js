/* --------------------------------------------------------------
   1. 克隆仓库：只在不存在或命令行带 --force 时才重新 clone
   -------------------------------------------------------------- */
const repoPath = pathUtil.resolve(__dirname, 'ScratchAddons');
const shouldClone = !fs.existsSync(repoPath) || process.argv.includes('--force') || process.argv.includes('-f');

if (shouldClone) {
    rimraf.sync(repoPath);                                   // 只在需要时才删
    childProcess.execSync(
        `git clone --depth=1 --branch=tw https://github.com/TurboWarp/addons ${repoPath}`
    );
}

/* --------------------------------------------------------------
   2. 目标目录不再一次性清空
   -------------------------------------------------------------- */
 // 移除原来这几行：
 // for (const folder of ['addons', 'addons-l10n', 'addons-l10n-settings', 'libraries']) { ... rimraf ... }

/* --------------------------------------------------------------
   3. 复制文件时只覆盖同名文件（processAddon 内部）
   -------------------------------------------------------------- */
const copyIfChanged = (src, dest) => {
    // 如果目标不存在或内容不同才写文件
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(pathUtil.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        return;
    }
    const srcBuf = fs.readFileSync(src);
    const destBuf = fs.readFileSync(dest);
    if (!srcBuf.equals(destBuf)) {
        fs.copyFileSync(src, dest);
    }
};

const processAddon = (id, oldDirectory, newDirectory) => {
    const files = walk(oldDirectory);

    const ASSET_EXTENSIONS = ['.svg', '.png'];
    const assets = files.filter(f => ASSET_EXTENSIONS.some(ext => f.endsWith(ext)));

    for (const file of files) {
        const oldPath = pathUtil.join(oldDirectory, file);
        const newPath = pathUtil.join(newDirectory, file);

        // ---------- addon.json 特殊处理 ----------
        if (file === 'addon.json') {
            const contents = fs.readFileSync(oldPath, 'utf-8');
            const parsedManifest = JSON.parse(contents);
            normalizeManifest(id, parsedManifest);
            addonIdToManifest[id] = parsedManifest;

            const manifestEntry = pathUtil.join(newDirectory, '_manifest_entry.js');
            const runtimeEntry  = pathUtil.join(newDirectory, '_runtime_entry.js');

            // 只在内容不同时写文件
            const newManifestJS = generateManifestEntry(id, parsedManifest);
            if (!fs.existsSync(manifestEntry) || fs.readFileSync(manifestEntry, 'utf-8') !== newManifestJS) {
                fs.mkdirSync(pathUtil.dirname(manifestEntry), { recursive: true });
                fs.writeFileSync(manifestEntry, newManifestJS);
            }

            const newRuntimeJS = generateRuntimeEntry(id, parsedManifest, assets);
            if (!fs.existsSync(runtimeEntry) || fs.readFileSync(runtimeEntry, 'utf-8') !== newRuntimeJS) {
                fs.mkdirSync(pathUtil.dirname(runtimeEntry), { recursive: true });
                fs.writeFileSync(runtimeEntry, newRuntimeJS);
            }
            continue;
        }

        // ---------- 普通文件（js / css / 资源） ----------
        let contents = fs.readFileSync(oldPath);

        if (file.endsWith('.js') || file.endsWith('.css')) {
            contents = contents.toString('utf-8');

            if (file.endsWith('.js')) {
                includeImportedLibraries(contents);
                contents = includePolyfills(contents);
                contents = rewriteAssetImports(contents);
            }
            detectUnimplementedAPIs(id, contents);
        }

        // **只覆盖已存在的文件**，不存在则跳过
        if (fs.existsSync(newPath)) {
            if (file.endsWith('.js') || file.endsWith('.css')) {
                const newContent = contents;
                const oldContent = fs.readFileSync(newPath, 'utf-8');
                if (newContent !== oldContent) {
                    fs.writeFileSync(newPath, newContent);
                }
            } else {
                // 二进制资源（如图片）用 copyIfChanged
                copyIfChanged(oldPath, newPath);
            }
        }
        // 如果 newPath 不存在 → 直接忽略（不创建新文件）
    }
};

/* --------------------------------------------------------------
   4. 翻译文件（l10n）同样只覆盖已有文件
   -------------------------------------------------------------- */
for (const file of l10nFiles) {
    const oldDirectory = pathUtil.resolve(__dirname, 'ScratchAddons', 'addons-l10n', file);
    if (!fs.statSync(oldDirectory).isDirectory()) continue;

    const fixedName = file === 'pt-br' ? 'pt' : file;
    const runtimePath = pathUtil.resolve(__dirname, 'addons-l10n', `${fixedName}.json`);
    const settingsPath = pathUtil.resolve(__dirname, 'addons-l10n-settings', `${fixedName}.json`);

    const {settings, runtime, upstreamMessageIds} = parseMessageDirectory(oldDirectory);
    for (const id of upstreamMessageIds) allUpstreamMessageIds.add(id);

    // 只在文件已存在或内容不同时写
    const writeIfChanged = (path, data) => {
        const json = JSON.stringify(data, null, 4);
        if (!fs.existsSync(path) || fs.readFileSync(path, 'utf-8') !== json) {
            fs.mkdirSync(pathUtil.dirname(path), { recursive: true });
            fs.writeFileSync(path, json);
        }
    };

    writeIfChanged(runtimePath, runtime);
    if (fixedName !== 'en') writeIfChanged(settingsPath, settings);
}

/* --------------------------------------------------------------
   5. generated 目录下的入口文件：同样只在内容变化时写
   -------------------------------------------------------------- */
const writeGenerated = (path, content) => {
    if (!fs.existsSync(path) || fs.readFileSync(path, 'utf-8') !== content) {
        fs.mkdirSync(pathUtil.dirname(path), { recursive: true });
        fs.writeFileSync(path, content);
    }
};

writeGenerated(pathUtil.resolve(generatedPath, 'l10n-entries.js'), generateL10nEntries(languages));
writeGenerated(pathUtil.resolve(generatedPath, 'l10n-settings-entries.js'), generateL10nSettingsEntries(languages));
writeGenerated(pathUtil.resolve(generatedPath, 'addon-entries.js'), generateRuntimeEntries());
writeGenerated(pathUtil.resolve(generatedPath, 'addon-manifests.js'), generateManifestEntries());

const upstreamMetaPath = pathUtil.resolve(generatedPath, 'upstream-meta.json');
writeGenerated(upstreamMetaPath, JSON.stringify({ commit: commitHash }));
