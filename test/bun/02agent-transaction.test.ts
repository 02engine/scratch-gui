import {describe, expect, test} from 'bun:test';

let uidIndex = 0;
const workspace: any = {
    getAllVariables: () => [],
    getVariableById: () => null,
    getVariable: () => null,
    createVariable: () => undefined
};
(globalThis as any).window = {
    Blockly: {
        Utils: {genUid: () => `generated-${++uidIndex}`},
        getMainWorkspace: () => workspace
    },
    ScratchBlocks: {Events: {setGroup: () => undefined}}
};

const makeHarness = () => {
    const keep = {
        id: 'keep-script', opcode: 'event_whenflagclicked', inputs: {}, fields: {},
        next: 'keep-child', parent: null, topLevel: true, shadow: false, x: 10, y: 20
    };
    const keepChild = {
        id: 'keep-child', opcode: 'looks_say', fields: {}, next: null,
        inputs: {MESSAGE: {name: 'MESSAGE', block: 'keep-shadow', shadow: 'keep-shadow'}},
        parent: 'keep-script', topLevel: false, shadow: false
    };
    const keepShadow = {
        id: 'keep-shadow', opcode: 'text', inputs: {},
        fields: {TEXT: {name: 'TEXT', value: '保留内容'}},
        next: null, parent: 'keep-child', topLevel: false, shadow: true
    };
    const blocks: any = {
        _blocks: {'keep-script': keep, 'keep-child': keepChild, 'keep-shadow': keepShadow},
        _scripts: ['keep-script'], resetCache: () => undefined, updateTargetSpecificBlocks: () => undefined
    };
    const target: any = {
        id: 'stage', isStage: true, blocks, comments: {}, variables: {},
        createVariable(id: string, name: string, type: string) {
            this.variables[id] = {id, name, type, value: type === 'list' ? [] : name};
        },
        createComment: () => undefined
    };
    const otherTarget: any = {
        id: 'other', isStage: false,
        blocks: {_blocks: {'collision-id': {id: 'collision-id'}}, _scripts: []}, comments: {}, variables: {}
    };
    const runtime: any = {
        targets: [target, otherTarget],
        getTargetById: (id: string) => runtime.targets.find((item: any) => item.id === id),
        getTargetForStage: () => target,
        emitProjectChanged: () => undefined
    };
    const vm: any = {
        runtime, editingTarget: target,
        setEditingTarget: (id: string) => { vm.editingTarget = runtime.getTargetById(id); },
        emitWorkspaceUpdate: () => undefined,
        emitTargetsUpdate: () => undefined
    };
    return {vm, target, originalBlocks: blocks._blocks};
};

describe('02Agent target block transaction', () => {
    test('creates explicitly local variables on the sprite instead of the stage', async () => {
        const {resolveVariableReferences} = await import('../../src/addons/addons/02agent/workspaceRangeTools');
        const stage: any = {
            id: 'stage', isStage: true, variables: {},
            createVariable(id: string, name: string, type: string) {
                this.variables[id] = {id, name, type, value: 0};
            }
        };
        const sprite: any = {
            id: 'gamecore', isStage: false, variables: {},
            createVariable(id: string, name: string, type: string) {
                this.variables[id] = {id, name, type, value: 0};
            }
        };
        const vm: any = {editingTarget: sprite, runtime: {targets: [stage, sprite]}};
        const blocks: any[] = [{
            id: 'set-local',
            fields: {VARIABLE: {
                name: 'VARIABLE', value: 'MY_SLOT', id: 'gamecore-local-my-slot',
                variableType: '', scope: 'local'
            }}
        }, {
            id: 'set-global',
            fields: {VARIABLE: {
                name: 'VARIABLE', value: 'CORE_STATE', id: 'core-state',
                variableType: '', scope: 'global'
            }}
        }];

        resolveVariableReferences(vm, workspace, blocks, sprite, {commit: true, syncWorkspace: false});

        expect(sprite.variables['gamecore-local-my-slot']?.name).toBe('MY_SLOT');
        expect(stage.variables['gamecore-local-my-slot']).toBeUndefined();
        expect(stage.variables['core-state']?.name).toBe('CORE_STATE');
        expect(sprite.variables['core-state']).toBeUndefined();
    });

    test('preserves unchanged ids and avoids ids used by another target', async () => {
        uidIndex = 0;
        const {replaceTargetScriptsByUCFSections} = await import('../../src/addons/addons/02agent/workspaceRangeTools');
        const harness = makeHarness();
        const result: any = await replaceTargetScriptsByUCFSections(harness.vm, workspace, 'stage', [
            {scriptId: 'keep-script', code: 'event.whenflagclicked({ $xy: { x: 10, y: 20 } }, () => { looks.say({ MESSAGE: "保留内容" }); });', changed: false},
            {scriptId: 'collision-id', code: 'event.whenflagclicked({ $xy: { x: 50, y: 60 } }, () => { looks.say({ MESSAGE: "新脚本" }); });', changed: true}
        ], {includeComments: true, canCommit: () => true});

        expect(result.success).toBe(true);
        expect(harness.target.blocks._blocks['keep-script']).toBeDefined();
        expect(harness.target.blocks._blocks['keep-child']).toBeDefined();
        expect(harness.target.blocks._blocks['keep-shadow']).toBeDefined();
        expect(result.scriptIdMap['collision-id']).not.toBe('collision-id');
        expect(harness.target.blocks._blocks[result.scriptIdMap['collision-id']]).toBeDefined();

        await result.rollback();
        expect(harness.target.blocks._blocks).toBe(harness.originalBlocks);
        expect(harness.target.blocks._scripts).toEqual(['keep-script']);
    });

    test('does not mutate the VM when generation guard rejects commit', async () => {
        uidIndex = 0;
        const {replaceTargetScriptsByUCFSections} = await import('../../src/addons/addons/02agent/workspaceRangeTools');
        const harness = makeHarness();
        const beforeJson = JSON.stringify(harness.target.blocks._blocks);
        const result: any = await replaceTargetScriptsByUCFSections(harness.vm, workspace, 'stage', [
            {scriptId: 'keep-script', code: 'event.whenflagclicked({ $xy: { x: 10, y: 20 } }, () => { looks.say({ MESSAGE: "已修改" }); });', changed: true}
        ], {includeComments: true, canCommit: () => false});

        expect(result.success).toBe(false);
        expect(result.stage).toBe('project_switching');
        expect(JSON.stringify(harness.target.blocks._blocks)).toBe(beforeJson);
        expect(harness.target.blocks._blocks).toBe(harness.originalBlocks);
    });

    test('keeps the top-level id when replacing an existing script', async () => {
        uidIndex = 0;
        const {replaceTargetScriptsByUCFSections} = await import('../../src/addons/addons/02agent/workspaceRangeTools');
        const harness = makeHarness();
        const result: any = await replaceTargetScriptsByUCFSections(harness.vm, workspace, 'stage', [
            {scriptId: 'keep-script', code: 'event.whenflagclicked({ $xy: { x: 10, y: 20 } }, () => { looks.say({ MESSAGE: "替换内容" }); });', changed: true}
        ], {includeComments: true, canCommit: () => true});

        expect(result.success).toBe(true);
        expect(result.scriptIdMap['keep-script']).toBe('keep-script');
        expect(harness.target.blocks._blocks['keep-script']).toBeDefined();
        expect(harness.target.blocks._blocks['keep-child']).toBeUndefined();
    });

    test('aligns procedure definition and call argument ids across script sections', async () => {
        uidIndex = 0;
        const {replaceTargetScriptsByUCFSections} = await import('../../src/addons/addons/02agent/workspaceRangeTools');
        const harness = makeHarness();
        const result: any = await replaceTargetScriptsByUCFSections(harness.vm, workspace, 'stage', [
            {scriptId: 'keep-script', code: 'event.whenflagclicked({ $xy: { x: 10, y: 20 } }, () => { looks.say({ MESSAGE: "保留内容" }); });', changed: false},
            {scriptId: 'define-jump', code: 'define({ proccode: "jump %n[height]", info: ["warp"], $xy: { x: 80, y: 160 } }, () => { looks.say({ MESSAGE: argument.reporter_string_number({ $field_VALUE: "height" }) }); });', changed: true},
            {scriptId: 'call-jump', code: 'event.whenflagclicked({ $xy: { x: 80, y: 300 } }, () => { procedures.call({ $mutation: { proccode: "jump %n", warp: "true" }, $args: [10] }); });', changed: true}
        ], {includeComments: true, canCommit: () => true});

        expect(result.success).toBe(true);
        const blocks = Object.values(harness.target.blocks._blocks) as any[];
        const prototype = blocks.find(block => block.opcode === 'procedures_prototype');
        const call = blocks.find(block => block.opcode === 'procedures_call');
        expect(prototype).toBeDefined();
        expect(call).toBeDefined();
        expect(JSON.parse(call.mutation.argumentids)).toEqual(JSON.parse(prototype.mutation.argumentids));
        expect(Object.keys(call.inputs)).toEqual(JSON.parse(prototype.mutation.argumentids));
    });
});
