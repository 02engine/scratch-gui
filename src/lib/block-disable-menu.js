import {addContextMenu} from '../addons/contextmenu';

let blockDisableMenuInitialized = false;

const initializeBlockDisableMenu = tab => {
    if (blockDisableMenuInitialized) return;
    blockDisableMenuInitialized = true;

    addContextMenu(tab, ctx => {
        if (ctx.type !== 'blocks') return null;
        
        return {
            label: ctx.block?.isDisabled ? 'Enable Block' : 'Disable Block',
            callback: () => {
                if (ctx.block) {
                    const newDisabledState = !ctx.block.isDisabled;
                    ctx.block.setDisabled(newDisabledState);
                    
                    // Recursively disable/enable all child blocks
                    const toggleBlockTree = block => {
                        block.setDisabled(newDisabledState);
                        block.getChildren().forEach(child => {
                            if (child instanceof Blockly.Block) {
                                toggleBlockTree(child);
                            }
                        });
                    };
                    toggleBlockTree(ctx.block);
                    
                    // Refresh workspace to show visual changes
                    ctx.block.workspace.render();
                }
            },
            types: ['blocks'],
            order: 100
        };
    });
};

export default initializeBlockDisableMenu;
