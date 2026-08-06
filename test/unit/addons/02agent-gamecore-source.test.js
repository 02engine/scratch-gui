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

        const cloneBlocks = blocks.filter(block => block.opcode === 'control_create_clone_of');
        expect(cloneBlocks.length).toBeGreaterThan(0);
        cloneBlocks.forEach(cloneBlock => {
            const menuId = cloneBlock.inputs?.CLONE_OPTION?.block;
            const menuBlock = byId[menuId];
            expect(menuBlock?.opcode).toBe('control_create_clone_of_menu');
            expect(menuBlock?.fields?.CLONE_OPTION?.value).toBe('_myself_');
            expect(menuBlock?.parent).toBe(cloneBlock.id);
            expect(menuBlock?.shadow).toBe(true);

            let repeatBlock = byId[cloneBlock.parent];
            while (repeatBlock && repeatBlock.opcode !== 'control_repeat') {
                repeatBlock = byId[repeatBlock.parent];
            }
            const resetBlock = byId[repeatBlock?.next];
            const resetValue = byId[resetBlock?.inputs?.VALUE?.block];
            expect(repeatBlock?.opcode).toBe('control_repeat');
            expect(resetBlock?.opcode).toBe('data_setvariableto');
            expect(resetBlock?.fields?.VARIABLE?.value).toBe('MY_SLOT');
            expect(resetBlock?.fields?.VARIABLE?.scope).toBe('local');
            expect(resetValue?.fields?.TEXT?.value).toBe('0');
        });

        const broadcastReceivers = blocks.filter(block => block.opcode === 'event_whenbroadcastreceived');
        expect(broadcastReceivers.length).toBeGreaterThan(0);
        broadcastReceivers.forEach(receiver => {
            const guard = byId[receiver.next];
            const guardCondition = byId[guard?.inputs?.CONDITION?.block];
            const stopBlock = byId[guard?.inputs?.SUBSTACK?.block];
            expect(guard?.opcode).toBe('control_if');
            expect(guardCondition?.opcode).toBe('operator_not');
            expect(stopBlock?.opcode).toBe('control_stop');
            expect(stopBlock?.fields?.STOP_OPTION?.value).toBe('this script');
        });

        const predecessorByNext = new Map(blocks.filter(block => block.next).map(block => [block.next, block]));
        const methodAssignments = blocks.filter(block =>
            block.opcode === 'data_setvariableto' && block.fields?.VARIABLE?.value === 'JS_METHOD');
        expect(methodAssignments).toHaveLength(10);
        methodAssignments.forEach(methodAssignment => {
            const lockAssignment = predecessorByNext.get(methodAssignment.id);
            const waitForLock = predecessorByNext.get(lockAssignment?.id);
            const lockValue = byId[lockAssignment?.inputs?.VALUE?.block];
            expect(lockAssignment?.opcode).toBe('data_setvariableto');
            expect(lockAssignment?.fields?.VARIABLE?.value).toBe('JS_BUSY');
            expect(lockValue?.fields?.TEXT?.value).toBe('1');
            expect(waitForLock?.opcode).toBe('control_wait_until');
        });

        const requestReceiver = broadcastReceivers.find(block =>
            block.fields?.BROADCAST_OPTION?.value === 'JS_REQUEST');
        const requestGuard = byId[requestReceiver?.next];
        const requestFirstBlock = byId[requestGuard?.next];
        expect(requestFirstBlock?.opcode).toBe('data_setvariableto');
        expect(requestFirstBlock?.fields?.VARIABLE?.value).toBe('JS_REQUEST_JSON');
    });
});
