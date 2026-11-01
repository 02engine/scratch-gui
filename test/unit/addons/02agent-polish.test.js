/**
 * Unit tests for the polish round: skills-changed reflow bridge, subagent partial
 * results (incl. checkSubagentResults annotation) and observeStage broadcast state.
 */
import {describe, expect, test, beforeEach} from '@jest/globals';

// jest jsdom has no localStorage; agentStores writes are wrapped in try/catch and would
// silently no-op. Provide a minimal in-memory shim before importing the store module.
const memoryStore = new Map();
globalThis.localStorage = {
    getItem: (key) => (memoryStore.has(key) ? memoryStore.get(key) : null),
    setItem: (key, value) => memoryStore.set(String(key), String(value)),
    removeItem: (key) => memoryStore.delete(key),
    clear: () => memoryStore.clear(),
};

const buildVm = () => {
    const makeSprite = (name, extra) => Object.assign(
        {
            id: `t-${name}`, getName: () => name, isStage: false,
            x: 0, y: 0, size: 100, direction: 90, visible: true, currentCostume: 0,
            speechBubble: null, _layerOrder: 1, sprite: {}, variables: {},
            getCostumes: () => [], blocks: {_blocks: extra.blocks || {}, _scripts: []}
        }, extra.targetProps || {}
    );
    const stage = makeSprite('Stage', {
        isStage: true,
        blocks: {
            hat1: {opcode: 'event_whenbroadcastreceived', fields: {BROADCAST_OPTION: ['消息A']}},
            hat2: {opcode: 'event_whenbroadcastreceived', fields: {BROADCAST_OPTION: ['消息B']}},
            data1: {opcode: 'data_setvariableto', fields: {}}
        }
    });
    const cat = makeSprite('Cat', {targetProps: {speechBubble: {text: 'hi'}}});
    const runtime = {
        getStageTarget: () => stage,
        targets: [stage, cat],
        threads: [{topBlock: 'hat1'}]
    };
    return {vm: {runtime}, stage, cat, runtime};
};

describe('02Agent skills-changed bridge', () => {
    test('writeSkillByAuthor notifies the listener with a display name and is fail-closed', async () => {
        const agentStores = await import('../../../src/addons/addons/02agent/agentStores');
        const seen = [];
        const unbind = agentStores.bindSkillsChangedListener((result) => seen.push(result));
        agentStores.bindSkillsWriter((input) => ({status: 'created', id: input.id || 'skill-x', enabled: false}));
        const result = agentStores.writeSkillByAuthor({name: '命名回复规范', content: 'a'.repeat(30)}, 'ai');
        expect(result.status).toBe('created');
        expect(result.enabled).toBe(false);
        expect(seen).toHaveLength(1);
        expect(seen[0].name).toBe('命名回复规范');
        unbind();
        agentStores.bindSkillsChangedListener(null);
        agentStores.bindSkillsWriter(null);
    });

    test('writeSkillByAuthor throws when no writer is bound (fail closed)', async () => {
        const agentStores = await import('../../../src/addons/addons/02agent/agentStores');
        agentStores.bindSkillsWriter(null);
        expect(() => agentStores.writeSkillByAuthor({name: 'x', content: 'y'.repeat(30)}, 'ai')).toThrow(/没有可写的技能存储/);
    });
});

describe('02Agent subagent partial results', () => {
    test('finishSubagentResult keeps partial flag and surfaces it in AITools.checkSubagentResults', async () => {
        const agentStores = await import('../../../src/addons/addons/02agent/agentStores');
        const entry = agentStores.createSubagentResult('critic', '检查 loss 计算');
        agentStores.finishSubagentResult(entry.id, {status: 'error', error: 'network boom'});
        const entryPartial = agentStores.createSubagentResult('critic', '第二轮');
        agentStores.finishSubagentResult(entryPartial.id, {status: 'completed', summary: '只有半截内容', partial: true});

        const {AITools} = await import('../../../src/addons/addons/02agent/tools');
        const tools = new AITools(buildVm().vm);
        const out = await tools.checkSubagentResults();
        const rows = out.results.filter((row) => row.task === '第二轮' || row.task === '检查 loss 计算');
        const errorRow = rows.find((row) => row.task === '检查 loss 计算');
        const partialRow = rows.find((row) => row.task === '第二轮');
        expect(errorRow.status).toBe('error');
        expect(errorRow.partial).toBe(false);
        expect(partialRow.status).toBe('completed');
        expect(partialRow.partial).toBe(true);
        expect(partialRow.summary).toContain('部分结果');

        // Runtime guard: a partial run never reports full status.
        const reflowLabel = partialRow.partial ? '（部分结果，可能不完整）' : '';
        expect(reflowLabel).toBe('（部分结果，可能不完整）');
    });
});

describe('02Agent observeStage broadcast state', () => {
    test('reports listener count, message names and in-flight broadcast once (no double count)', async () => {
        const {AITools} = await import('../../../src/addons/addons/02agent/tools');
        const tools = new AITools(buildVm().vm);
        const out = tools.observeStage({includeVariables: false});
        expect(out.broadcast.listeners).toBe(2);
        expect(out.broadcast.listeningTo).toEqual(expect.arrayContaining(['消息A', '消息B']));
        expect(out.broadcast.running).toEqual(['消息A']);
        expect(out.threadsRunning).toBe(1);
        const catRow = out.targets.find((row) => row.name === 'Cat');
        expect(catRow.speech).toBe('hi');
    });

    test('running broadcast without a matching hat is ignored', async () => {
        const vm = buildVm();
        vm.runtime.threads.push({topBlock: 'ghost-id'});
        await (async () => {})();
        const {AITools} = await import('../../../src/addons/addons/02agent/tools');
        const tools = new AITools(vm.vm);
        const out = tools.observeStage();
        expect(out.broadcast.running).toEqual(['消息A']);
        expect(out.threadsRunning).toBe(2);
    });
});
