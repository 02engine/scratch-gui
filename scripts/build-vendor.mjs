import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const webpack = require('webpack5');
const { webpackConfig, manifest } = require('../webpack.vendor.config.cjs');

const root = process.cwd();
const vendorDir = path.join(root, 'vendor');

const compiler = webpack(webpackConfig);

compiler.run((error, stats) => {
    if (error) {
        console.error('[vendor] webpack failed to start:', error);
        process.exitCode = 1;
        return;
    }

    const info = stats.toJson({all: false, errors: true, warnings: true});
    if (stats.hasErrors()) {
        console.error(stats.toString({colors: false, errors: true, warnings: false, errorDetails: true}));
        process.exitCode = 1;
        return;
    }

    if (stats.hasWarnings()) {
        console.warn(stats.toString({colors: false, errors: false, warnings: true, errorDetails: false}));
    }

    // Strip dependency sourceMappingURL comments so Vite does not try to read
    // maps for files that are not emitted in the vendor directory.
    for (const file of fs.readdirSync(vendorDir)) {
        if (!file.endsWith('.mjs')) continue;
        const filePath = path.join(vendorDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const cleaned = content.replace(/\/\/# sourceMappingURL=.*$/gm, '');
        if (cleaned !== content) fs.writeFileSync(filePath, cleaned, 'utf8');
    }

    const manifestByFile = {};
    for (const [specifier, file] of Object.entries(manifest)) {
        manifestByFile[specifier] = path.join(vendorDir, file).replace(/\\/g, '/');
    }
    fs.mkdirSync(vendorDir, {recursive: true});
    fs.writeFileSync(
        path.join(vendorDir, 'manifest.json'),
        JSON.stringify(manifestByFile, null, 2),
        'utf8'
    );

    console.log(`[vendor] built ${Object.keys(manifest).length} modules in ${Date.now() - compiler.startTime || 0}ms`);
    compiler.close(() => {});
});
