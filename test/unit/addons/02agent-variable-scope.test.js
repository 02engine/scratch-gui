import {jsToJson} from '../../../src/addons/addons/02agent/converter';

describe('02Agent variable scope', () => {
    test('converter preserves explicit local scope and stable variable id', () => {
        const blocks = jsToJson(`
            data.setvariableto({
                $field_VARIABLE: {value: "MY_SLOT", id: "gamecore-local-my-slot", variableType: "", scope: "local"},
                VALUE: 1
            });
        `);
        const field = blocks.find(block => block.opcode === 'data_setvariableto').fields.VARIABLE;
        expect(field).toMatchObject({
            value: 'MY_SLOT',
            id: 'gamecore-local-my-slot',
            variableType: '',
            scope: 'local'
        });
    });

});
