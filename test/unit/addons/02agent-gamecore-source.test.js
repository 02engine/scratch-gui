import path from 'path';
import { execFileSync } from 'child_process';
import { jsToJson } from '../../../src/addons/addons/02agent/converter';
import {
    validateBlockGraph,
    validateRuntimeBroadcastBlocks
} from '../../../src/addons/addons/02agent/blockGraph';

const projectRoot = path.resolve(process.cwd(), '..', 'whzl');
const builderPath = path.join(projectRoot, 'scripts', 'gandi-gamecore-build.mjs');

describe('GameCore graphical source contract', () => {
    test('converts all generated scripts into one valid connected block graph', () => {
        const generated = JSON.parse(execFileSync(process.execPath, [builderPath, 'all'], {
            cwd: projectRoot,
            encoding: 'utf8',
            maxBuffer: 8 * 1024 * 1024
        }));
        const source = generated.patch
            .replace(/^\*\*\* Begin Patch\r?\n/, '')
            .replace(/^\*\*\* Update File:[^\r\n]*\r?\n/, '')
            .replace(/^\/\* @scratch-target[\s\S]*?\*\/\r?\n/, '')
            .replace(/\r?\n\*\*\* End Patch\s*$/, '');
        expect(source).toContain('// @script core-init');
        expect(source).toContain('// @script clone-render');

        const blocks = jsToJson(source);
        expect(blocks.length).toBeGreaterThan(1000);
        const byId = Object.fromEntries(blocks.map(block => [block.id, block]));
        const scripts = blocks.filter(block => block.topLevel).map(block => block.id);
        expect(scripts).toHaveLength(20);
        expect(validateBlockGraph(byId, {scripts}).valid).toBe(true);
        expect(validateRuntimeBroadcastBlocks(byId)).toEqual({valid: true, errors: []});

        const broadcastIds = new Map();
        blocks.forEach(block => {
            const field = block.fields?.BROADCAST_OPTION;
            if (!field?.value) return;
            const ids = broadcastIds.get(field.value) || new Set();
            ids.add(field.id);
            broadcastIds.set(field.value, ids);
        });
        broadcastIds.forEach(ids => expect(ids.size).toBe(1));

        const localSlots = blocks.filter(block => Object.values(block.fields || {}).some(field =>
            field?.value === 'MY_SLOT' && field?.scope === 'local'));
        expect(localSlots.length).toBeGreaterThan(0);
        expect(source).not.toContain('$field_VARIABLE: "MY_SLOT"');
    });
});
