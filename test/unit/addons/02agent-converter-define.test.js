/**
 * Regression tests for the converter define-macro split (unrollDefineMacro)
 * and the shared blockCatalog single source.
 */
import {describe, expect, test} from '@jest/globals';

describe('02Agent converter define macro', () => {
    test('define({...}) unrolls to procedures_definition + procedures_prototype with reporter args', async () => {
        const {jsToJson, callGetBlockInfo} = await import(
            '../../../src/addons/addons/02agent/converter'
        );
        const json = jsToJson(`
define({info: [], proccode: "移动 [步数] 格", $args: [data.variable({$field_VARIABLE: "步数"})]});
        `);
        const blocks = (json && json.blocks) || json;
        const list = Array.isArray(blocks) ? blocks : Object.values(blocks || {});
        const def = list.find((b) => b.opcode === 'procedures_definition');
        const proto = list.find((b) => b.opcode === 'procedures_prototype');
        expect(def).toBeTruthy();
        expect(proto).toBeTruthy();
        expect(proto.mutation.proccode).toContain('移动');
        expect(proto.mutation.argumentids).not.toBe('[]');
        expect(def.inputs?.custom_block?.block).toBe(proto.id);
        expect(proto.shadow).toBe(true);
    });

    test('shared catalog fallback serves hat blocks through callGetBlockInfo', async () => {
        const {callGetBlockInfo} = await import(
            '../../../src/addons/addons/02agent/converter'
        );
        const info = callGetBlockInfo('event_whenflagclicked');
        expect(info.found).toBe(true);
        expect(info.text).toContain('绿旗');
        const clone = callGetBlockInfo('control_start_as_clone');
        expect(clone.found).toBe(true);
    });
});
