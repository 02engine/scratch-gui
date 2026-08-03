import VirtualMachine from 'scratch-vm';
import {validateBlockGraph, validateSerializedBroadcastSchema} from '../../../src/addons/addons/02agent/blockGraph';

const makeTargetBase = (overrides = {}) => ({
    isStage: false,
    name: '角色一',
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [],
    sounds: [],
    volume: 100,
    layerOrder: 1,
    visible: true,
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    draggable: false,
    rotationStyle: 'all around',
    ...overrides
});

const registerTestExtension = (vm, id, block) => {
    const extension = {
        getInfo: () => ({id, name: id, blocks: [block]}),
        [block.opcode]: value => value
    };
    const serviceName = vm.extensionManager._registerInternalExtension(extension);
    vm.extensionManager._loadedExtensions.set(id, serviceName);
};

const makeProject = () => ({
    targets: [
        makeTargetBase({
            isStage: true,
            name: 'Stage',
            layerOrder: 0,
            variables: {'变量-id': ['分数', 0]},
            lists: {'列表-id': ['玩家列表', ['小明', '小红']]},
            broadcasts: {'广播-id': '开始游戏'},
            blocks: {
                receiver: {
                    opcode: 'event_whenbroadcastreceived',
                    next: 'set-variable',
                    parent: null,
                    inputs: {},
                    fields: {BROADCAST_OPTION: ['开始游戏', '广播-id']},
                    shadow: false,
                    topLevel: true,
                    x: 20,
                    y: 30
                },
                'set-variable': {
                    opcode: 'data_setvariableto',
                    next: null,
                    parent: 'receiver',
                    inputs: {VALUE: [1, [10, '中文内容']]},
                    fields: {VARIABLE: ['分数', '变量-id']},
                    shadow: false,
                    topLevel: false
                }
            },
            tempo: 60,
            videoTransparency: 50,
            videoState: 'on',
            textToSpeechLanguage: null
        }),
        makeTargetBase({
            blocks: {
                flag: {
                    opcode: 'event_whenflagclicked',
                    next: 'broadcast-wait',
                    parent: null,
                    inputs: {},
                    fields: {},
                    shadow: false,
                    topLevel: true,
                    x: 40,
                    y: 50
                },
                'broadcast-wait': {
                    opcode: 'event_broadcastandwait',
                    next: 'repeat',
                    parent: 'flag',
                    inputs: {BROADCAST_INPUT: [1, [11, '开始游戏', '广播-id']]},
                    fields: {},
                    shadow: false,
                    topLevel: false
                },
                repeat: {
                    opcode: 'control_repeat', next: 'repeat-until', parent: 'broadcast-wait',
                    inputs: {TIMES: [1, [4, 2]], SUBSTACK: [2, 'if-else']}, fields: {}, shadow: false, topLevel: false
                },
                'if-else': {
                    opcode: 'control_if_else', next: null, parent: 'repeat',
                    inputs: {CONDITION: [2, 'equals'], SUBSTACK: [2, 'say-join'], SUBSTACK2: [2, 'thirdparty-command']},
                    fields: {}, shadow: false, topLevel: false
                },
                equals: {
                    opcode: 'operator_equals', next: null, parent: 'if-else',
                    inputs: {OPERAND1: [1, [10, '甲']], OPERAND2: [1, [10, '乙']]}, fields: {}, shadow: false, topLevel: false
                },
                'say-join': {
                    opcode: 'looks_say', next: null, parent: 'if-else',
                    inputs: {MESSAGE: [2, 'join']}, fields: {}, shadow: false, topLevel: false
                },
                join: {
                    opcode: 'operator_join', next: null, parent: 'say-join',
                    inputs: {STRING1: [1, [10, '你好']], STRING2: [2, 'json-reporter']}, fields: {}, shadow: false, topLevel: false
                },
                'json-reporter': {
                    opcode: 'json_parse', next: null, parent: 'join',
                    inputs: {TEXT: [1, [10, '{"名称":"角色"}']]}, fields: {}, shadow: false, topLevel: false
                },
                'thirdparty-command': {
                    opcode: 'thirdparty_run', next: null, parent: 'if-else',
                    inputs: {TEXT: [1, [10, '扩展内容']]}, fields: {}, shadow: false, topLevel: false
                },
                'repeat-until': {
                    opcode: 'control_repeat_until', next: 'create-clone', parent: 'repeat',
                    inputs: {CONDITION: [2, 'equals-until'], SUBSTACK: [2, 'wait']}, fields: {}, shadow: false, topLevel: false
                },
                'equals-until': {
                    opcode: 'operator_equals', next: null, parent: 'repeat-until',
                    inputs: {OPERAND1: [1, [10, '完成']], OPERAND2: [1, [10, '完成']]}, fields: {}, shadow: false, topLevel: false
                },
                wait: {
                    opcode: 'control_wait', next: null, parent: 'repeat-until',
                    inputs: {DURATION: [1, [5, 0.01]]}, fields: {}, shadow: false, topLevel: false
                },
                'create-clone': {
                    opcode: 'control_create_clone_of', next: null, parent: 'repeat-until',
                    inputs: {CLONE_OPTION: [1, [10, '_myself_']]}, fields: {}, shadow: false, topLevel: false
                },
                'clone-hat': {
                    opcode: 'control_start_as_clone', next: 'clone-if', parent: null,
                    inputs: {}, fields: {}, shadow: false, topLevel: true, x: 260, y: 50
                },
                'clone-if': {
                    opcode: 'control_if', next: null, parent: 'clone-hat',
                    inputs: {CONDITION: [2, 'clone-condition'], SUBSTACK: [2, 'delete-clone']},
                    fields: {}, shadow: false, topLevel: false
                },
                'clone-condition': {
                    opcode: 'operator_equals', next: null, parent: 'clone-if',
                    inputs: {OPERAND1: [1, [10, '克隆体']], OPERAND2: [1, [10, '克隆体']]},
                    fields: {}, shadow: false, topLevel: false
                },
                'delete-clone': {
                    opcode: 'control_delete_this_clone', next: null, parent: 'clone-if',
                    inputs: {}, fields: {}, shadow: false, topLevel: false
                }
            }
        })
    ],
    monitors: [],
    extensions: ['json', 'thirdparty'],
    meta: {semver: '3.0.0', vm: '3.0.0-02agent-test', agent: ''}
});

describe('02Agent SB3 round-trip', () => {
    test('broadcasts and UTF-8 data survive save, close and reopen', async () => {
        const firstVm = new VirtualMachine();
        registerTestExtension(firstVm, 'json', {
            opcode: 'parse', blockType: 'reporter', text: 'parse [TEXT]', arguments: {TEXT: {type: 'string', defaultValue: '{}'}}
        });
        registerTestExtension(firstVm, 'thirdparty', {
            opcode: 'run', blockType: 'command', text: 'run [TEXT]', arguments: {TEXT: {type: 'string', defaultValue: ''}}
        });
        await firstVm.loadProject(JSON.stringify(makeProject()));
        const firstSaved = JSON.parse(firstVm.toJSON());

        expect(validateSerializedBroadcastSchema(firstSaved)).toEqual({valid: true, errors: []});
        expect(firstSaved.targets[0].variables['变量-id'][0]).toBe('分数');
        expect(firstSaved.targets[0].lists['列表-id'][1]).toEqual(['小明', '小红']);
        expect(firstSaved.targets[0].broadcasts['广播-id']).toBe('开始游戏');

        const sb3 = await firstVm.saveProjectSb3('nodebuffer');
        firstVm.clear();
        await firstVm.loadProject(sb3);
        const secondSaved = JSON.parse(firstVm.toJSON());
        expect(validateSerializedBroadcastSchema(secondSaved)).toEqual({valid: true, errors: []});
        expect(secondSaved.targets[0].variables).toEqual(firstSaved.targets[0].variables);
        expect(secondSaved.targets[0].lists).toEqual(firstSaved.targets[0].lists);
        expect(secondSaved.targets[0].broadcasts).toEqual(firstSaved.targets[0].broadcasts);

        firstVm.runtime.targets.forEach(target => {
            const graph = validateBlockGraph(target.blocks._blocks, {scripts: target.blocks._scripts});
            expect(graph.valid).toBe(true);
            expect(graph.stats.orphanBlockCount).toBe(0);
        });
        firstVm.clear();
    });
});
