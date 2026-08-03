import {
    validateBlockGraph,
    validateRuntimeBroadcastBlocks,
    validateSerializedBroadcastSchema
} from '../../../src/addons/addons/02agent/blockGraph';
import {jsToJson} from '../../../src/addons/addons/02agent/converter';

const makeValidGraph = () => ({
    hat: {
        id: 'hat',
        opcode: 'event_whenbroadcastreceived',
        parent: null,
        next: 'send',
        topLevel: true,
        shadow: false,
        inputs: {},
        fields: {
            BROADCAST_OPTION: {name: 'BROADCAST_OPTION', value: '开始', id: 'broadcast-start'}
        }
    },
    send: {
        id: 'send',
        opcode: 'event_broadcast',
        parent: 'hat',
        next: null,
        topLevel: false,
        shadow: false,
        inputs: {
            BROADCAST_INPUT: {name: 'BROADCAST_INPUT', block: 'menu', shadow: 'menu'}
        },
        fields: {}
    },
    menu: {
        id: 'menu',
        opcode: 'event_broadcast_menu',
        parent: 'send',
        next: null,
        topLevel: false,
        shadow: true,
        inputs: {},
        fields: {
            BROADCAST_OPTION: {name: 'BROADCAST_OPTION', value: '开始', id: 'broadcast-start'}
        }
    }
});

describe('02Agent block graph validation', () => {
    test('accepts a connected graph with a valid broadcast menu', () => {
        const blocks = makeValidGraph();
        expect(validateBlockGraph(blocks, {scripts: ['hat']})).toMatchObject({
            valid: true,
            stats: {
                blockCount: 3,
                topLevelScriptCount: 1,
                reachableBlockCount: 3,
                orphanBlockCount: 0
            }
        });
        expect(validateRuntimeBroadcastBlocks(blocks)).toEqual({valid: true, errors: []});
    });

    test('rejects broken parent, next, input, ownership and reachability relationships', () => {
        const blocks = makeValidGraph();
        blocks.send.parent = 'missing';
        blocks.send.next = 'missing-next';
        blocks.hat.inputs.EXTRA = {name: 'EXTRA', block: 'menu', shadow: null};
        blocks.orphan = {
            id: 'orphan',
            opcode: 'looks_say',
            parent: 'hat',
            next: null,
            topLevel: false,
            shadow: false,
            inputs: {},
            fields: {}
        };
        const result = validateBlockGraph(blocks, {scripts: ['hat']});
        expect(result.valid).toBe(false);
        expect(result.errors.map(error => error.code)).toEqual(expect.arrayContaining([
            'missing_parent_reference',
            'missing_next_reference',
            'multiple_parents',
            'orphan_block'
        ]));
    });

    test('rejects malformed runtime and serialized broadcast inputs', () => {
        const runtimeBlocks = makeValidGraph();
        runtimeBlocks.send.inputs = {BROADCAST_OPTION: runtimeBlocks.send.inputs.BROADCAST_INPUT};
        expect(validateRuntimeBroadcastBlocks(runtimeBlocks).valid).toBe(false);

        const project = {
            targets: [{
                blocks: {
                    send: {
                        opcode: 'event_broadcast',
                        inputs: {BROADCAST_INPUT: [1, [11, '开始', 'broadcast-start', 'extra']]},
                        fields: {}
                    }
                }
            }]
        };
        expect(validateSerializedBroadcastSchema(project).valid).toBe(false);
    });

    test('keeps Chinese names intact through JSON round-trip', () => {
        const project = {
            targets: [{
                broadcasts: {'广播-id': '开始游戏'},
                variables: {'变量-id': ['分数', 0]},
                lists: {'列表-id': ['玩家列表', ['小明', '小红']]},
                blocks: {
                    receiver: {
                        opcode: 'event_whenbroadcastreceived',
                        inputs: {},
                        fields: {BROADCAST_OPTION: ['开始游戏', '广播-id']},
                        next: null,
                        parent: null,
                        shadow: false,
                        topLevel: true,
                        x: 0,
                        y: 0
                    }
                }
            }]
        };
        const decoded = JSON.parse(JSON.stringify(project));
        expect(decoded.targets[0].variables['变量-id'][0]).toBe('分数');
        expect(decoded.targets[0].lists['列表-id'][1]).toEqual(['小明', '小红']);
        expect(decoded.targets[0].blocks.receiver.fields.BROADCAST_OPTION).toEqual(['开始游戏', '广播-id']);
        expect(validateSerializedBroadcastSchema(decoded).valid).toBe(true);
    });

    test('converts broadcast DSL into connected menu blocks with stable IDs', () => {
        const blocks = jsToJson(`
            event.whenbroadcastreceived({ $field_BROADCAST_OPTION: "开始游戏", $xy: { x: 20, y: 30 } }, () => {
                event.broadcast({ BROADCAST_INPUT: "开始游戏" });
            });
        `);
        const byId = Object.fromEntries(blocks.map(block => [block.id, block]));
        const receiver = blocks.find(block => block.opcode === 'event_whenbroadcastreceived');
        const sender = blocks.find(block => block.opcode === 'event_broadcast');
        const menu = byId[sender.inputs.BROADCAST_INPUT.block];

        expect(menu).toMatchObject({
            opcode: 'event_broadcast_menu',
            parent: sender.id,
            shadow: true
        });
        expect(menu.fields.BROADCAST_OPTION.value).toBe('开始游戏');
        expect(menu.fields.BROADCAST_OPTION.id).toBe(receiver.fields.BROADCAST_OPTION.id);
        expect(validateBlockGraph(byId, {scripts: blocks.filter(block => block.topLevel).map(block => block.id)}).valid).toBe(true);
        expect(validateRuntimeBroadcastBlocks(byId)).toEqual({valid: true, errors: []});
    });
});
