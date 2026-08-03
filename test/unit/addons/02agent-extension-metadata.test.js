import ExtensionManager from 'scratch-vm/src/extension-support/extension-manager';

describe('02Engine extension metadata compatibility', () => {
    test('preserves Gandi-style named separators without treating them as blocks', () => {
        const manager = Object.create(ExtensionManager.prototype);
        const prepareBlockInfo = jest.fn((serviceName, blockInfo) => ({...blockInfo, prepared: true}));
        manager._prepareBlockInfo = prepareBlockInfo;

        const info = manager._prepareExtensionInfo('extension.test', {
            id: 'separatorTest',
            blocks: [
                '---',
                '---Drawing',
                '---🔖调用',
                {opcode: 'run', blockType: 'command', text: 'run'}
            ]
        });

        expect(info.blocks.slice(0, 3)).toEqual(['---', '---Drawing', '---🔖调用']);
        expect(prepareBlockInfo).toHaveBeenCalledTimes(1);
        expect(info.blocks[3]).toMatchObject({opcode: 'run', prepared: true});
    });
});
