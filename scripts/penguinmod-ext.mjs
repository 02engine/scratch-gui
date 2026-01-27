import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

const SOURCE =
  'https://raw.githubusercontent.com/PenguinMod/PenguinMod-ExtensionsGallery/main/src/lib/extensions.js';

const OUT_FILE = path.resolve(
  'static/penguinmod/extensions.js'
);

console.log('[PenguinMod] Fetching gallery…');

const res = await fetch(SOURCE);
if (!res.ok) {
  throw new Error(`Fetch failed: ${res.status}`);
}

const code = await res.text();

/**
 * 可选：简单 sanity check
 */
if (!code.includes('export default')) {
  throw new Error('Invalid PenguinMod module');
}

/**
 * 包一层 header，方便审计
 */
const wrapped = `
// AUTO-GENERATED — DO NOT EDIT
// Source: ${SOURCE}
// Synced at: ${new Date().toISOString()}

${code}
`;

await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
await fs.writeFile(OUT_FILE, wrapped, 'utf8');

console.log('[PenguinMod] Gallery synced successfully.');
