import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const require = createRequire(import.meta.url);
const root = process.cwd();
const resolveFile = (relativePath) => path.resolve(root, relativePath);

const vendorManifestPath = path.join(root, 'vendor', 'manifest.json');
const vendorManifest = fs.existsSync(vendorManifestPath)
  ? JSON.parse(fs.readFileSync(vendorManifestPath, 'utf8'))
  : {};

const vendorAliasesPlugin = () => ({
  name: 'vendor-aliases',
  enforce: 'pre',
  resolveId(source) {
    if (vendorManifest[source]) return vendorManifest[source];
    return null;
  },
});

const appWebpackCompatPlugin = () => {
  const cssLangs = ['css', 'less', 'sass', 'scss', 'styl', 'stylus'];
  const isCssFile = (filePath) => cssLangs.includes(path.extname(filePath).slice(1).toLowerCase());

  return {
    name: 'app-webpack-compat',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer) return null;

      // Absolute URLs pointing at files under static/ should become real modules.
      if (source.startsWith('/') && !source.startsWith('/@') && !source.startsWith('/src/') && !source.startsWith('/vendor/')) {
        const cleanSource = source.split('?')[0];
        const candidate = cleanSource.startsWith('/static/')
          ? path.join(root, cleanSource)
          : path.join(root, 'static', cleanSource);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      }

      const stripped = source.replace(/^!+/, '');

      if (stripped.startsWith('file-loader?name=sw.js!')) {
        return '\0dev-service-worker';
      }

      if (source.includes('?addon-css-resource')) {
        const target = source.split('?')[0];
        const absolute = path.resolve(path.dirname(importer.split('?')[0]), target);
        return `\0dev-addon-css-${Buffer.from(absolute).toString('base64url')}`;
      }

      if (stripped.startsWith('base64-loader!')) {
        const target = stripped.slice('base64-loader!'.length);
        const absolute = path.resolve(path.dirname(importer.split('?')[0]), target);
        return `\0dev-base64-${Buffer.from(absolute).toString('base64url')}`;
      }

      if (stripped.startsWith('arraybuffer-loader!')) {
        const target = stripped.slice('arraybuffer-loader!'.length);
        const absolute = path.resolve(path.dirname(importer.split('?')[0]), target);
        return `\0dev-arraybuffer-${Buffer.from(absolute).toString('base64url')}`;
      }

      if (source.includes('tw-recolor/build!')) {
        const target = source.slice(source.lastIndexOf('!') + 1);
        const absolute = path.resolve(path.dirname(importer.split('?')[0]), target);
        return `\0dev-recolor-${Buffer.from(absolute).toString('base64url')}`;
      }

      if (/^!*raw-loader!/.test(stripped)) {
        const target = stripped.replace(/^!*raw-loader!/, '');
        if (target.startsWith('.')) return `${path.resolve(path.dirname(importer.split('?')[0]), target)}?raw`;
      }

      return null;
    },
    load(id) {
      if (id === '\0dev-service-worker') {
        return `export default ${JSON.stringify(`${process.env.ROOT || ''}sw.js`)};`;
      }

      if (id.startsWith('\0dev-addon-css-')) {
        const filePath = Buffer.from(id.slice('\0dev-addon-css-'.length), 'base64url').toString();
        if (!fs.existsSync(filePath)) return null;
        return [
          `const cssText = ${JSON.stringify(fs.readFileSync(filePath, 'utf8'))};`,
          `export default [[${JSON.stringify(filePath)}, cssText]];`,
        ].join('\n');
      }

      if (id.startsWith('\0dev-base64-')) {
        const filePath = Buffer.from(id.slice('\0dev-base64-'.length), 'base64url').toString();
        if (!fs.existsSync(filePath)) return null;
        return `export default ${JSON.stringify(fs.readFileSync(filePath).toString('base64'))};`;
      }

      if (id.startsWith('\0dev-arraybuffer-')) {
        const filePath = Buffer.from(id.slice('\0dev-arraybuffer-'.length), 'base64url').toString();
        if (!fs.existsSync(filePath)) return null;
        return [
          `const bytes = Uint8Array.from(atob(${JSON.stringify(fs.readFileSync(filePath).toString('base64'))}), (char) => char.charCodeAt(0));`,
          'export default bytes.buffer;',
        ].join('\n');
      }

      if (id.startsWith('\0dev-recolor-')) {
        const filePath = Buffer.from(id.slice('\0dev-recolor-'.length), 'base64url').toString();
        if (!fs.existsSync(filePath)) return null;
        const svg = fs.readFileSync(filePath, 'utf8');
        return [
          `const original = ${JSON.stringify(svg)};`,
          'const OLD_PRIMARY_COLOR = "#855cd6";',
          'export default function getSRC() {',
          '  const recolored = typeof Recolor === "object" ? original.replace(new RegExp(OLD_PRIMARY_COLOR, "gi"), Recolor.primary) : original;',
          '  return "data:image/svg+xml;," + encodeURIComponent(recolored);',
          '}',
        ].join('\n');
      }

      return null;
    },
    transform(code, id) {
      if (!/\.(jsx?|tsx?)$/.test(id)) return null;
      let next = code;

      if (id.includes('/src/addons/generated/')) {
        next = next.replace(/\brequire\((["'][^"']+["'])\)/g, 'import($1)');
      }

      if (id.includes('/src/addons/addons/')) {
        next = next
          .replace(/!css-loader!([^"']+)/g, '$1?addon-css-resource')
          .replace(/!url-loader!/g, '')
          .replace(/!file-loader\?name=[^!]+!/g, '');
      }

      if (next.includes('webpackIgnore')) {
        next = next.replace(/\/\*\s*webpackIgnore(?::[^*]*)?\*\//g, '/* @vite-ignore */');
      }

      return next !== code ? { code: next, map: null } : null;
    },
  };
};

const commonjsSourceCompatPlugin = () => ({
  name: 'commonjs-source-compat',
  enforce: 'pre',
  transform(code, id) {
    if (/\/src\/lib\/brand\.js$/.test(id)) {
      const match = code.match(/APP_NAME\s*:\s*(['"])(.*?)\1/);
      const appName = match ? match[2] : '02Engine';
      return {
        code: `export const APP_NAME = ${JSON.stringify(appName)};\nexport default { APP_NAME };`,
        map: null,
      };
    }

    if (/\/src\/generated\/microbit-hex-url\.cjs$/.test(id)) {
      return {
        code: `export default ${JSON.stringify(`${process.env.ROOT || ''}static/microbit/scratch-microbit-1.2.0.hex`)};`,
        map: null,
      };
    }

    if (/\/src\/lib\/app-state-hoc\.jsx$/.test(id)) {
      const next = code
        .replace("const guiRedux = require('../reducers/gui');", 'const guiRedux = __viteGuiRedux;')
        .replace("const {ScratchPaintReducer} = require('./tw-scratch-paint');", 'const {ScratchPaintReducer} = __viteTwScratchPaint;');
      return {
        code: [
          "import * as __viteGuiRedux from '../reducers/gui';",
          "import * as __viteTwScratchPaint from './tw-scratch-paint';",
          next,
        ].join('\n'),
        map: null,
      };
    }

    if (/\/src\/lib\/tw-scratch-paint\.js$/.test(id)) {
      // The real scratch-paint is prebundled into vendor/scratch-paint.mjs.
      return {
        code: [
          "import * as __viteRealScratchPaint from 'scratch-paint';",
          code.replace("realScratchPaint = require('scratch-paint');", 'realScratchPaint = __viteRealScratchPaint;'),
        ].join('\n'),
        map: null,
      };
    }

    return null;
  },
});

const allCssModulesPlugin = () => {
  const cssLangs = ['css', 'less', 'sass', 'scss', 'styl', 'stylus'];
  const isCssFile = (filePath) => cssLangs.includes(path.extname(filePath).slice(1).toLowerCase());

  return {
    name: 'all-css-modules',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer) return null;
      const cleanSource = source.split('?')[0];
      if (!/\.(css|less|sass|scss|styl|stylus)$/.test(cleanSource)) return null;
      if (cleanSource.includes('.module.')) return null;

      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (!resolved || resolved.id.startsWith('\0')) return null;

      const cleanId = resolved.id.split('?')[0];
      if (!isCssFile(cleanId) || cleanId.includes('.module.')) return null;
      if (!fs.existsSync(cleanId)) return null;

      const moduleId = cleanId.replace(/\.(css|less|sass|scss|styl|stylus)$/, '.module.$1');
      return `${moduleId}?vite-css-module`;
    },
    load(id) {
      if (!id.includes('?vite-css-module')) return null;
      const original = id
        .replace('?vite-css-module', '')
        .replace(/\.module(\.(css|less|sass|scss|styl|stylus))$/, '$1');
      if (!fs.existsSync(original)) return null;
      return fs.readFileSync(original, 'utf8');
    },
  };
};

const staticDirPlugin = () => {
  const staticRoot = path.join(root, 'static');
  const blocklyMediaRoot = path.join(root, 'node_modules/scratch-blocks/media');
  const highContrastMediaRoot = path.join(root, 'src/lib/themes/blocks/high-contrast-media/blocks-media');
  const contentTypes = {
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.js': 'text/javascript',
    '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
    '.css': 'text/css', '.html': 'text/html', '.txt': 'text/plain', '.woff': 'font/woff',
    '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  };

  return {
    name: 'static-dir',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const fullUrl = req.url || '';
        if (fullUrl.startsWith('/vendor/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          next();
          return;
        }
        if (fullUrl.startsWith('/static/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        const queryIndex = fullUrl.indexOf('?');
        const search = queryIndex === -1 ? '' : fullUrl.slice(queryIndex + 1);
        if (/\b(import|raw|url|inline|worker)\b/.test(search)) {
          next();
          return;
        }

        const requestUrl = decodeURIComponent(fullUrl.split('?')[0]);
        const relative = requestUrl.startsWith('/static/')
          ? requestUrl.slice('/static/'.length)
          : requestUrl.replace(/^\/+/, '');
        if (!relative || relative.includes('..')) {
          next();
          return;
        }

        const resolveStaticFile = (requestRelative) => {
          if (requestRelative.startsWith('blocks-media/default/')) {
            return path.join(blocklyMediaRoot, requestRelative.slice('blocks-media/default/'.length));
          }
          if (requestRelative.startsWith('blocks-media/high-contrast/')) {
            const rest = requestRelative.slice('blocks-media/high-contrast/'.length);
            const custom = path.join(highContrastMediaRoot, rest);
            if (fs.existsSync(custom) && fs.statSync(custom).isFile()) return custom;
            return path.join(blocklyMediaRoot, rest);
          }
          return path.join(staticRoot, requestRelative);
        };

        const filePath = resolveStaticFile(relative);
        const allowedRoots = [staticRoot, blocklyMediaRoot, highContrastMediaRoot];
        if (!allowedRoots.some((allowedRoot) => filePath.startsWith(allowedRoot)) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
};

const htmlRewritesPlugin = () => {
  // Same pretty paths webpack-dev-server's historyApiFallback handles.
  const rewrites = [
    [/^\/editor\/?$/, '/index.html'],
    [/^\/addons\/?$/, '/addons.html'],
    [/^\/credits\/?$/, '/credits.html'],
    [/^\/embed\/?$/, '/embed.html'],
    [/^\/fullscreen\/?$/, '/fullscreen.html'],
    [/^\/(\d+)\/?$/, '/indexold.html'],
    [/^\/\d+\/editor\/?$/, '/index.html'],
    [/^\/\d+\/embed\/?$/, '/embed.html'],
    [/^\/\d+\/fullscreen\/?$/, '/fullscreen.html']
  ];

  return {
    name: 'html-rewrites',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || req.method !== 'GET') return next();
        const queryIndex = req.url.indexOf('?');
        const pathname = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
        const query = queryIndex === -1 ? '' : req.url.slice(queryIndex);
        for (const [pattern, replacement] of rewrites) {
          if (pattern.test(pathname)) {
            req.url = replacement + query;
            return next();
          }
        }
        next();
      });
    },
  };
};

export default defineConfig({
  appType: 'mpa',
  root,
  publicDir: false,
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      assets: resolveFile('src/addons/addons/02agent/assets'),
      components: resolveFile('src/addons/addons/02agent/shims/components'),
      hooks: resolveFile('src/addons/addons/02agent/shims/hooks'),
      utils: resolveFile('src/addons/addons/02agent/shims/utils'),
      'text-encoding': resolveFile('src/lib/tw-text-encoder.js'),
      'react-virtualized': resolveFile('node_modules/react-virtualized/dist/commonjs/index.js'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.DEBUG': JSON.stringify(Boolean(process.env.DEBUG)),
    'process.env.ENABLE_SERVICE_WORKER': JSON.stringify(process.env.ENABLE_SERVICE_WORKER || ''),
    'process.env.ROOT': JSON.stringify(process.env.ROOT || ''),
    'process.env.ROUTING_STYLE': JSON.stringify(process.env.ROUTING_STYLE || 'filehash'),
  },
  plugins: [
    htmlRewritesPlugin(),
    vendorAliasesPlugin(),
    appWebpackCompatPlugin(),
    commonjsSourceCompatPlugin(),
    allCssModulesPlugin(),
    staticDirPlugin(),
    react({ jsxRuntime: 'classic' }),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: '[name]_[local]_[hash:base64:5]',
    },
    postcss: {
      plugins: [
        require('postcss-import')(),
        require('postcss-simple-vars')(),
        require('autoprefixer')(),
      ],
    },
    preprocessorOptions: {
      less: { javascriptEnabled: true },
    },
  },
  optimizeDeps: {
    entries: ['*.html'],
    include: [
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
    exclude: Object.keys(vendorManifest),
    esbuildOptions: {
      loader: { '.js': 'jsx' },
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
    },
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 8601,
    strictPort: false,
    open: false,
    warmup: {
      clientFiles: [
        'src/playground/editor.jsx',
        'vendor/scratch-vm.mjs',
        'vendor/scratch-render.mjs',
        'vendor/scratch-paint.mjs',
        'vendor/scratch-blocks.mjs',
      ],
    },
    watch: {
      ignored: ['**/.git/**', '**/node_modules/**', '**/build/**', '**/dist/**', '**/.npm-cache/**', '**/.bun-*/**'],
    },
  },
});
